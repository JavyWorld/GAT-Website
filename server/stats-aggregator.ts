import { storage } from "./storage";
import type { RaiderIORun } from "./rio-fetcher";

export interface PlayerStats {
  totalRunsTracked: number;
  mostPlayedDungeon: string | null;
  runsInTime: number;
  runsOverTime: number;
  runsByLevelLow: number;
  runsByLevelMid: number;
  runsByLevelHigh: number;
  runsByLevelElite: number;
}

const dungeonCountCache: Map<string, Map<string, number>> = new Map();

function getLevelBucket(keyLevel: number): "low" | "mid" | "high" | "elite" {
  if (keyLevel <= 6) return "low";
  if (keyLevel <= 9) return "mid";
  if (keyLevel <= 14) return "high";
  return "elite";
}

export async function updatePlayerStats(playerId: string, run: RaiderIORun): Promise<void> {
  const player = await storage.getPlayer(playerId);
  if (!player) return;

  const wasInTime = run.clear_time_ms <= run.par_time_ms;
  const levelBucket = getLevelBucket(run.mythic_level);

  if (!dungeonCountCache.has(playerId)) {
    dungeonCountCache.set(playerId, new Map());
  }
  const playerDungeons = dungeonCountCache.get(playerId)!;
  playerDungeons.set(run.dungeon, (playerDungeons.get(run.dungeon) || 0) + 1);

  let mostPlayedDungeon = player.mostPlayedDungeon;
  let maxCount = 0;
  playerDungeons.forEach((count, dungeon) => {
    if (count > maxCount) {
      maxCount = count;
      mostPlayedDungeon = dungeon;
    }
  });

  const updates: Partial<typeof player> = {
    totalRunsTracked: (player.totalRunsTracked || 0) + 1,
    mostPlayedDungeon,
    runsInTime: wasInTime ? (player.runsInTime || 0) + 1 : player.runsInTime || 0,
    runsOverTime: !wasInTime ? (player.runsOverTime || 0) + 1 : player.runsOverTime || 0,
    runsByLevelLow: levelBucket === "low" ? (player.runsByLevelLow || 0) + 1 : player.runsByLevelLow || 0,
    runsByLevelMid: levelBucket === "mid" ? (player.runsByLevelMid || 0) + 1 : player.runsByLevelMid || 0,
    runsByLevelHigh: levelBucket === "high" ? (player.runsByLevelHigh || 0) + 1 : player.runsByLevelHigh || 0,
    runsByLevelElite: levelBucket === "elite" ? (player.runsByLevelElite || 0) + 1 : player.runsByLevelElite || 0,
  };

  await storage.updatePlayer(playerId, updates);
}

export async function getGlobalStats(): Promise<{
  totalRunsTracked: number;
  avgRunsPerPlayer: number;
  totalInTime: number;
  totalOverTime: number;
  runsByLevel: { low: number; mid: number; high: number; elite: number };
  topDungeons: { name: string; count: number }[];
}> {
  const players = await storage.getPlayers();
  const activePlayers = players.filter(p => p.isActive);

  let totalRunsTracked = 0;
  let totalInTime = 0;
  let totalOverTime = 0;
  let runsByLevel = { low: 0, mid: 0, high: 0, elite: 0 };
  const dungeonCounts: Map<string, number> = new Map();

  for (const player of activePlayers) {
    totalRunsTracked += player.totalRunsTracked || 0;
    totalInTime += player.runsInTime || 0;
    totalOverTime += player.runsOverTime || 0;
    runsByLevel.low += player.runsByLevelLow || 0;
    runsByLevel.mid += player.runsByLevelMid || 0;
    runsByLevel.high += player.runsByLevelHigh || 0;
    runsByLevel.elite += player.runsByLevelElite || 0;

    if (player.mostPlayedDungeon) {
      dungeonCounts.set(
        player.mostPlayedDungeon,
        (dungeonCounts.get(player.mostPlayedDungeon) || 0) + 1
      );
    }
  }

  const topDungeons = Array.from(dungeonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    totalRunsTracked,
    avgRunsPerPlayer: activePlayers.length > 0 ? Math.round(totalRunsTracked / activePlayers.length) : 0,
    totalInTime,
    totalOverTime,
    runsByLevel,
    topDungeons,
  };
}
