import { storage } from "./storage";
import type { Player } from "@shared/schema";
import { updatePlayerStats } from "./modules/stats-aggregator";
import { RunDeduplicator } from "./modules/run-deduplicator";

const RAIDER_IO_BASE_URL = "https://raider.io/api/v1";

function extractRunIdFromUrl(url: string): string | null {
  const match = url.match(/\/(\d+)-/);
  return match ? match[1] : null;
}

const BATCH_SIZE = 500;
const SYNC_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes for full roster coverage
const CURRENT_SEASON = "season-tww-3";

interface RaiderIORosterMember {
  character: {
    name: string;
    realm: {
      slug: string;
      name: string;
    };
    class: {
      name: string;
    };
  };
}

interface RaiderIORun {
  dungeon: string;
  short_name: string;
  mythic_level: number;
  completed_at: string;
  clear_time_ms: number;
  par_time_ms: number;
  num_keystone_upgrades: number;
  score: number;
  url: string;
  affixes: { name: string }[];
  roster?: RaiderIORosterMember[];
}

interface RaiderIOProfile {
  name: string;
  realm: string;
  region: string;
  mythic_plus_scores_by_season?: {
    season: string;
    scores: {
      all: number;
      dps: number;
      healer: number;
      tank: number;
    };
  }[];
  mythic_plus_best_runs?: RaiderIORun[];
  mythic_plus_recent_runs?: RaiderIORun[];
  gear?: {
    item_level_equipped: number;
    item_level_total: number;
  };
  class: string;
  active_spec_name: string;
  race: string;
  thumbnail_url?: string;
}

interface SyncState {
  isRunning: boolean;
  periodicActive: boolean;
  currentBatch: number;
  totalBatches: number;
  lastSyncStart: Date | null;
  lastBatchCompleted: Date | null;
  nextSyncScheduled: Date | null;
  playersUpdated: number;
  playersSkipped: number;
  playersFailed: number;
  guildRunsFound: number;
}

const syncState: SyncState = {
  isRunning: false,
  periodicActive: false,
  currentBatch: 0,
  totalBatches: 0,
  lastSyncStart: null,
  lastBatchCompleted: null,
  nextSyncScheduled: null,
  playersUpdated: 0,
  playersSkipped: 0,
  playersFailed: 0,
  guildRunsFound: 0,
};

async function fetchPlayerFromRaiderIO(
  name: string,
  realm: string,
  region: string
): Promise<RaiderIOProfile | null> {
  try {
    const encodedName = encodeURIComponent(name);
    const encodedRealm = encodeURIComponent(realm.replace(/'/g, ""));
    
    // Include mythic_plus_recent_runs to get roster data for guild run detection
    const url = `${RAIDER_IO_BASE_URL}/characters/profile?region=${region}&realm=${encodedRealm}&name=${encodedName}&fields=mythic_plus_scores_by_season:current,mythic_plus_best_runs,mythic_plus_recent_runs,gear,thumbnail_url`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 400 || response.status === 404) {
        return null;
      }
      throw new Error(`Raider.IO API error: ${response.status}`);
    }

    return await response.json() as RaiderIOProfile;
  } catch (error) {
    console.error(`Error fetching Raider.IO data for ${name}-${realm}:`, error);
    return null;
  }
}

// Cache of all guild players for guild run detection
let guildPlayerCache: Map<string, Player> = new Map();

// Generate a unique key for a run to prevent duplicates
function generateRunKey(run: RaiderIORun): string {
  // Use the URL as it's unique per run, or create from dungeon + level + completed_at
  if (run.url) {
    // Extract run ID from URL like "https://raider.io/mythic-plus-runs/season-tww-2/123456-us"
    const urlParts = run.url.split('/');
    return urlParts[urlParts.length - 1];
  }
  return `${run.dungeon}-${run.mythic_level}-${new Date(run.completed_at).getTime()}`;
}

// Normalize realm name for comparison (handle special characters, spaces)
function normalizeRealm(realm: string): string {
  return realm.toLowerCase()
    .replace(/['\- ]/g, '')
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/ú/g, 'u');
}

// Check if a roster member matches a guild player
function findGuildPlayer(name: string, realm: string): Player | undefined {
  const normalizedName = name.toLowerCase();
  const normalizedRealm = normalizeRealm(realm);
  
  // Check by normalized name-realm key
  const key = `${normalizedName}-${normalizedRealm}`;
  
  return guildPlayerCache.get(key);
}

// Process runs to detect guild groups and create activity events
async function processGuildRuns(runs: RaiderIORun[]): Promise<number> {
  let eventsCreated = 0;
  
  for (const run of runs) {
    if (!run.roster || run.roster.length < 2) continue;
    
    // Find guild members in the roster
    const guildMembers: Player[] = [];
    
    for (const member of run.roster) {
      const memberName = member.character.name;
      const memberRealm = member.character.realm.name || member.character.realm.slug;
      const guildPlayer = findGuildPlayer(memberName, memberRealm);
      
      if (guildPlayer) {
        guildMembers.push(guildPlayer);
      }
    }
    
    // Need at least 2 guild members for a "guild run"
    if (guildMembers.length < 2) continue;
    
    const runKey = generateRunKey(run);
    
    // Check if we already recorded this guild run
    const existingRun = await storage.getGuildMythicRunByKey(runKey);
    if (existingRun) continue;
    
    // Create the guild run record
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
    
    // Create activity event for the guild run
    // Use the first guild member as the "primary" player for the event
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
    
    // Increment sync state counters for visibility in Admin Panel
    syncState.guildRunsFound++;
    eventsCreated++;
  }
  
  return eventsCreated;
}

// Refresh the guild player cache
async function refreshGuildPlayerCache(): Promise<void> {
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
  profile: RaiderIOProfile
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

// Fetch run details with roster for guild run detection
async function fetchRunDetailsWithRoster(runIds: number[]): Promise<RaiderIORun[]> {
  const runsWithRoster: RaiderIORun[] = [];
  
  // Fetch ALL recent runs to maximize guild run detection coverage
  const limitedRunIds = runIds;
  
  for (const runId of limitedRunIds) {
    try {
      const url = `${RAIDER_IO_BASE_URL}/mythic-plus/run-details?season=${CURRENT_SEASON}&id=${runId}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const runDetails = await response.json();
        
        if (runDetails.roster && runDetails.roster.length > 0) {
          const run: RaiderIORun = {
            dungeon: runDetails.dungeon?.name || "Unknown",
            short_name: runDetails.dungeon?.short_name || "",
            mythic_level: runDetails.mythic_level,
            completed_at: runDetails.completed_at,
            clear_time_ms: runDetails.clear_time_ms,
            par_time_ms: runDetails.keystone_time_ms,
            num_keystone_upgrades: runDetails.num_chests || 0,
            score: runDetails.score || 0,
            url: `https://raider.io/mythic-plus-runs/${CURRENT_SEASON}/${runId}-${runDetails.mythic_level}-${runDetails.dungeon?.slug || 'unknown'}`,
            affixes: runDetails.weekly_modifiers || [],
            roster: runDetails.roster.map((member: any) => ({
              character: {
                name: member.character.name,
                realm: {
                  slug: member.character.realm?.slug || "",
                  name: member.character.realm?.name || "",
                },
                class: {
                  name: member.character.class?.name || "",
                },
              },
            })),
          };
          runsWithRoster.push(run);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      // Continue on error
    }
  }
  
  return runsWithRoster;
}

async function syncPlayer(
  player: Player,
  region: string
): Promise<"updated" | "skipped" | "failed"> {
  const profile = await fetchPlayerFromRaiderIO(player.name, player.realm, region);
  
  if (!profile) {
    return "failed";
  }

  // Fetch run details with roster for guild group detection
  if (profile.mythic_plus_recent_runs && profile.mythic_plus_recent_runs.length > 0) {
    // Extract run IDs from recent runs (from the URL)
    const runIds: number[] = [];
    for (const run of profile.mythic_plus_recent_runs) {
      if (run.url) {
        // Extract keystone_run_id from URL like "...runs/season-tww-3/12345-..."
        const match = run.url.match(/\/(\d+)-/);
        if (match) {
          runIds.push(parseInt(match[1], 10));
        }
      }
    }
    
    if (runIds.length > 0) {
      const runsWithRoster = await fetchRunDetailsWithRoster(runIds);
      if (runsWithRoster.length > 0) {
        await processGuildRuns(runsWithRoster);
      }
    }
  }

  if (!hasPlayerDataChanged(player, profile)) {
    await storage.updatePlayer(player.id, { lastRioSync: new Date() });
    return "skipped";
  }

  const newScore = Math.round(profile.mythic_plus_scores_by_season?.[0]?.scores?.all || 0);
  const newItemLevel = Math.round(profile.gear?.item_level_equipped || 0);

  await storage.updatePlayer(player.id, {
    mythicScore: newScore,
    itemLevel: newItemLevel,
    class: profile.class,
    spec: profile.active_spec_name,
    race: profile.race,
    avatarUrl: profile.thumbnail_url || null,
    lastRioSync: new Date(),
  });

  const bestRuns = profile.mythic_plus_best_runs || [];
  const recentRuns = profile.mythic_plus_recent_runs || [];
  
  const seenUrls = new Set<string>();
  const allRuns: RaiderIORun[] = [];
  
  for (const run of recentRuns) {
    if (!seenUrls.has(run.url)) {
      seenUrls.add(run.url);
      allRuns.push(run);
    }
  }
  for (const run of bestRuns) {
    if (!seenUrls.has(run.url)) {
      seenUrls.add(run.url);
      allRuns.push(run);
    }
  }
  
  if (allRuns.length > 0) {
    const existingRuns = await storage.getMythicRuns(player.id);
    const deduplicator = new RunDeduplicator(existingRuns);
    const existingRunsForStats: { dungeon: string; keyLevel: number; timestamp: Date; url: string | null }[] = [...existingRuns];

    for (const run of allRuns.slice(0, 10)) {
      const isNewRun = deduplicator.isNewRun(run);

      await storage.upsertMythicRun({
        playerId: player.id,
        dungeon: run.dungeon,
        keyLevel: run.mythic_level,
        completionTime: Math.round(run.clear_time_ms / 1000),
        timerPercent: (run.par_time_ms / run.clear_time_ms) * 100,
        score: Math.round(run.score),
        affixes: run.affixes.map(a => a.name),
        timestamp: new Date(run.completed_at),
        url: run.url,
        clearTimeMs: run.clear_time_ms,
        parTimeMs: run.par_time_ms,
      });

      deduplicator.markAsSeen(run);

      if (isNewRun) {
        await updatePlayerStats(player.id, {
          dungeon: run.dungeon,
          keyLevel: run.mythic_level,
          clearTimeMs: run.clear_time_ms,
          parTimeMs: run.par_time_ms,
        }, existingRunsForStats);
        existingRunsForStats.push({
          dungeon: run.dungeon,
          keyLevel: run.mythic_level,
          timestamp: new Date(run.completed_at),
          url: run.url || null,
        });
      }
    }

    await storage.deleteOldMythicRuns(player.id, 5);
  }

  return "updated";
}

async function getPlayersToSync(): Promise<Player[]> {
  const players = await storage.getPlayers();
  const activePlayers = players.filter(p => p.isActive);
  
  // Sort by lastRioSync (oldest first) with randomization for players synced at similar times
  // This ensures we rotate through different players each batch
  return activePlayers.sort((a, b) => {
    const aSync = a.lastRioSync?.getTime() || 0;
    const bSync = b.lastRioSync?.getTime() || 0;
    
    // If synced within same hour, randomize order to avoid always picking same players
    const oneHour = 60 * 60 * 1000;
    if (Math.abs(aSync - bSync) < oneHour) {
      return Math.random() - 0.5;
    }
    
    return aSync - bSync;
  });
}

async function syncBatch(players: Player[], region: string): Promise<void> {
  // Refresh the guild player cache before processing this batch
  await refreshGuildPlayerCache();
  
  for (const player of players) {
    const result = await syncPlayer(player, region);
    
    switch (result) {
      case "updated":
        syncState.playersUpdated++;
        break;
      case "skipped":
        syncState.playersSkipped++;
        break;
      case "failed":
        syncState.playersFailed++;
        break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

export async function startRaiderIOSync(region: string = "us"): Promise<void> {
  if (syncState.isRunning) {
    console.log("Raider.IO sync already in progress");
    return;
  }

  syncState.isRunning = true;
  syncState.lastSyncStart = new Date();
  syncState.playersUpdated = 0;
  syncState.playersSkipped = 0;
  syncState.playersFailed = 0;

  console.log("Starting Raider.IO sync cycle...");

  try {
    const allPlayers = await getPlayersToSync();
    const totalBatches = Math.ceil(allPlayers.length / BATCH_SIZE);
    syncState.totalBatches = totalBatches;

    for (let i = 0; i < totalBatches; i++) {
      syncState.currentBatch = i + 1;
      
      const batchStart = i * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, allPlayers.length);
      const batch = allPlayers.slice(batchStart, batchEnd);

      console.log(`Processing batch ${i + 1}/${totalBatches} (${batch.length} players)`);
      
      await syncBatch(batch, region);

      if (i < totalBatches - 1) {
        console.log(`Waiting ${SYNC_INTERVAL_MS / 1000}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, SYNC_INTERVAL_MS));
      }
    }

    console.log(`Raider.IO sync complete: ${syncState.playersUpdated} updated, ${syncState.playersSkipped} skipped, ${syncState.playersFailed} failed`);
    
    await storage.createAdminAuditLog({
      action: "raiderio_sync",
      details: `Synced ${syncState.playersUpdated} updated, ${syncState.playersSkipped} skipped, ${syncState.playersFailed} failed`,
      value: syncState.playersUpdated,
    });
  } catch (error) {
    console.error("Raider.IO sync error:", error);
  } finally {
    syncState.isRunning = false;
  }
}

export async function syncNextBatch(region: string = "us"): Promise<{
  batch: number;
  totalBatches: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  if (syncState.isRunning) {
    return {
      batch: syncState.currentBatch,
      totalBatches: syncState.totalBatches,
      updated: 0,
      skipped: 0,
      failed: 0,
    };
  }

  syncState.isRunning = true;
  syncState.lastSyncStart = new Date();
  
  // Refresh guild player cache BEFORE processing runs so guild detection works
  await refreshGuildPlayerCache();
  
  try {
    const allPlayers = await getPlayersToSync();
    const totalBatches = Math.ceil(allPlayers.length / BATCH_SIZE);
    syncState.totalBatches = totalBatches;
    syncState.currentBatch++;
    
    if (syncState.currentBatch > totalBatches) {
      syncState.currentBatch = 1;
    }
    
    const startIdx = (syncState.currentBatch - 1) * BATCH_SIZE;
    const batch = allPlayers.slice(startIdx, startIdx + BATCH_SIZE);
    
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const player of batch) {
      const result = await syncPlayer(player, region);
      switch (result) {
        case "updated":
          updated++;
          syncState.playersUpdated++;
          break;
        case "skipped":
          skipped++;
          syncState.playersSkipped++;
          break;
        case "failed":
          failed++;
          syncState.playersFailed++;
          break;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return {
      batch: syncState.currentBatch,
      totalBatches,
      updated,
      skipped,
      failed,
    };
  } finally {
    syncState.isRunning = false;
  }
}

export function getSyncState(): SyncState {
  return { ...syncState };
}

export async function triggerSinglePlayerSync(
  playerId: string,
  region: string = "us"
): Promise<boolean> {
  const players = await storage.getPlayers();
  const player = players.find(p => p.id === playerId);
  
  if (!player) {
    return false;
  }

  // Refresh guild player cache before sync so guild detection works
  await refreshGuildPlayerCache();
  
  const result = await syncPlayer(player, region);
  return result !== "failed";
}

// Deep sync - fetches ALL available M+ runs from RaiderIO for comprehensive stats
// Uses expanded API fields (alternate_runs, highest_level_runs) for more complete run history
// Also fetches run details with roster for guild run detection
export async function triggerDeepPlayerSync(
  playerId: string,
  region: string = "us"
): Promise<{ success: boolean; runsFound: number; newRuns: number; error?: string }> {
  const player = await storage.getPlayer(playerId);
  
  if (!player) {
    return { success: false, runsFound: 0, newRuns: 0, error: "Player not found" };
  }

  try {
    // Refresh guild player cache for guild run detection
    await refreshGuildPlayerCache();
    
    const encodedName = encodeURIComponent(player.name);
    const encodedRealm = encodeURIComponent(player.realm.replace(/'/g, ""));
    
    // Fetch ALL available run types from RaiderIO for comprehensive coverage
    const url = `${RAIDER_IO_BASE_URL}/characters/profile?region=${region}&realm=${encodedRealm}&name=${encodedName}&fields=mythic_plus_scores_by_season:current,mythic_plus_best_runs,mythic_plus_recent_runs,mythic_plus_alternate_runs,mythic_plus_highest_level_runs,gear,thumbnail_url`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 400 || response.status === 404) {
        console.log(`Deep sync: Player ${player.name} not found on Raider.IO`);
        await storage.updatePlayer(player.id, { lastRioSync: new Date() });
        return { success: false, runsFound: 0, newRuns: 0, error: "Player not found on Raider.IO" };
      }
      console.error(`Deep sync failed for ${player.name}: HTTP ${response.status}`);
      return { success: false, runsFound: 0, newRuns: 0, error: `Raider.IO API error: ${response.status}` };
    }

    const profile = await response.json() as RaiderIOProfile & {
      mythic_plus_alternate_runs?: RaiderIORun[];
      mythic_plus_highest_level_runs?: RaiderIORun[];
    };

    // Update player profile data
    const newScore = Math.round(profile.mythic_plus_scores_by_season?.[0]?.scores?.all || 0);
    const newItemLevel = Math.round(profile.gear?.item_level_equipped || 0);

    await storage.updatePlayer(player.id, {
      mythicScore: newScore,
      itemLevel: newItemLevel,
      class: profile.class,
      spec: profile.active_spec_name,
      race: profile.race,
      avatarUrl: profile.thumbnail_url || null,
      lastRioSync: new Date(),
    });

    // Combine ALL run sources and deduplicate by URL
    const bestRuns = profile.mythic_plus_best_runs || [];
    const recentRuns = profile.mythic_plus_recent_runs || [];
    const alternateRuns = profile.mythic_plus_alternate_runs || [];
    const highestRuns = profile.mythic_plus_highest_level_runs || [];
    
    const seenUrls = new Set<string>();
    const allRuns: RaiderIORun[] = [];
    
    // Process all run sources (prioritize recent, then best, then alternate, then highest)
    for (const runList of [recentRuns, bestRuns, alternateRuns, highestRuns]) {
      for (const run of runList) {
        if (run.url && !seenUrls.has(run.url)) {
          seenUrls.add(run.url);
          allRuns.push(run);
        }
      }
    }

    console.log(`Deep sync for ${player.name}: Found ${allRuns.length} unique runs from all sources`);

    if (allRuns.length === 0) {
      return { success: true, runsFound: 0, newRuns: 0 };
    }

    // Fetch run details with roster for guild run detection (same as regular sync)
    const runIds: number[] = [];
    for (const run of allRuns) {
      if (run.url) {
        const match = run.url.match(/\/(\d+)-/);
        if (match) {
          runIds.push(parseInt(match[1], 10));
        }
      }
    }
    
    if (runIds.length > 0) {
      const runsWithRoster = await fetchRunDetailsWithRoster(runIds);
      if (runsWithRoster.length > 0) {
        await processGuildRuns(runsWithRoster);
      }
    }

    // Get existing runs for deduplication using RunDeduplicator
    const existingRuns = await storage.getMythicRuns(player.id);
    const deduplicator = new RunDeduplicator(existingRuns);
    const existingRunsForStats: { dungeon: string; keyLevel: number; timestamp: Date; url: string | null }[] = [...existingRuns];
    
    let newRunsCount = 0;

    // Process all runs (not limited to 10 like regular sync)
    for (const run of allRuns) {
      const isNewRun = deduplicator.isNewRun(run);
      
      await storage.upsertMythicRun({
        playerId: player.id,
        dungeon: run.dungeon,
        keyLevel: run.mythic_level,
        completionTime: Math.round(run.clear_time_ms / 1000),
        timerPercent: (run.par_time_ms / run.clear_time_ms) * 100,
        score: Math.round(run.score),
        affixes: run.affixes.map(a => a.name),
        timestamp: new Date(run.completed_at),
        url: run.url,
        clearTimeMs: run.clear_time_ms,
        parTimeMs: run.par_time_ms,
      });

      deduplicator.markAsSeen(run);

      if (isNewRun) {
        newRunsCount++;
        await updatePlayerStats(player.id, {
          dungeon: run.dungeon,
          keyLevel: run.mythic_level,
          clearTimeMs: run.clear_time_ms,
          parTimeMs: run.par_time_ms,
        }, existingRunsForStats);
        existingRunsForStats.push({
          dungeon: run.dungeon,
          keyLevel: run.mythic_level,
          timestamp: new Date(run.completed_at),
          url: run.url || null,
        });
      }
    }

    // Keep only 5 most recent runs in DB
    await storage.deleteOldMythicRuns(player.id, 5);

    console.log(`Deep sync complete for ${player.name}: ${allRuns.length} total runs processed, ${newRunsCount} new runs added to stats`);
    
    return { success: true, runsFound: allRuns.length, newRuns: newRunsCount };
  } catch (error) {
    console.error(`Deep sync error for ${player.name}:`, error);
    return { success: false, runsFound: 0, newRuns: 0, error: "Internal sync error" };
  }
}

let syncIntervalId: NodeJS.Timeout | null = null;

export function startPeriodicSync(region: string = "us"): void {
  if (syncIntervalId) {
    console.log("Periodic sync already running");
    return;
  }

  console.log(`Starting periodic Raider.IO sync (every ${SYNC_INTERVAL_MS / 1000}s)`);
  syncState.periodicActive = true;
  
  syncNextBatch(region).then(result => {
    console.log(`Initial batch sync: ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`);
    syncState.lastBatchCompleted = new Date();
    syncState.nextSyncScheduled = new Date(Date.now() + SYNC_INTERVAL_MS);
  });

  syncIntervalId = setInterval(async () => {
    try {
      syncState.nextSyncScheduled = null;
      const result = await syncNextBatch(region);
      console.log(`Batch ${result.batch}/${result.totalBatches}: ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`);
      syncState.lastBatchCompleted = new Date();
      syncState.nextSyncScheduled = new Date(Date.now() + SYNC_INTERVAL_MS);
    } catch (error) {
      console.error("Periodic sync error:", error);
    }
  }, SYNC_INTERVAL_MS);
}

export function stopPeriodicSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    syncState.periodicActive = false;
    syncState.nextSyncScheduled = null;
    console.log("Periodic Raider.IO sync stopped");
  }
}

interface GuildMember {
  character: {
    name: string;
    realm: string;
    class: string;
    active_spec_name?: string;
    race?: string;
  };
  rank: number;
}

function getRankName(rank: number): string {
  const ranks = [
    "Guild Master",
    "Officer",
    "Officer Alt",
    "Raider",
    "Member",
    "Trial",
    "Alt",
    "Initiate",
    "Social",
  ];
  return ranks[rank] || "Member";
}

interface GuildProfile {
  name: string;
  realm: string;
  region: string;
  faction: string;
  members: GuildMember[];
}

export async function importGuildRoster(
  guildName: string,
  realm: string,
  region: string
): Promise<{ imported: number; skipped: number; failed: number }> {
  console.log(`Importing guild roster for ${guildName}-${realm} (${region})...`);
  
  try {
    const encodedGuild = encodeURIComponent(guildName);
    const encodedRealm = encodeURIComponent(realm.replace(/'/g, ""));
    
    const url = `${RAIDER_IO_BASE_URL}/guilds/profile?region=${region}&realm=${encodedRealm}&name=${encodedGuild}&fields=members`;
    
    console.log(`Fetching guild from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Guild fetch failed: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch guild: ${response.status}`);
    }
    
    const guildData = await response.json() as GuildProfile;
    
    if (!guildData.members || guildData.members.length === 0) {
      console.log("No members found in guild");
      return { imported: 0, skipped: 0, failed: 0 };
    }
    
    console.log(`Found ${guildData.members.length} members in guild`);
    
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    
    const existingPlayers = await storage.getPlayers();
    const existingNames = new Set(
      existingPlayers.map(p => `${p.name.toLowerCase()}-${p.realm.toLowerCase()}`)
    );
    
    for (const member of guildData.members) {
      try {
        const playerKey = `${member.character.name.toLowerCase()}-${member.character.realm.toLowerCase()}`;
        
        if (existingNames.has(playerKey)) {
          skipped++;
          continue;
        }
        
        await storage.createPlayer({
          name: member.character.name,
          realm: member.character.realm,
          class: member.character.class,
          spec: member.character.active_spec_name || "",
          race: member.character.race || "",
          guildRank: getRankName(member.rank),
          itemLevel: 0,
          mythicScore: 0,
          messagesCount: 0,
          isActive: true,
        });
        
        imported++;
        existingNames.add(playerKey);
        
      } catch (error) {
        console.error(`Failed to import ${member.character.name}:`, error);
        failed++;
      }
    }
    
    console.log(`Guild import complete: ${imported} imported, ${skipped} skipped, ${failed} failed`);
    
    return { imported, skipped, failed };
    
  } catch (error) {
    console.error("Guild import error:", error);
    throw error;
  }
}

interface GuildRankings {
  raid?: {
    realm: number;
    region: number;
    world: number;
  };
  mythic_plus?: {
    realm: number;
    region: number;
    world: number;
  };
}

interface GuildProfileWithRanks {
  name: string;
  realm: string;
  region: string;
  raid_rankings?: GuildRankings["raid"];
  mythic_plus_rankings?: GuildRankings["mythic_plus"];
}

export async function getGuildRealmRank(
  guildName: string,
  realm: string,
  region: string
): Promise<{ realmRank: number | null; type: "raid" | "mythic_plus" }> {
  try {
    const encodedGuild = encodeURIComponent(guildName);
    const encodedRealm = encodeURIComponent(realm.replace(/'/g, ""));
    
    const url = `${RAIDER_IO_BASE_URL}/guilds/profile?region=${region}&realm=${encodedRealm}&name=${encodedGuild}&fields=raid_rankings,mythic_plus_rankings`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Guild rank fetch failed: ${response.status}`);
      return { realmRank: null, type: "mythic_plus" };
    }
    
    const guildData = await response.json() as GuildProfileWithRanks;
    
    if (guildData.raid_rankings?.realm) {
      return { realmRank: guildData.raid_rankings.realm, type: "raid" };
    }
    
    if (guildData.mythic_plus_rankings?.realm) {
      return { realmRank: guildData.mythic_plus_rankings.realm, type: "mythic_plus" };
    }
    
    return { realmRank: null, type: "mythic_plus" };
  } catch (error) {
    console.error("Guild rank fetch error:", error);
    return { realmRank: null, type: "mythic_plus" };
  }
}

