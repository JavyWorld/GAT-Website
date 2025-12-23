import { pgTable, text, integer, boolean, timestamp, real, varchar, serial, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Export auth models (required for Replit Auth)
export * from "./models/auth";

// WoW Class definitions
export const WOW_CLASSES = [
  "Death Knight", "Demon Hunter", "Druid", "Evoker", "Hunter", 
  "Mage", "Monk", "Paladin", "Priest", "Rogue", 
  "Shaman", "Warlock", "Warrior"
] as const;

export const WOW_CLASS_COLORS: Record<string, string> = {
  "Death Knight": "#C41E3A",
  "Demon Hunter": "#A330C9",
  "Druid": "#FF7C0A",
  "Evoker": "#33937F",
  "Hunter": "#AAD372",
  "Mage": "#3FC7EB",
  "Monk": "#00FF98",
  "Paladin": "#F48CBA",
  "Priest": "#FFFFFF",
  "Rogue": "#FFF468",
  "Shaman": "#0070DD",
  "Warlock": "#8788EE",
  "Warrior": "#C69B6D"
};

export const GUILD_RANKS = [
  "Guild Master", "Officer", "Raider", "Member", "Trial", "Initiate", "Alt"
] as const;

// Guild rank hierarchy order (highest to lowest)
// Used for sorting dropdowns and displays
export const GUILD_RANK_ORDER = [
  "Emperador",
  "General",
  "Comandante",
  "Marine",
  "Capitán",
  "Teniente",
  "Reserva",
  "Sargento",
  "Soldado",
  "Recluta",
] as const;

export const GUILD_RANK_COLORS: Record<string, string> = {
  "Recluta": "#9CA3AF",
  "Soldado": "#22C55E",
  "Sargento": "#16A34A",
  "Reserva": "#06B6D4",
  "Teniente": "#3B82F6",
  "Capitán": "#1D4ED8",
  "Marine": "#F97316",
  "Comandante": "#EF4444",
  "General": "#A855F7",
  "Emperador": "#D4AF37",
};

export const PARSE_COLORS: Record<string, string> = {
  gray: "#666666",
  green: "#1EFF00",
  blue: "#0070FF",
  purple: "#A335EE",
  orange: "#FF8000",
  pink: "#E268A8",
  gold: "#E5CC80"
};

// Class Specializations - all specs for each WoW class
export const CLASS_SPECS: Record<string, string[]> = {
  "Death Knight": ["Blood", "Frost", "Unholy"],
  "Demon Hunter": ["Havoc", "Vengeance"],
  "Druid": ["Balance", "Feral", "Guardian", "Restoration"],
  "Evoker": ["Devastation", "Preservation", "Augmentation"],
  "Hunter": ["Beast Mastery", "Marksmanship", "Survival"],
  "Mage": ["Arcane", "Fire", "Frost"],
  "Monk": ["Brewmaster", "Mistweaver", "Windwalker"],
  "Paladin": ["Holy", "Protection", "Retribution"],
  "Priest": ["Discipline", "Holy", "Shadow"],
  "Rogue": ["Assassination", "Outlaw", "Subtlety"],
  "Shaman": ["Elemental", "Enhancement", "Restoration"],
  "Warlock": ["Affliction", "Demonology", "Destruction"],
  "Warrior": ["Arms", "Fury", "Protection"],
};

// Spec to Role mapping - determines role automatically based on spec
export const SPEC_ROLE_MAP: Record<string, "tank" | "healer" | "dps"> = {
  // Death Knight
  "Blood": "tank",
  "Frost": "dps",
  "Unholy": "dps",
  // Demon Hunter
  "Havoc": "dps",
  "Vengeance": "tank",
  // Druid
  "Balance": "dps",
  "Feral": "dps",
  "Guardian": "tank",
  "Restoration": "healer",
  // Evoker
  "Devastation": "dps",
  "Preservation": "healer",
  "Augmentation": "dps",
  // Hunter
  "Beast Mastery": "dps",
  "Marksmanship": "dps",
  "Survival": "dps",
  // Mage (note: "Frost" already defined from DK, both are DPS)
  "Arcane": "dps",
  "Fire": "dps",
  // Monk
  "Brewmaster": "tank",
  "Mistweaver": "healer",
  "Windwalker": "dps",
  // Paladin
  "Holy": "healer",
  "Protection": "tank",
  "Retribution": "dps",
  // Priest
  "Discipline": "healer",
  "Shadow": "dps",
  // Rogue
  "Assassination": "dps",
  "Outlaw": "dps",
  "Subtlety": "dps",
  // Shaman
  "Elemental": "dps",
  "Enhancement": "dps",
  // Warlock
  "Affliction": "dps",
  "Demonology": "dps",
  "Destruction": "dps",
  // Warrior
  "Arms": "dps",
  "Fury": "dps",
};

// Database Tables

// Players table - removed isOnline and weeklyActivity (uploader can't track these)
export const players = pgTable("players", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 24 }).notNull(),
  realm: varchar("realm", { length: 100 }).notNull(),
  class: varchar("class", { length: 50 }).notNull(),
  spec: varchar("spec", { length: 50 }),
  race: varchar("race", { length: 50 }),
  level: integer("level").default(80),
  itemLevel: integer("item_level").default(0),
  mythicScore: integer("mythic_score").default(0),
  guildRank: varchar("guild_rank", { length: 50 }).default("Member"),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").default(true),
  lastSeen: timestamp("last_seen"),
  joinDate: timestamp("join_date"),
  messagesCount: integer("messages_count").default(0),
  lastMessage: text("last_message"),
  lastMessageTime: timestamp("last_message_time"),
  lastRioSync: timestamp("last_rio_sync"),
  rioSyncPriority: integer("rio_sync_priority").default(0),
  totalRunsTracked: integer("total_runs_tracked").default(0),
  mostPlayedDungeon: varchar("most_played_dungeon", { length: 100 }),
  runsInTime: integer("runs_in_time").default(0),
  runsOverTime: integer("runs_over_time").default(0),
  runsByLevelLow: integer("runs_by_level_low").default(0),
  runsByLevelMid: integer("runs_by_level_mid").default(0),
  runsByLevelHigh: integer("runs_by_level_high").default(0),
  runsByLevelElite: integer("runs_by_level_elite").default(0),
  highestKeyLevel: integer("highest_key_level").default(0),
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export const selectPlayerSchema = createSelectSchema(players);
export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;

// Activity Snapshots table - records player count at specific times
export const activitySnapshots = pgTable("activity_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  totalOnline: integer("total_online").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  hourOfDay: integer("hour_of_day").notNull(),
});

export const insertActivitySnapshotSchema = createInsertSchema(activitySnapshots).omit({ id: true });
export type ActivitySnapshot = typeof activitySnapshots.$inferSelect;
export type InsertActivitySnapshot = z.infer<typeof insertActivitySnapshotSchema>;

// Mythic+ Runs table
export const mythicRuns = pgTable("mythic_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id", { length: 36 }).notNull(),
  dungeon: varchar("dungeon", { length: 100 }).notNull(),
  keyLevel: integer("key_level").notNull(),
  completionTime: integer("completion_time").notNull(),
  timerPercent: real("timer_percent").notNull(),
  score: integer("score").notNull(),
  affixes: text("affixes").array(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  url: varchar("url", { length: 500 }),
  clearTimeMs: integer("clear_time_ms"),
  parTimeMs: integer("par_time_ms"),
  role: varchar("role", { length: 20 }),
  spec: varchar("spec", { length: 50 }),
});

export const insertMythicRunSchema = createInsertSchema(mythicRuns).omit({ id: true });
export type MythicRun = typeof mythicRuns.$inferSelect;
export type InsertMythicRun = z.infer<typeof insertMythicRunSchema>;

// Raid Parses table
export const raidParses = pgTable("raid_parses", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id", { length: 36 }).notNull(),
  bossName: varchar("boss_name", { length: 100 }).notNull(),
  difficulty: varchar("difficulty", { length: 20 }).notNull(),
  spec: varchar("spec", { length: 50 }).notNull(),
  dps: integer("dps"),
  hps: integer("hps"),
  parsePercent: real("parse_percent").notNull(),
  ilvlPercent: real("ilvl_percent"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertRaidParseSchema = createInsertSchema(raidParses).omit({ id: true });
export type RaidParse = typeof raidParses.$inferSelect;
export type InsertRaidParse = z.infer<typeof insertRaidParseSchema>;

// Guild Settings table
export const guildSettings = pgTable("guild_settings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  realm: varchar("realm", { length: 100 }).notNull(),
  region: varchar("region", { length: 10 }).notNull(),
  faction: varchar("faction", { length: 20 }).notNull(),
  emblemUrl: text("emblem_url"),
  raiderIOApiKey: text("raider_io_api_key"),
  warcraftLogsClientId: text("warcraft_logs_client_id"),
  warcraftLogsClientSecret: text("warcraft_logs_client_secret"),
  discordWebhook: text("discord_webhook"),
  uploadApiKey: varchar("upload_api_key", { length: 64 }),
  adminUserIds: text("admin_user_ids").array().default([]),
  currentUploadSession: varchar("current_upload_session", { length: 64 }),
  uploadSessionStartedAt: timestamp("upload_session_started_at"),
  uploadSessionProcessedCount: integer("upload_session_processed_count").default(0),
  lastUploadCompletedAt: timestamp("last_upload_completed_at"),
});

export const insertGuildSettingsSchema = createInsertSchema(guildSettings).omit({ id: true });
export type GuildSettings = typeof guildSettings.$inferSelect;
export type InsertGuildSettings = z.infer<typeof insertGuildSettingsSchema>;

// Activity Events table (for activity feed)
export const activityEvents = pgTable("activity_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type", { length: 50 }).notNull(),
  playerId: varchar("player_id", { length: 36 }).notNull(),
  playerName: varchar("player_name", { length: 24 }).notNull(),
  playerClass: varchar("player_class", { length: 50 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  value: integer("value"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertActivityEventSchema = createInsertSchema(activityEvents).omit({ id: true });
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type InsertActivityEvent = z.infer<typeof insertActivityEventSchema>;

// Raid Progress table - stores guild raid progress from Warcraft Logs
export const raidProgress = pgTable("raid_progress", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  zoneName: varchar("zone_name", { length: 100 }).notNull(),
  zoneId: integer("zone_id").notNull(),
  difficulty: varchar("difficulty", { length: 20 }).notNull(),
  bossName: varchar("boss_name", { length: 100 }).notNull(),
  bossId: integer("boss_id").notNull(),
  killCount: integer("kill_count").default(0),
  bestPercent: real("best_percent"),
  lastKillTimestamp: timestamp("last_kill_timestamp"),
  reportCode: varchar("report_code", { length: 50 }),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("raid_progress_zone_diff_boss_idx").on(
    table.zoneName,
    table.difficulty,
    table.bossId
  )
]);

export const insertRaidProgressSchema = createInsertSchema(raidProgress).omit({ id: true });
export type RaidProgress = typeof raidProgress.$inferSelect;
export type InsertRaidProgress = z.infer<typeof insertRaidProgressSchema>;

// Raid Reports table - stores all combat log reports from Warcraft Logs
export const raidReports = pgTable("raid_reports", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  owner: varchar("owner", { length: 100 }),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  zoneId: integer("zone_id"),
  zoneName: varchar("zone_name", { length: 100 }),
  segmentsCount: integer("segments_count").default(0),
  fightsCount: integer("fights_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRaidReportSchema = createInsertSchema(raidReports).omit({ id: true });
export type RaidReport = typeof raidReports.$inferSelect;
export type InsertRaidReport = z.infer<typeof insertRaidReportSchema>;

// Guild Mythic Runs table - tracks M+ runs completed by 2+ guild members together
export const guildMythicRuns = pgTable("guild_mythic_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  runKey: varchar("run_key", { length: 200 }).notNull().unique(), // Unique identifier for the run
  dungeon: varchar("dungeon", { length: 100 }).notNull(),
  mythicLevel: integer("mythic_level").notNull(),
  completedAt: timestamp("completed_at").notNull(),
  clearTimeMs: integer("clear_time_ms"),
  parTimeMs: integer("par_time_ms"),
  score: integer("score"),
  keystoneUpgrades: integer("keystone_upgrades"),
  guildPlayerIds: text("guild_player_ids").array().notNull(), // Player IDs from our roster
  guildPlayerNames: text("guild_player_names").array().notNull(), // Player names for display
  totalGuildMembers: integer("total_guild_members").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGuildMythicRunSchema = createInsertSchema(guildMythicRuns).omit({ id: true });
export type GuildMythicRun = typeof guildMythicRuns.$inferSelect;
export type InsertGuildMythicRun = z.infer<typeof insertGuildMythicRunSchema>;

// Enriched guild run with player classes for frontend display
export type EnrichedGuildRun = GuildMythicRun & {
  playerClasses: string[];
};

// Admin Audit Log table - tracks admin actions for the activity log
export const adminAuditLog = pgTable("admin_audit_log", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  action: varchar("action", { length: 50 }).notNull(),
  details: text("details"),
  value: integer("value"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLog).omit({ id: true });
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;

// Raid zone info type for frontend
export type RaidZoneProgress = {
  zoneName: string;
  zoneId: number;
  difficulty: string;
  bosses: {
    name: string;
    bossId: number;
    killed: boolean;
    killCount: number;
    bestPercent?: number;
    lastKill?: string;
  }[];
  totalBosses: number;
  killedBosses: number;
};

// Heatmap data structure (computed from snapshots)
export type HeatmapData = {
  day: number;
  hour: number;
  value: number;
}[];

// Dashboard stats (computed)
export type DashboardStats = {
  activeMembers: number;
  avgOnlineByHour: number;
  avgMythicScore: number;
  totalSnapshots: number;
  topDungeon: string;
  raidProgress: string;
  guildRealmRank: number | null;
};

// Leaderboard entry
export type LeaderboardEntry = {
  rank: number;
  player: Player;
  bestRuns: MythicRun[];
};

// Addon Upload Schemas - matches GuildActivityTracker.lua format

// Map addon class names to display names
export const WOW_CLASS_MAP: Record<string, string> = {
  "DEATHKNIGHT": "Death Knight",
  "DEMONHUNTER": "Demon Hunter",
  "DRUID": "Druid",
  "EVOKER": "Evoker",
  "HUNTER": "Hunter",
  "MAGE": "Mage",
  "MONK": "Monk",
  "PALADIN": "Paladin",
  "PRIEST": "Priest",
  "ROGUE": "Rogue",
  "SHAMAN": "Shaman",
  "WARLOCK": "Warlock",
  "WARRIOR": "Warrior",
};

// master_roster entry: { rank, lvl, class }
const masterRosterEntrySchema = z.object({
  rank: z.string().optional(),
  lvl: z.number().optional(),
  class: z.string().optional(),
});

// Online player entry in snapshot
const onlinePlayerSchema = z.object({
  rank: z.string().optional(),
  rankIndex: z.number().optional(),
  zone: z.string().optional(),
  status: z.union([z.number(), z.string()]).optional(),
  level: z.number().optional(),
  class: z.string().optional(),
});

// Stats snapshot entry
const statsSnapshotSchema = z.object({
  ts: z.number(),
  iso: z.string(),
  online: z.record(z.string(), onlinePlayerSchema),
  onlineCount: z.number(),
});

// Chat activity data entry
const chatDataEntrySchema = z.object({
  total: z.number().optional(),
  lastSeen: z.string().optional(),
  lastSeenTS: z.number().optional(),
  lastMessage: z.string().optional(),
  rankName: z.string().optional(),
  rankIndex: z.number().optional(),
  daily: z.record(z.string(), z.number()).optional(),
});

// Roster summary schema (counters from uploader)
const rosterSummarySchema = z.object({
  total: z.number().optional(),
  added: z.number().optional(),
  updated: z.number().optional(),
  removed: z.number().optional(),
  unchanged: z.number().optional(),
}).optional();

// Removed member entry schema
const removedMemberSchema = z.object({
  name: z.string(),
  reason: z.string().optional(),
});

// Roster mode enum
const rosterModeSchema = z.enum(["delta", "full", "no_change"]).optional();

// Session phase enum - controls batch upload behavior
const sessionPhaseSchema = z.enum(["start", "chunk", "final"]).optional();

// Main upload schema matching addon format
export const addonUploadSchema = z.object({
  master_roster: z.record(z.string(), masterRosterEntrySchema).optional(),
  stats: z.union([
    z.array(statsSnapshotSchema),
    z.record(z.string(), statsSnapshotSchema)
  ]).optional(),
  data: z.record(z.string(), chatDataEntrySchema).optional(),
  upload_session_id: z.string().optional(),
  is_final_batch: z.boolean().optional(),
  // Batch tracking fields
  batch_index: z.number().optional(),
  total_batches: z.number().optional(),
  batch_id: z.string().optional(), // For idempotency
  // Session phase control (start/chunk/final)
  session_phase: sessionPhaseSchema,
  sessionPhase: sessionPhaseSchema, // camelCase variant
  // Roster mode fields (snake_case)
  roster_mode: rosterModeSchema,
  removed_members: z.array(z.union([z.string(), removedMemberSchema])).optional(),
  roster_summary: rosterSummarySchema,
  reason: z.string().optional(),
  // Camel case variants (uploader may send either)
  rosterMode: rosterModeSchema,
  removedMembers: z.array(z.union([z.string(), removedMemberSchema])).optional(),
  rosterSummary: rosterSummarySchema,
});

export type AddonUploadData = z.infer<typeof addonUploadSchema>;
export type MasterRosterEntry = z.infer<typeof masterRosterEntrySchema>;
export type StatsSnapshot = z.infer<typeof statsSnapshotSchema>;
export type ChatDataEntry = z.infer<typeof chatDataEntrySchema>;
export type RosterMode = z.infer<typeof rosterModeSchema>;
export type RosterSummary = z.infer<typeof rosterSummarySchema>;

// ==================== ROSTER MANAGEMENT SYSTEM ====================

// Raid Schedules table - dynamic raid schedule management
export const raidSchedules = pgTable("raid_schedules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 1=Monday, etc.
  startTime: varchar("start_time", { length: 10 }).notNull(), // "20:00" format
  endTime: varchar("end_time", { length: 10 }).notNull(), // "23:00" format
  eventType: varchar("event_type", { length: 50 }).notNull().default("Progress"), // Progress, Farm, Alt Run, etc.
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRaidScheduleSchema = createInsertSchema(raidSchedules).omit({ id: true, createdAt: true, updatedAt: true });
export const selectRaidScheduleSchema = createSelectSchema(raidSchedules);
export type RaidSchedule = typeof raidSchedules.$inferSelect;
export type InsertRaidSchedule = z.infer<typeof insertRaidScheduleSchema>;

// Core Members table - tracks who is in the raid core
export const coreMembers = pgTable("core_members", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id", { length: 36 }).notNull(),
  role: varchar("role", { length: 20 }).notNull(), // tank, healer, dps
  isVisible: boolean("is_visible").default(true), // Toggle visibility in Core Roster
  priority: integer("priority").default(0), // For ordering within role (higher = more priority)
  joinedAt: timestamp("joined_at").defaultNow(),
  addedBy: varchar("added_by", { length: 100 }), // Admin who added them or "application"
  notes: text("notes"),
});

export const insertCoreMemberSchema = createInsertSchema(coreMembers).omit({ id: true, joinedAt: true });
export const selectCoreMemberSchema = createSelectSchema(coreMembers);
export type CoreMember = typeof coreMembers.$inferSelect;
export type InsertCoreMember = z.infer<typeof insertCoreMemberSchema>;

// Core Applications table - players applying to join the core
export const coreApplications = pgTable("core_applications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id", { length: 36 }).notNull(),
  playerName: varchar("player_name", { length: 50 }).notNull(),
  playerClass: varchar("player_class", { length: 50 }).notNull(),
  playerSpec: varchar("player_spec", { length: 50 }),
  desiredRole: varchar("desired_role", { length: 20 }).notNull(), // tank, healer, dps
  motivation: text("motivation"),
  experience: text("experience"),
  availability: text("availability"),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, accepted, declined
  reviewedBy: varchar("reviewed_by", { length: 100 }),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCoreApplicationSchema = createInsertSchema(coreApplications).omit({ 
  id: true, 
  status: true, 
  reviewedBy: true, 
  reviewedAt: true, 
  reviewNotes: true,
  createdAt: true 
});
export const selectCoreApplicationSchema = createSelectSchema(coreApplications);
export type CoreApplication = typeof coreApplications.$inferSelect;
export type InsertCoreApplication = z.infer<typeof insertCoreApplicationSchema>;

// Extended Core Member type with player data for display
export type CoreMemberWithPlayer = CoreMember & {
  player: Player;
  parseCount: number;
  avgParse: number;
  bestParse: number;
};
