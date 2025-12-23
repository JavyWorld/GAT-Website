import { storage } from "./storage";

const RAIDER_IO_BASE_URL = "https://raider.io/api/v1";

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
  mythic_plus_best_runs?: {
    dungeon: string;
    short_name: string;
    mythic_level: number;
    completed_at: string;
    clear_time_ms: number;
    par_time_ms: number;
    score: number;
    affixes: { name: string }[];
  }[];
  mythic_plus_recent_runs?: {
    dungeon: string;
    short_name: string;
    mythic_level: number;
    completed_at: string;
    clear_time_ms: number;
    par_time_ms: number;
    score: number;
    affixes: { name: string }[];
  }[];
  gear?: {
    item_level_equipped: number;
    item_level_total: number;
  };
  class: string;
  active_spec_name: string;
  race: string;
}

async function fetchPlayerFromRaiderIO(
  name: string,
  realm: string,
  region: string
): Promise<RaiderIOProfile | null> {
  try {
    const encodedName = encodeURIComponent(name);
    const encodedRealm = encodeURIComponent(realm.replace(/'/g, ""));
    
    const url = `${RAIDER_IO_BASE_URL}/characters/profile?region=${region}&realm=${encodedRealm}&name=${encodedName}&fields=mythic_plus_scores_by_season:current,mythic_plus_recent_runs,gear`;
    
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

export async function updatePlayerMythicData(
  name: string,
  realm: string,
  region: string = "us"
): Promise<boolean> {
  const profile = await fetchPlayerFromRaiderIO(name, realm, region);
  
  if (!profile) {
    return false;
  }

  const player = await storage.getPlayerByName(name, realm);
  if (!player) {
    return false;
  }

  const currentSeasonScore = profile.mythic_plus_scores_by_season?.[0]?.scores?.all || 0;
  const itemLevel = profile.gear?.item_level_equipped || 0;

  await storage.updatePlayer(player.id, {
    mythicScore: Math.round(currentSeasonScore),
    itemLevel,
    spec: profile.active_spec_name,
    race: profile.race,
  });

  if (profile.mythic_plus_recent_runs) {
    for (const run of profile.mythic_plus_recent_runs.slice(0, 8)) {
      await storage.upsertMythicRun({
        playerId: player.id,
        dungeon: run.dungeon,
        keyLevel: run.mythic_level,
        completionTime: run.clear_time_ms,
        timerPercent: (run.clear_time_ms / run.par_time_ms) * 100,
        score: Math.round(run.score),
        affixes: run.affixes.map(a => a.name),
        timestamp: new Date(run.completed_at),
      });
    }
  }

  return true;
}

export async function syncAllPlayersWithRaiderIO(region: string = "us"): Promise<{
  updated: number;
  failed: number;
  total: number;
}> {
  const players = await storage.getPlayers();
  const activePlayers = players.filter(p => p.isActive);
  
  let updated = 0;
  let failed = 0;

  for (const player of activePlayers) {
    const success = await updatePlayerMythicData(player.name, player.realm, region);
    if (success) {
      updated++;
    } else {
      failed++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return {
    updated,
    failed,
    total: activePlayers.length,
  };
}

export async function fetchRaiderIODataForPlayer(
  name: string,
  realm: string,
  region: string = "us"
): Promise<{
  mythicScore: number;
  itemLevel: number;
  spec: string;
  race: string;
  bestRuns: {
    dungeon: string;
    keyLevel: number;
    score: number;
  }[];
} | null> {
  const profile = await fetchPlayerFromRaiderIO(name, realm, region);
  
  if (!profile) {
    return null;
  }

  return {
    mythicScore: Math.round(profile.mythic_plus_scores_by_season?.[0]?.scores?.all || 0),
    itemLevel: profile.gear?.item_level_equipped || 0,
    spec: profile.active_spec_name || "",
    race: profile.race || "",
    bestRuns: (profile.mythic_plus_best_runs || []).slice(0, 8).map(run => ({
      dungeon: run.dungeon,
      keyLevel: run.mythic_level,
      score: Math.round(run.score),
    })),
  };
}
