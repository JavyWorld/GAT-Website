const RAIDER_IO_BASE_URL = "https://raider.io/api/v1";
const CURRENT_SEASON = "season-tww-3";

export interface RaiderIORosterMember {
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

export interface RaiderIORun {
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

export interface RaiderIOProfile {
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

export interface FetchedPlayerData {
  playerId: string;
  playerName: string;
  playerRealm: string;
  profile: RaiderIOProfile;
  runsWithRoster: RaiderIORun[];
  fetchedAt: Date;
}

export async function fetchPlayerProfile(
  name: string,
  realm: string,
  region: string
): Promise<RaiderIOProfile | null> {
  try {
    const encodedName = encodeURIComponent(name);
    const encodedRealm = encodeURIComponent(realm.replace(/'/g, ""));
    
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
    console.error(`Fetcher: Error fetching ${name}-${realm}:`, error);
    return null;
  }
}

export async function fetchRunDetails(runId: number): Promise<RaiderIORun | null> {
  try {
    const url = `${RAIDER_IO_BASE_URL}/mythic-plus/run-details?season=${CURRENT_SEASON}&id=${runId}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return null;
    }

    const runDetails = await response.json();
    
    if (!runDetails.roster || runDetails.roster.length === 0) {
      return null;
    }

    return {
      dungeon: runDetails.dungeon?.name || "Unknown",
      short_name: runDetails.dungeon?.short_name || "",
      mythic_level: runDetails.mythic_level,
      completed_at: runDetails.completed_at,
      clear_time_ms: runDetails.clear_time_ms,
      par_time_ms: runDetails.keystone_time_ms,
      num_keystone_upgrades: runDetails.num_chests || 0,
      score: runDetails.score || 0,
      url: `https://raider.io/mythic-plus-runs/${CURRENT_SEASON}/${runId}`,
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
  } catch (error) {
    return null;
  }
}

export function extractRunIdsFromProfile(profile: RaiderIOProfile): number[] {
  const runIds: number[] = [];
  
  if (profile.mythic_plus_recent_runs) {
    for (const run of profile.mythic_plus_recent_runs) {
      if (run.url) {
        const match = run.url.match(/\/(\d+)-/);
        if (match) {
          runIds.push(parseInt(match[1], 10));
        }
      }
    }
  }
  
  return runIds;
}

export async function fetchPlayerWithRuns(
  playerId: string,
  name: string,
  realm: string,
  region: string
): Promise<FetchedPlayerData | null> {
  const profile = await fetchPlayerProfile(name, realm, region);
  
  if (!profile) {
    return null;
  }

  const runIds = extractRunIdsFromProfile(profile);
  const runsWithRoster: RaiderIORun[] = [];

  for (const runId of runIds) {
    const run = await fetchRunDetails(runId);
    if (run) {
      runsWithRoster.push(run);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return {
    playerId,
    playerName: name,
    playerRealm: realm,
    profile,
    runsWithRoster,
    fetchedAt: new Date(),
  };
}
