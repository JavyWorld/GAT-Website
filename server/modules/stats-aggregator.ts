import { storage } from "../storage";

interface MythicRun {
  dungeon: string;
  keyLevel: number;
  clearTimeMs: number;
  parTimeMs: number;
}

interface ExistingRun {
  dungeon: string;
  keyLevel: number;
  timestamp: Date;
  url: string | null;
}

export async function updatePlayerStats(
  playerId: string,
  run: MythicRun,
  existingRuns: ExistingRun[]
): Promise<void> {
  const player = await storage.getPlayer(playerId);
  if (!player) return;

  const inTime = run.clearTimeMs <= run.parTimeMs;
  const keyLevel = run.keyLevel;

  let levelBucket: 'runsByLevelLow' | 'runsByLevelMid' | 'runsByLevelHigh' | 'runsByLevelElite';
  if (keyLevel <= 6) {
    levelBucket = 'runsByLevelLow';
  } else if (keyLevel <= 9) {
    levelBucket = 'runsByLevelMid';
  } else if (keyLevel <= 14) {
    levelBucket = 'runsByLevelHigh';
  } else {
    levelBucket = 'runsByLevelElite';
  }

  const dungeonCounts: Record<string, number> = {};
  for (const r of existingRuns) {
    dungeonCounts[r.dungeon] = (dungeonCounts[r.dungeon] || 0) + 1;
  }
  dungeonCounts[run.dungeon] = (dungeonCounts[run.dungeon] || 0) + 1;

  let mostPlayed = run.dungeon;
  let maxCount = 0;
  for (const [dungeon, count] of Object.entries(dungeonCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostPlayed = dungeon;
    }
  }

  const newHighestKey = Math.max(player.highestKeyLevel || 0, keyLevel);

  await storage.updatePlayer(playerId, {
    totalRunsTracked: (player.totalRunsTracked || 0) + 1,
    mostPlayedDungeon: mostPlayed,
    runsInTime: (player.runsInTime || 0) + (inTime ? 1 : 0),
    runsOverTime: (player.runsOverTime || 0) + (inTime ? 0 : 1),
    [levelBucket]: (player[levelBucket] || 0) + 1,
    highestKeyLevel: newHighestKey,
  });
}
