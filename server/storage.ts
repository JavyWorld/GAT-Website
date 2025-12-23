import { 
  players, type Player, type InsertPlayer,
  activitySnapshots, type ActivitySnapshot, type InsertActivitySnapshot,
  activityEvents, type ActivityEvent, type InsertActivityEvent,
  mythicRuns, type MythicRun, type InsertMythicRun,
  raidParses, type RaidParse, type InsertRaidParse,
  guildSettings, type GuildSettings, type InsertGuildSettings,
  uploaderStatuses, type UploaderStatus,
  raidProgress, type RaidProgress, type InsertRaidProgress,
  raidReports, type RaidReport, type InsertRaidReport,
  adminAuditLog, type AdminAuditLog, type InsertAdminAuditLog,
  guildMythicRuns, type GuildMythicRun, type InsertGuildMythicRun,
  raidSchedules, type RaidSchedule, type InsertRaidSchedule,
  coreMembers, type CoreMember, type InsertCoreMember,
  coreApplications, type CoreApplication, type InsertCoreApplication,
  uploaderKeys, type UploaderKey, type InsertUploaderKey,
  type HeatmapData,
  type DashboardStats,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, and } from "drizzle-orm";

type UploaderStatusUpdate = Partial<Omit<UploaderStatus, "id" | "uploaderId" | "updatedAt" | "lastBatchIndex">> & {
  lastBatchIndex?: number;
  expectedBatchIndex?: number | null;
};

const sanitizeUpdate = <T extends Record<string, any>>(updates: T) =>
  Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));

export interface IStorage {
  getPlayers(): Promise<Player[]>;
  getPlayer(id: string): Promise<Player | undefined>;
  getPlayerByName(name: string, realm: string): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, player: Partial<InsertPlayer>): Promise<Player | undefined>;
  upsertPlayer(player: Partial<InsertPlayer> & { name: string; realm: string; class: string }): Promise<Player>;
  deletePlayer(id: string): Promise<boolean>;
  deletePlayersByIds(ids: string[]): Promise<number>;
  updatePlayerLastSeen(name: string, realm: string, lastSeen: Date): Promise<void>;
  deletePlayersNotIn(activePlayers: { name: string; realm: string }[]): Promise<number>;
  deactivatePlayersNotIn(activePlayers: { name: string; realm: string }[]): Promise<number>;
  deactivatePlayersByName(playerNames: { name: string; realm: string }[]): Promise<number>;
  markAllPlayersInactive(): Promise<number>;
  startUploadSession(uploaderId: string, sessionId: string): Promise<void>;
  clearUploadSession(uploaderId: string): Promise<void>;
  getCurrentUploadSession(
    uploaderId: string
  ): Promise<{ sessionId: string | null; startedAt: Date | null; processedCount: number; lastCompletedAt: Date | null }>;
  ensureUploaderStatus(uploaderId: string): Promise<UploaderStatus>;
  updateUploaderStatus(uploaderId: string, updates: UploaderStatusUpdate): Promise<UploaderStatus>;
  markUploaderOutOfOrder(uploaderId: string, updates: {
    expectedBatchIndex: number;
    receivedBatchIndex: number | undefined;
    sessionId?: string | null;
    totalBatches?: number | null;
    lastPhase?: string | null;
  }): Promise<UploaderStatus>;
  getUploaderStatuses(): Promise<UploaderStatus[]>;

  getActivitySnapshots(): Promise<ActivitySnapshot[]>;
  createActivitySnapshot(snapshot: InsertActivitySnapshot): Promise<ActivitySnapshot>;

  getActivityEvents(): Promise<ActivityEvent[]>;
  createActivityEvent(event: InsertActivityEvent): Promise<ActivityEvent>;

  getMythicRuns(playerId?: string): Promise<MythicRun[]>;
  createMythicRun(run: InsertMythicRun): Promise<MythicRun>;
  deleteOldMythicRuns(playerId: string, keepCount: number): Promise<number>;

  getRaidParses(playerId?: string): Promise<RaidParse[]>;
  createRaidParse(parse: InsertRaidParse): Promise<RaidParse>;

  getRaidProgress(zoneName?: string): Promise<RaidProgress[]>;
  upsertRaidProgress(progress: InsertRaidProgress): Promise<RaidProgress>;

  getRaidReports(): Promise<RaidReport[]>;
  getRaidReportByCode(code: string): Promise<RaidReport | undefined>;
  createRaidReport(report: InsertRaidReport): Promise<RaidReport>;
  upsertRaidReport(report: InsertRaidReport): Promise<RaidReport>;
  getRaidReportsCount(): Promise<number>;

  getGuildSettings(): Promise<GuildSettings | undefined>;
  updateGuildSettings(settings: InsertGuildSettings): Promise<GuildSettings>;

  getActiveUploaderKeyByApiKey(apiKey: string): Promise<UploaderKey | undefined>;
  upsertUploaderKey(key: InsertUploaderKey): Promise<UploaderKey>;
  deactivateUploaderKey(id: string): Promise<UploaderKey | undefined>;

  getHeatmapData(): Promise<HeatmapData>;
  getDashboardStats(): Promise<DashboardStats>;

  getAdminAuditLogs(limit?: number): Promise<AdminAuditLog[]>;
  createAdminAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog>;
  
  getDistinctGuildRanks(): Promise<string[]>;
  clearAllPlayers(): Promise<number>;
  clearAllMythicRuns(): Promise<number>;
  clearAllActivitySnapshots(): Promise<number>;
  
  // Guild Mythic Runs (guild group M+ tracking)
  getGuildMythicRuns(limit?: number): Promise<GuildMythicRun[]>;
  getGuildMythicRunByKey(runKey: string): Promise<GuildMythicRun | undefined>;
  createGuildMythicRun(run: InsertGuildMythicRun): Promise<GuildMythicRun>;
  getGuildMythicRunsCount(): Promise<number>;
  
  // Raid Schedules
  getRaidSchedules(): Promise<RaidSchedule[]>;
  getRaidSchedule(id: string): Promise<RaidSchedule | undefined>;
  createRaidSchedule(schedule: InsertRaidSchedule): Promise<RaidSchedule>;
  updateRaidSchedule(id: string, schedule: Partial<InsertRaidSchedule>): Promise<RaidSchedule | undefined>;
  deleteRaidSchedule(id: string): Promise<boolean>;
  
  // Core Members
  getCoreMembers(): Promise<CoreMember[]>;
  getCoreMember(id: string): Promise<CoreMember | undefined>;
  getCoreMemberByPlayerId(playerId: string): Promise<CoreMember | undefined>;
  createCoreMember(member: InsertCoreMember): Promise<CoreMember>;
  updateCoreMember(id: string, member: Partial<InsertCoreMember>): Promise<CoreMember | undefined>;
  deleteCoreMember(id: string): Promise<boolean>;
  
  // Core Applications
  getCoreApplications(status?: string): Promise<CoreApplication[]>;
  getCoreApplication(id: string): Promise<CoreApplication | undefined>;
  getCoreApplicationByPlayerId(playerId: string): Promise<CoreApplication | undefined>;
  createCoreApplication(application: InsertCoreApplication): Promise<CoreApplication>;
  updateCoreApplication(id: string, updates: Partial<CoreApplication>): Promise<CoreApplication | undefined>;
  deleteCoreApplication(id: string): Promise<boolean>;
}

const DUNGEONS = [
  "The Stonevault", "The Dawnbreaker", "Ara-Kara", "City of Threads",
  "Mists of Tirna Scithe", "The Necrotic Wake", "Siege of Boralus", "Grim Batol"
];

export class DatabaseStorage implements IStorage {
  async getPlayers(): Promise<Player[]> {
    return await db.select().from(players);
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player || undefined;
  }

  async getPlayerByName(name: string, realm: string): Promise<Player | undefined> {
    const [player] = await db.select().from(players)
      .where(sql`${players.name} = ${name} AND ${players.realm} = ${realm}`);
    return player || undefined;
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const [player] = await db.insert(players).values(insertPlayer).returning();
    return player;
  }

  async updatePlayer(id: string, updates: Partial<InsertPlayer>): Promise<Player | undefined> {
    const [player] = await db.update(players)
      .set(updates)
      .where(eq(players.id, id))
      .returning();
    return player || undefined;
  }

  async upsertPlayer(playerData: Partial<InsertPlayer> & { name: string; realm: string; class: string }): Promise<Player> {
    const existing = await this.getPlayerByName(playerData.name, playerData.realm);
    if (existing) {
      const updates: Partial<InsertPlayer> = {};
      if (playerData.spec !== undefined) updates.spec = playerData.spec;
      if (playerData.race !== undefined) updates.race = playerData.race;
      if (playerData.level !== undefined) updates.level = playerData.level;
      if (playerData.itemLevel !== undefined) updates.itemLevel = playerData.itemLevel;
      if (playerData.mythicScore !== undefined) updates.mythicScore = playerData.mythicScore;
      if (playerData.guildRank !== undefined) updates.guildRank = playerData.guildRank;
      if (playerData.messagesCount !== undefined) updates.messagesCount = playerData.messagesCount;
      if (playerData.isActive !== undefined) updates.isActive = playerData.isActive;
      
      if (Object.keys(updates).length > 0) {
        const updated = await this.updatePlayer(existing.id, updates);
        return updated!;
      }
      return existing;
    }
    return await this.createPlayer({
      name: playerData.name,
      realm: playerData.realm,
      class: playerData.class,
      spec: playerData.spec,
      race: playerData.race,
      level: playerData.level ?? 80,
      itemLevel: playerData.itemLevel ?? 0,
      mythicScore: playerData.mythicScore ?? 0,
      guildRank: playerData.guildRank ?? "Member",
      messagesCount: playerData.messagesCount ?? 0,
      isActive: playerData.isActive ?? true,
    });
  }

  async deletePlayer(id: string): Promise<boolean> {
    const existing = await this.getPlayer(id);
    if (!existing) return false;
    // Delete related data first
    await db.delete(mythicRuns).where(eq(mythicRuns.playerId, id));
    await db.delete(raidParses).where(eq(raidParses.playerId, id));
    await db.delete(activityEvents).where(eq(activityEvents.playerId, id));
    await db.delete(players).where(eq(players.id, id));
    return true;
  }

  async deletePlayersByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    let deletedCount = 0;
    for (const id of ids) {
      const deleted = await this.deletePlayer(id);
      if (deleted) deletedCount++;
    }
    return deletedCount;
  }

  async updatePlayerLastSeen(name: string, realm: string, lastSeen: Date): Promise<void> {
    const existing = await this.getPlayerByName(name, realm);
    if (existing) {
      await db.update(players)
        .set({ lastSeen })
        .where(eq(players.id, existing.id));
    }
  }

  async deletePlayersNotIn(activePlayers: { name: string; realm: string }[]): Promise<number> {
    const allPlayers = await this.getPlayers();
    let deletedCount = 0;
    
    for (const player of allPlayers) {
      const isInRoster = activePlayers.some(
        ap => ap.name === player.name && ap.realm === player.realm
      );
      
      // If player not in the uploader roster, DELETE them
      // Empty roster = delete everyone (guild was cleared)
      if (!isInRoster) {
        // First delete related data (mythic runs, raid parses)
        await db.delete(mythicRuns).where(eq(mythicRuns.playerId, player.id));
        await db.delete(raidParses).where(eq(raidParses.playerId, player.id));
        await db.delete(activityEvents).where(eq(activityEvents.playerId, player.id));
        // Then delete the player
        await db.delete(players).where(eq(players.id, player.id));
        deletedCount++;
      }
    }
    
    return deletedCount;
  }

  async deactivatePlayersNotIn(activePlayers: { name: string; realm: string }[]): Promise<number> {
    if (activePlayers.length === 0) return 0;
    
    const allPlayers = await this.getPlayers();
    let deactivatedCount = 0;
    
    for (const player of allPlayers) {
      const isInRoster = activePlayers.some(
        ap => ap.name === player.name && ap.realm === player.realm
      );
      
      // If player not in the uploader roster, deactivate them (soft delete)
      if (!isInRoster && player.isActive) {
        await db.update(players)
          .set({ isActive: false })
          .where(eq(players.id, player.id));
        deactivatedCount++;
      }
      
      // If player IS in roster and was inactive, reactivate them
      if (isInRoster && !player.isActive) {
        await db.update(players)
          .set({ isActive: true })
          .where(eq(players.id, player.id));
      }
    }
    
    return deactivatedCount;
  }

  async markAllPlayersInactive(): Promise<number> {
    const result = await db.update(players)
      .set({ isActive: false })
      .where(eq(players.isActive, true))
      .returning();
    return result.length;
  }

  async deactivatePlayersByName(playerNames: { name: string; realm: string }[]): Promise<number> {
    if (playerNames.length === 0) return 0;
    
    let deactivatedCount = 0;
    for (const { name, realm } of playerNames) {
      const result = await db.update(players)
        .set({ isActive: false })
        .where(and(eq(players.name, name), eq(players.realm, realm), eq(players.isActive, true)))
        .returning();
      deactivatedCount += result.length;
    }
    return deactivatedCount;
  }

  async startUploadSession(uploaderId: string, sessionId: string): Promise<void> {
    const settings = await this.getGuildSettings();
    if (!settings) return;

    await db
      .update(guildSettings)
      .set({
        currentUploadSession: sessionId,
        uploadSessionStartedAt: new Date(),
        uploadSessionProcessedCount: 0,
      })
      .where(eq(guildSettings.id, settings.id));
  }

  async clearUploadSession(uploaderId: string): Promise<void> {
    const settings = await this.getGuildSettings();
    if (!settings) return;

    await db
      .update(guildSettings)
      .set({
        currentUploadSession: null,
        uploadSessionStartedAt: null,
        uploadSessionProcessedCount: 0,
        lastUploadCompletedAt: new Date(),
      })
      .where(eq(guildSettings.id, settings.id));
  }

  async incrementUploadProcessedCount(uploaderId: string, count: number): Promise<void> {
    const settings = await this.getGuildSettings();
    if (!settings) return;

    await db
      .update(guildSettings)
      .set({ uploadSessionProcessedCount: (settings.uploadSessionProcessedCount ?? 0) + count })
      .where(eq(guildSettings.id, settings.id));
  }

  async getCurrentUploadSession(_uploaderId: string): Promise<{
    sessionId: string | null;
    startedAt: Date | null;
    processedCount: number;
    lastCompletedAt: Date | null;
  }> {
    const settings = await this.getGuildSettings();
    return {
      sessionId: settings?.currentUploadSession ?? null,
      startedAt: settings?.uploadSessionStartedAt ?? null,
      processedCount: settings?.uploadSessionProcessedCount ?? 0,
      lastCompletedAt: settings?.lastUploadCompletedAt ?? null,
    };
  }

  async ensureUploaderStatus(uploaderId: string): Promise<UploaderStatus> {
    const existing = await this.getUploaderStatusRecord(uploaderId);
    if (existing) return existing;

    const [created] = await db.insert(uploaderStatuses)
      .values({ uploaderId })
      .returning();

    return created;
  }

  async updateUploaderStatus(uploaderId: string, updates: UploaderStatusUpdate): Promise<UploaderStatus> {
    const current = await this.ensureUploaderStatus(uploaderId);
    const payload = sanitizeUpdate({
      ...updates,
      updatedAt: new Date(),
    });

    const [updated] = await db.update(uploaderStatuses)
      .set(payload)
      .where(eq(uploaderStatuses.id, current.id))
      .returning();

    return updated;
  }

  async markUploaderOutOfOrder(
    uploaderId: string,
    updates: {
      expectedBatchIndex: number;
      receivedBatchIndex: number | undefined;
      sessionId?: string | null;
      totalBatches?: number | null;
      lastPhase?: string | null;
    }
  ): Promise<UploaderStatus> {
    const errorMessage = `Out-of-order batch (expected ${updates.expectedBatchIndex}, received ${updates.receivedBatchIndex ?? "none"})`;
    return this.updateUploaderStatus(uploaderId, {
      status: "out_of_order",
      lastError: errorMessage,
      expectedBatchIndex: updates.expectedBatchIndex,
      lastBatchIndex: updates.receivedBatchIndex !== undefined ? updates.receivedBatchIndex : undefined,
      lastSessionId: updates.sessionId ?? undefined,
      totalBatches: updates.totalBatches ?? undefined,
      lastPhase: updates.lastPhase ?? undefined,
    });
  }

  async getUploaderStatuses(): Promise<UploaderStatus[]> {
    return await db.select().from(uploaderStatuses);
  }

  async getUploadStatus(): Promise<{
    processing: boolean;
    processedCount: number;
    startedAt: Date | null;
    lastCompletedAt: Date | null;
    uploaders: UploaderStatus[];
  }> {
    const [settings, uploaders] = await Promise.all([
      this.getGuildSettings(),
      this.getUploaderStatuses()
    ]);
    return {
      processing: !!settings?.currentUploadSession,
      processedCount: settings?.uploadSessionProcessedCount ?? 0,
      startedAt: settings?.uploadSessionStartedAt ?? null,
      lastCompletedAt: settings?.lastUploadCompletedAt ?? null,
      uploaders,
    };
  }

  async getActivitySnapshots(): Promise<ActivitySnapshot[]> {
    return await db.select().from(activitySnapshots).orderBy(desc(activitySnapshots.timestamp));
  }

  async createActivitySnapshot(insertSnapshot: InsertActivitySnapshot): Promise<ActivitySnapshot> {
    const existing = await db.select().from(activitySnapshots)
      .where(and(
        eq(activitySnapshots.dayOfWeek, insertSnapshot.dayOfWeek),
        eq(activitySnapshots.hourOfDay, insertSnapshot.hourOfDay),
        sql`DATE(${activitySnapshots.timestamp}) = DATE(${insertSnapshot.timestamp})`
      ))
      .limit(1);
    
    if (existing.length > 0) {
      const [updated] = await db.update(activitySnapshots)
        .set({ totalOnline: insertSnapshot.totalOnline, timestamp: insertSnapshot.timestamp })
        .where(eq(activitySnapshots.id, existing[0].id))
        .returning();
      return updated;
    }
    
    const [snapshot] = await db.insert(activitySnapshots).values(insertSnapshot).returning();
    return snapshot;
  }

  async getActivityEvents(): Promise<ActivityEvent[]> {
    return await db.select().from(activityEvents).orderBy(desc(activityEvents.timestamp)).limit(5);
  }

  async createActivityEvent(insertEvent: InsertActivityEvent): Promise<ActivityEvent> {
    const [event] = await db.insert(activityEvents).values(insertEvent).returning();
    return event;
  }

  async getMythicRuns(playerId?: string): Promise<MythicRun[]> {
    if (playerId) {
      return await db.select().from(mythicRuns)
        .where(eq(mythicRuns.playerId, playerId))
        .orderBy(desc(mythicRuns.timestamp));
    }
    return await db.select().from(mythicRuns).orderBy(desc(mythicRuns.timestamp));
  }

  async createMythicRun(insertRun: InsertMythicRun): Promise<MythicRun> {
    const [run] = await db.insert(mythicRuns).values(insertRun).returning();
    return run;
  }

  async upsertMythicRun(insertRun: InsertMythicRun): Promise<MythicRun> {
    const existing = await db.select().from(mythicRuns)
      .where(and(
        eq(mythicRuns.playerId, insertRun.playerId),
        eq(mythicRuns.dungeon, insertRun.dungeon),
        eq(mythicRuns.keyLevel, insertRun.keyLevel),
        sql`DATE(${mythicRuns.timestamp}) = DATE(${insertRun.timestamp})`
      ))
      .limit(1);
    
    if (existing.length > 0) {
      if (insertRun.score > existing[0].score) {
        const [updated] = await db.update(mythicRuns)
          .set({
            completionTime: insertRun.completionTime,
            timerPercent: insertRun.timerPercent,
            score: insertRun.score,
            affixes: insertRun.affixes,
            clearTimeMs: insertRun.clearTimeMs,
            parTimeMs: insertRun.parTimeMs,
          })
          .where(eq(mythicRuns.id, existing[0].id))
          .returning();
        return updated;
      }
      return existing[0];
    }
    
    const [run] = await db.insert(mythicRuns).values(insertRun).returning();
    return run;
  }

  async deleteOldMythicRuns(playerId: string, keepCount: number): Promise<number> {
    const allRuns = await db.select({ id: mythicRuns.id })
      .from(mythicRuns)
      .where(eq(mythicRuns.playerId, playerId))
      .orderBy(desc(mythicRuns.timestamp));
    
    if (allRuns.length <= keepCount) {
      return 0;
    }

    const idsToDelete = allRuns.slice(keepCount).map(r => r.id);
    let deleted = 0;
    
    for (const id of idsToDelete) {
      await db.delete(mythicRuns).where(eq(mythicRuns.id, id));
      deleted++;
    }
    
    return deleted;
  }

  async getRaidParses(playerId?: string): Promise<RaidParse[]> {
    if (playerId) {
      return await db.select().from(raidParses)
        .where(eq(raidParses.playerId, playerId))
        .orderBy(desc(raidParses.parsePercent));
    }
    return await db.select().from(raidParses).orderBy(desc(raidParses.parsePercent));
  }

  async createRaidParse(insertParse: InsertRaidParse): Promise<RaidParse> {
    const [parse] = await db.insert(raidParses).values(insertParse).returning();
    return parse;
  }

  async getRaidProgress(zoneName?: string): Promise<RaidProgress[]> {
    if (zoneName) {
      return await db.select().from(raidProgress)
        .where(eq(raidProgress.zoneName, zoneName))
        .orderBy(desc(raidProgress.updatedAt));
    }
    return await db.select().from(raidProgress).orderBy(desc(raidProgress.updatedAt));
  }

  async upsertRaidProgress(insertProgress: InsertRaidProgress): Promise<RaidProgress> {
    const existing = await db.select().from(raidProgress)
      .where(and(
        eq(raidProgress.zoneName, insertProgress.zoneName),
        eq(raidProgress.difficulty, insertProgress.difficulty),
        eq(raidProgress.bossId, insertProgress.bossId)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      const [updated] = await db.update(raidProgress)
        .set({
          killCount: insertProgress.killCount,
          bestPercent: insertProgress.bestPercent,
          lastKillTimestamp: insertProgress.lastKillTimestamp,
          reportCode: insertProgress.reportCode,
          updatedAt: new Date()
        })
        .where(eq(raidProgress.id, existing[0].id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(raidProgress).values(insertProgress).returning();
    return created;
  }

  async getRaidReports(): Promise<RaidReport[]> {
    return await db.select().from(raidReports).orderBy(desc(raidReports.startTime));
  }

  async getRaidReportByCode(code: string): Promise<RaidReport | undefined> {
    const [report] = await db.select().from(raidReports).where(eq(raidReports.code, code));
    return report || undefined;
  }

  async createRaidReport(insertReport: InsertRaidReport): Promise<RaidReport> {
    const [report] = await db.insert(raidReports).values(insertReport).returning();
    return report;
  }

  async upsertRaidReport(insertReport: InsertRaidReport): Promise<RaidReport> {
    const existing = await this.getRaidReportByCode(insertReport.code);
    if (existing) {
      return existing;
    }
    return await this.createRaidReport(insertReport);
  }

  async getRaidReportsCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(raidReports);
    return Number(result[0]?.count || 0);
  }

  async getGuildSettings(): Promise<GuildSettings | undefined> {
    const [settings] = await db.select().from(guildSettings).limit(1);
    return settings || undefined;
  }

  async updateGuildSettings(settings: InsertGuildSettings): Promise<GuildSettings> {
    const existing = await this.getGuildSettings();
    if (existing) {
      const [updated] = await db.update(guildSettings)
        .set(settings)
        .where(eq(guildSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(guildSettings).values(settings).returning();
    return created;
  }

  async getActiveUploaderKeyByApiKey(apiKey: string): Promise<UploaderKey | undefined> {
    const [key] = await db.select().from(uploaderKeys)
      .where(and(eq(uploaderKeys.apiKey, apiKey), eq(uploaderKeys.isActive, true)))
      .limit(1);
    return key || undefined;
  }

  async upsertUploaderKey(key: InsertUploaderKey): Promise<UploaderKey> {
    const existing = await db.select().from(uploaderKeys)
      .where(eq(uploaderKeys.uploaderId, key.uploaderId))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(uploaderKeys)
        .set({
          apiKey: key.apiKey,
          isActive: key.isActive ?? existing[0].isActive,
        })
        .where(eq(uploaderKeys.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(uploaderKeys).values(key).returning();
    return created;
  }

  async deactivateUploaderKey(id: string): Promise<UploaderKey | undefined> {
    const [updated] = await db.update(uploaderKeys)
      .set({ isActive: false })
      .where(eq(uploaderKeys.id, id))
      .returning();
    return updated || undefined;
  }

  async getHeatmapData(): Promise<HeatmapData> {
    const snapshots = await this.getActivitySnapshots();

    const aggregated: Record<string, { total: number; count: number }> = {};
    
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        aggregated[`${day}-${hour}`] = { total: 0, count: 0 };
      }
    }
    
    for (const snapshot of snapshots) {
      const key = `${snapshot.dayOfWeek}-${snapshot.hourOfDay}`;
      if (aggregated[key]) {
        aggregated[key].total += snapshot.totalOnline;
        aggregated[key].count += 1;
      }
    }
    
    const data: HeatmapData = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day}-${hour}`;
        const { total, count } = aggregated[key];
        const value = count > 0 ? Math.round(total / count) : 0;
        data.push({ day, hour, value });
      }
    }
    
    return data;
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const allPlayers = await this.getPlayers();
    const activePlayers = allPlayers.filter((p) => p.isActive);
    const avgScore = activePlayers.length > 0 
      ? Math.floor(activePlayers.reduce((sum, p) => sum + (p.mythicScore || 0), 0) / activePlayers.length)
      : 0;
    
    const snapshots = await this.getActivitySnapshots();
    const totalSnapshots = snapshots.length;
    
    const recentSnapshots = snapshots.slice(0, 24);
    const avgOnline = recentSnapshots.length > 0
      ? Math.round(recentSnapshots.reduce((sum, s) => sum + s.totalOnline, 0) / recentSnapshots.length)
      : 0;

    const runs = await this.getMythicRuns();
    const dungeonCounts: Record<string, number> = {};
    for (const run of runs) {
      dungeonCounts[run.dungeon] = (dungeonCounts[run.dungeon] || 0) + 1;
    }
    const topDungeon = Object.entries(dungeonCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || "N/A";
    
    const raidProgressData = await this.getRaidProgress();
    let raidProgressStr = "N/A";
    if (raidProgressData.length > 0) {
      const grouped: Record<string, Record<string, number>> = {};
      for (const p of raidProgressData) {
        if (!grouped[p.zoneName]) grouped[p.zoneName] = {};
        if (!grouped[p.zoneName][p.difficulty]) grouped[p.zoneName][p.difficulty] = 0;
        if ((p.killCount ?? 0) > 0) {
          grouped[p.zoneName][p.difficulty]++;
        }
      }
      const zoneName = Object.keys(grouped)[0];
      if (zoneName) {
        const difficulties = grouped[zoneName];
        const mythicKills = difficulties["Mythic"] || 0;
        const heroicKills = difficulties["Heroic"] || 0;
        const normalKills = difficulties["Normal"] || 0;
        if (mythicKills > 0) {
          raidProgressStr = `${mythicKills}/8 Mythic`;
        } else if (heroicKills > 0) {
          raidProgressStr = `${heroicKills}/8 Heroic`;
        } else if (normalKills > 0) {
          raidProgressStr = `${normalKills}/8 Normal`;
        }
      }
    }
    
    return {
      activeMembers: activePlayers.length,
      avgOnlineByHour: avgOnline,
      avgMythicScore: avgScore,
      totalSnapshots,
      topDungeon,
      raidProgress: raidProgressStr,
      guildRealmRank: null,
    };
  }

  async getAdminAuditLogs(limit: number = 20): Promise<AdminAuditLog[]> {
    return await db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.timestamp)).limit(limit);
  }

  async createAdminAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const [newLog] = await db.insert(adminAuditLog).values(log).returning();
    return newLog;
  }

  async getDistinctGuildRanks(): Promise<string[]> {
    const result = await db
      .selectDistinct({ guildRank: players.guildRank })
      .from(players)
      .where(eq(players.isActive, true));
    
    return result
      .map(r => r.guildRank)
      .filter((rank): rank is string => rank !== null && rank !== undefined)
      .sort();
  }

  async clearAllPlayers(): Promise<number> {
    const allPlayers = await this.getPlayers();
    await db.delete(players);
    return allPlayers.length;
  }

  async clearAllMythicRuns(): Promise<number> {
    const runs = await this.getMythicRuns();
    await db.delete(mythicRuns);
    return runs.length;
  }

  async clearAllActivitySnapshots(): Promise<number> {
    const snapshots = await this.getActivitySnapshots();
    await db.delete(activitySnapshots);
    return snapshots.length;
  }

  // Guild Mythic Runs methods
  async getGuildMythicRuns(limit: number = 50): Promise<GuildMythicRun[]> {
    return await db.select().from(guildMythicRuns)
      .orderBy(desc(guildMythicRuns.completedAt))
      .limit(limit);
  }

  async getGuildMythicRunByKey(runKey: string): Promise<GuildMythicRun | undefined> {
    const [run] = await db.select().from(guildMythicRuns)
      .where(eq(guildMythicRuns.runKey, runKey));
    return run || undefined;
  }

  async createGuildMythicRun(insertRun: InsertGuildMythicRun): Promise<GuildMythicRun> {
    const [run] = await db.insert(guildMythicRuns).values(insertRun).returning();
    return run;
  }

  async getGuildMythicRunsCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(guildMythicRuns);
    return Number(result?.count || 0);
  }

  // Raid Schedules
  async getRaidSchedules(): Promise<RaidSchedule[]> {
    return await db.select().from(raidSchedules)
      .where(eq(raidSchedules.isActive, true))
      .orderBy(raidSchedules.dayOfWeek, raidSchedules.startTime);
  }

  async getRaidSchedule(id: string): Promise<RaidSchedule | undefined> {
    const [schedule] = await db.select().from(raidSchedules).where(eq(raidSchedules.id, id));
    return schedule || undefined;
  }

  async createRaidSchedule(schedule: InsertRaidSchedule): Promise<RaidSchedule> {
    const [newSchedule] = await db.insert(raidSchedules).values(schedule).returning();
    return newSchedule;
  }

  async updateRaidSchedule(id: string, updates: Partial<InsertRaidSchedule>): Promise<RaidSchedule | undefined> {
    const [schedule] = await db.update(raidSchedules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(raidSchedules.id, id))
      .returning();
    return schedule || undefined;
  }

  async deleteRaidSchedule(id: string): Promise<boolean> {
    const result = await db.delete(raidSchedules).where(eq(raidSchedules.id, id));
    return true;
  }

  // Core Members
  async getCoreMembers(): Promise<CoreMember[]> {
    return await db.select().from(coreMembers)
      .orderBy(desc(coreMembers.priority), coreMembers.role);
  }

  async getCoreMember(id: string): Promise<CoreMember | undefined> {
    const [member] = await db.select().from(coreMembers).where(eq(coreMembers.id, id));
    return member || undefined;
  }

  async getCoreMemberByPlayerId(playerId: string): Promise<CoreMember | undefined> {
    const [member] = await db.select().from(coreMembers).where(eq(coreMembers.playerId, playerId));
    return member || undefined;
  }

  async createCoreMember(member: InsertCoreMember): Promise<CoreMember> {
    const [newMember] = await db.insert(coreMembers).values(member).returning();
    return newMember;
  }

  async updateCoreMember(id: string, updates: Partial<InsertCoreMember>): Promise<CoreMember | undefined> {
    const [member] = await db.update(coreMembers)
      .set(updates)
      .where(eq(coreMembers.id, id))
      .returning();
    return member || undefined;
  }

  async deleteCoreMember(id: string): Promise<boolean> {
    await db.delete(coreMembers).where(eq(coreMembers.id, id));
    return true;
  }

  // Core Applications
  async getCoreApplications(status?: string): Promise<CoreApplication[]> {
    if (status) {
      return await db.select().from(coreApplications)
        .where(eq(coreApplications.status, status))
        .orderBy(desc(coreApplications.createdAt));
    }
    return await db.select().from(coreApplications)
      .orderBy(desc(coreApplications.createdAt));
  }

  async getCoreApplication(id: string): Promise<CoreApplication | undefined> {
    const [application] = await db.select().from(coreApplications).where(eq(coreApplications.id, id));
    return application || undefined;
  }

  async getCoreApplicationByPlayerId(playerId: string): Promise<CoreApplication | undefined> {
    const [application] = await db.select().from(coreApplications)
      .where(and(eq(coreApplications.playerId, playerId), eq(coreApplications.status, "pending")));
    return application || undefined;
  }

  async createCoreApplication(application: InsertCoreApplication): Promise<CoreApplication> {
    const [newApplication] = await db.insert(coreApplications).values(application).returning();
    return newApplication;
  }

  async updateCoreApplication(id: string, updates: Partial<CoreApplication>): Promise<CoreApplication | undefined> {
    const [application] = await db.update(coreApplications)
      .set(updates)
      .where(eq(coreApplications.id, id))
      .returning();
    return application || undefined;
  }

  async deleteCoreApplication(id: string): Promise<boolean> {
    await db.delete(coreApplications).where(eq(coreApplications.id, id));
    return true;
  }

  private async getUploaderStatusRecord(uploaderId: string): Promise<UploaderStatus | undefined> {
    const [status] = await db.select().from(uploaderStatuses).where(eq(uploaderStatuses.uploaderId, uploaderId));
    return status || undefined;
  }
}

export const storage = new DatabaseStorage();
