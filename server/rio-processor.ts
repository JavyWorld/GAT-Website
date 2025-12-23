import { storage } from "./storage";
import type { Player } from "@shared/schema";
import { SPEC_ROLE_MAP } from "@shared/schema";
import type { FetchedPlayerData, RaiderIORun } from "./rio-fetcher";
import { updatePlayerStats } from "./stats-aggregator";

let guildPlayerCache: Map<string, Player> = new Map();

export interface ProcessResult {
  playerId: string;
  updated: boolean;
  newRunsDetected: number;
  guildRunsCreated: number;
}

function normalizeRealm(realm: string): string {
  return realm.toLowerCase()
    .replace(/['\- ]/g, '')
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/ú/g, 'u');
}

function generateRunKey(run: RaiderIORun): string {
  if (run.url) {
    const urlParts = run.url.split('/');
    return urlParts[urlParts.length - 1];
  }
  return `${run.dungeon}-${run.mythic_level}-${new Date(run.completed_at).getTime()}`;
}

function findGuildPlayer(name: string, realm: string): Player | undefined {
  const normalizedName = name.toLowerCase();
  const normalizedRealm = normalizeRealm(realm);
  const key = `${normalizedName}-${normalizedRealm}`;
  return guildPlayerCache.get(key);
}

export async function refreshGuildPlayerCache(): Promise<void> {
  const allPlayers = await storage.getPlayers();
  guildPlayerCache.clear();
  
  for (const player of allPlayers) {
    if (player.isActive) {
      const key = `${player.name.toLowerCase()}-${normalizeRealm(player.realm)}`;
      guildPlayerCache.set(key, player);
    }
  }
}

function hasPlayerDataChanged(
  player: Player,
  profile: FetchedPlayerData["profile"]
): boolean {
  const newScore = Math.round(profile.mythic_plus_scores_by_season?.[0]?.scores?.all || 0);
  const newItemLevel = Math.round(profile.gear?.item_level_equipped || 0);
  const newSpec = profile.active_spec_name || "";
  const newRace = profile.race || "";
  const newClass = profile.class || "";
  const newThumbnail = profile.thumbnail_url || "";

  return (
    player.mythicScore !== newScore ||
    player.itemLevel !== newItemLevel ||
    player.spec !== newSpec ||
    player.race !== newRace ||
    player.class !== newClass ||
    player.avatarUrl !== newThumbnail
  );
}

async function processGuildRuns(runs: RaiderIORun[], syncState: { guildRunsFound: number }): Promise<number> {
  let eventsCreated = 0;
  
  for (const run of runs) {
    if (!run.roster || run.roster.length < 2) continue;
    
    const guildMembers: Player[] = [];
    
    for (const member of run.roster) {
      const guildPlayer = findGuildPlayer(
        member.character.name,
        member.character.realm.name || member.character.realm.slug
      );
      if (guildPlayer) {
        guildMembers.push(guildPlayer);
      }
    }
    
    if (guildMembers.length < 2) continue;
    
    const runKey = generateRunKey(run);
    
    const existingRun = await storage.getGuildMythicRunByKey(runKey);
    if (existingRun) continue;
    
    const completedAt = new Date(run.completed_at);
    
    await storage.createGuildMythicRun({
      runKey,
      dungeon: run.dungeon,
      mythicLevel: run.mythic_level,
      completedAt,
      clearTimeMs: run.clear_time_ms,
      parTimeMs: run.par_time_ms,
      score: Math.round(run.score),
      keystoneUpgrades: run.num_keystone_upgrades || 0,
      guildPlayerIds: guildMembers.map(p => p.id),
      guildPlayerNames: guildMembers.map(p => p.name),
      totalGuildMembers: guildMembers.length,
    });
    
    const primaryPlayer = guildMembers[0];
    
    const title = `Completed ${run.dungeon} +${run.mythic_level}`;
    const description = guildMembers.length > 1 
      ? `Guild group: ${guildMembers.map(p => p.name).join(', ')}`
      : undefined;
    
    await storage.createActivityEvent({
      type: "guild_mythic_run",
      playerId: primaryPlayer.id,
      playerName: primaryPlayer.name,
      playerClass: primaryPlayer.class,
      title,
      description,
      value: run.mythic_level,
      timestamp: completedAt,
    });
    
    syncState.guildRunsFound++;
    eventsCreated++;
  }
  
  return eventsCreated;
}

export async function processPlayerData(
  data: FetchedPlayerData,
  player: Player,
  syncState: { guildRunsFound: number }
): Promise<ProcessResult> {
  const result: ProcessResult = {
    playerId: player.id,
    updated: false,
    newRunsDetected: 0,
    guildRunsCreated: 0,
  };

  result.guildRunsCreated = await processGuildRuns(data.runsWithRoster, syncState);

  const existingRuns = await storage.getMythicRuns(player.id);
  const existingRunKeys = new Set(existingRuns.map((r) => `${r.dungeon}-${r.keyLevel}-${r.timestamp.getTime()}`));

  if (data.profile.mythic_plus_recent_runs) {
    const newRuns: RaiderIORun[] = [];
    
    for (const run of data.profile.mythic_plus_recent_runs.slice(0, 8)) {
      const runKey = `${run.dungeon}-${run.mythic_level}-${new Date(run.completed_at).getTime()}`;
      if (!existingRunKeys.has(runKey)) {
        newRuns.push(run);
      }
    }

    for (const run of newRuns) {
      const specName = data.profile.active_spec_name || "";
      const role = SPEC_ROLE_MAP[specName] || "dps";
      
      await storage.upsertMythicRun({
        playerId: player.id,
        dungeon: run.dungeon,
        keyLevel: run.mythic_level,
        completionTime: run.clear_time_ms,
        timerPercent: (run.clear_time_ms / run.par_time_ms) * 100,
        score: Math.round(run.score),
        affixes: run.affixes.map(a => a.name),
        timestamp: new Date(run.completed_at),
        clearTimeMs: run.clear_time_ms,
        parTimeMs: run.par_time_ms,
        role: role,
        spec: specName,
      });
      
      result.newRunsDetected++;
      
      await updatePlayerStats(player.id, run);
    }

    await storage.deleteOldMythicRuns(player.id, 5);
  }

  if (hasPlayerDataChanged(player, data.profile)) {
    const newScore = Math.round(data.profile.mythic_plus_scores_by_season?.[0]?.scores?.all || 0);
    const newItemLevel = Math.round(data.profile.gear?.item_level_equipped || 0);

    await storage.updatePlayer(player.id, {
      mythicScore: newScore,
      itemLevel: newItemLevel,
      class: data.profile.class,
      spec: data.profile.active_spec_name,
      race: data.profile.race,
      avatarUrl: data.profile.thumbnail_url || null,
      lastRioSync: new Date(),
    });
    
    result.updated = true;
  } else {
    await storage.updatePlayer(player.id, { lastRioSync: new Date() });
  }

  return result;
}
