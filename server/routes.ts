import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertPlayerSchema, 
  insertGuildSettingsSchema, 
  addonUploadSchema, 
  WOW_CLASS_MAP, 
  SPEC_ROLE_MAP,
  GUILD_RANK_ORDER,
  type StatsSnapshot,
  insertRaidScheduleSchema,
  insertCoreMemberSchema,
  insertCoreApplicationSchema,
} from "@shared/schema";
import { z } from "zod";
import { randomBytes } from "crypto";
import { fetchRaiderIODataForPlayer } from "./raiderio";
import { syncNextBatch, getSyncState, startPeriodicSync, stopPeriodicSync, triggerSinglePlayerSync, triggerDeepPlayerSync, importGuildRoster, getGuildRealmRank } from "./rio-sync";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { syncRaidProgress, getRaidProgressForZone, getWCLSyncState, startPeriodicWCLSync, stopPeriodicWCLSync, runWCLSync } from "./warcraftlogs";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication (must be before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);
  
  app.get("/api/players", async (req, res) => {
    try {
      const players = await storage.getPlayers();
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  app.get("/api/players/:id", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.id);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.json(player);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch player" });
    }
  });

  app.post("/api/players", async (req, res) => {
    try {
      const data = insertPlayerSchema.parse(req.body);
      const player = await storage.createPlayer(data);
      res.status(201).json(player);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid player data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create player" });
    }
  });

  app.patch("/api/players/:id", async (req, res) => {
    try {
      const updates = insertPlayerSchema.partial().parse(req.body);
      const player = await storage.updatePlayer(req.params.id, updates);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.json(player);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid player data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update player" });
    }
  });

  app.delete("/api/players/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePlayer(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete player" });
    }
  });

  // Bulk delete players by IDs
  app.post("/api/players/bulk-delete", isAuthenticated, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Array of player IDs required" });
      }

      const deletedCount = await storage.deletePlayersByIds(ids);
      
      await storage.createAdminAuditLog({
        action: "players_bulk_deleted",
        details: `Deleted ${deletedCount} players`,
        value: deletedCount,
      });

      res.json({ success: true, deleted: deletedCount });
    } catch (error) {
      console.error("Bulk delete error:", error);
      res.status(500).json({ error: "Failed to delete players" });
    }
  });

  app.get("/api/players/:id/mythic-runs", async (req, res) => {
    try {
      const runs = await storage.getMythicRuns(req.params.id);
      res.json(runs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch mythic runs" });
    }
  });

  app.get("/api/players/:id/parses", async (req, res) => {
    try {
      const parses = await storage.getRaidParses(req.params.id);
      res.json(parses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch raid parses" });
    }
  });

  app.get("/api/players/:id/rankings", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.id);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const allPlayers = await storage.getPlayers();
      let rankingPool = allPlayers.filter(p => p.isActive);
      
      if (!player.isActive) {
        rankingPool = [...rankingPool, player];
      }
      
      if (rankingPool.length === 0) {
        return res.json({
          globalRank: null,
          totalPlayers: 0,
          roleRank: null,
          totalInRole: 0,
          role: "dps",
          roleLabel: "DPS",
          mythicScore: player.mythicScore || 0,
        });
      }
      
      const sortedByScore = [...rankingPool].sort((a, b) => 
        (b.mythicScore || 0) - (a.mythicScore || 0)
      );
      
      const globalRankIdx = sortedByScore.findIndex(p => p.id === player.id);
      const globalRank = globalRankIdx >= 0 ? globalRankIdx + 1 : null;
      const totalPlayers = sortedByScore.length;
      
      const playerRole = player.spec ? SPEC_ROLE_MAP[player.spec] || "dps" : "dps";
      
      const rolePlayers = [...rankingPool].filter(p => {
        const role = p.spec ? SPEC_ROLE_MAP[p.spec] || "dps" : "dps";
        return role === playerRole;
      }).sort((a, b) => (b.mythicScore || 0) - (a.mythicScore || 0));
      
      const roleRankIdx = rolePlayers.findIndex(p => p.id === player.id);
      const roleRank = roleRankIdx >= 0 ? roleRankIdx + 1 : null;
      const totalInRole = rolePlayers.length;
      
      const roleLabel = playerRole === "tank" ? "Tank" : playerRole === "healer" ? "Healer" : "DPS";

      res.json({
        globalRank,
        totalPlayers,
        roleRank,
        totalInRole,
        role: playerRole,
        roleLabel,
        mythicScore: player.mythicScore || 0,
      });
    } catch (error) {
      console.error("Failed to fetch player rankings:", error);
      res.status(500).json({ error: "Failed to fetch player rankings" });
    }
  });

  app.get("/api/activity/heatmap", async (req, res) => {
    try {
      const heatmapData = await storage.getHeatmapData();
      res.json(heatmapData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch heatmap data" });
    }
  });

  app.get("/api/activity/events", async (req, res) => {
    try {
      const events = await storage.getActivityEvents();
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch activity events" });
    }
  });

  // Get recent guild mythic runs (2+ guild members together)
  app.get("/api/activity/guild-runs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const guildRuns = await storage.getGuildMythicRuns(limit);
      
      // Enrich with player class info for coloring
      const allPlayers = await storage.getPlayers();
      const playerClassMap = new Map(allPlayers.map(p => [p.name, p.class]));
      
      const enrichedRuns = guildRuns.map(run => ({
        ...run,
        playerClasses: run.guildPlayerNames.map(name => playerClassMap.get(name) || "Unknown")
      }));
      
      res.json(enrichedRuns);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch guild mythic runs" });
    }
  });

  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // Upload status endpoint for frontend polling
  app.get("/api/upload/status", async (req, res) => {
    try {
      const uploaderId = (req.query.uploaderId as string) || (req.query.uploader_id as string) || undefined;
      const status = await storage.getUploadStatus(uploaderId);
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch upload status" });
    }
  });

  app.get("/api/guild/rank", async (req, res) => {
    try {
      const settings = await storage.getGuildSettings();
      if (!settings?.name || !settings?.realm || !settings?.region) {
        return res.json({ realmRank: null, type: null });
      }
      const rank = await getGuildRealmRank(settings.name, settings.realm, settings.region);
      res.json(rank);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch guild rank" });
    }
  });

  // Protected admin routes - require authentication
  app.get("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getGuildSettings();
      res.json(settings || {});
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const data = insertGuildSettingsSchema.parse(req.body);
      const settings = await storage.updateGuildSettings(data);
      
      await storage.createAdminAuditLog({
        action: "settings_updated",
        details: `Updated guild settings for ${data.name}-${data.realm}`,
      });
      
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid settings data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.get("/api/leaderboard", async (req, res) => {
    try {
      const players = await storage.getPlayers();
      const sorted = players
        .filter(p => p.isActive)
        .sort((a, b) => (b.mythicScore || 0) - (a.mythicScore || 0))
        .slice(0, 20);
      res.json(sorted);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  // Admin danger zone routes - clear data
  app.post("/api/admin/clear-roster", isAuthenticated, async (req, res) => {
    try {
      const deletedCount = await storage.clearAllPlayers();
      await storage.createAdminAuditLog({
        action: "roster_cleared",
        details: `Cleared ${deletedCount} players from roster`,
      });
      res.json({ success: true, deleted: deletedCount });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear roster" });
    }
  });

  app.post("/api/admin/clear-mythic-runs", isAuthenticated, async (req, res) => {
    try {
      const deletedCount = await storage.clearAllMythicRuns();
      await storage.createAdminAuditLog({
        action: "mythic_runs_cleared",
        details: `Cleared ${deletedCount} M+ runs`,
      });
      res.json({ success: true, deleted: deletedCount });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear M+ runs" });
    }
  });

  app.post("/api/admin/clear-snapshots", isAuthenticated, async (req, res) => {
    try {
      const deletedCount = await storage.clearAllActivitySnapshots();
      await storage.createAdminAuditLog({
        action: "snapshots_cleared",
        details: `Cleared ${deletedCount} activity snapshots`,
      });
      res.json({ success: true, deleted: deletedCount });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear activity snapshots" });
    }
  });

  app.get("/api/mythic-runs", async (req, res) => {
    try {
      const runs = await storage.getMythicRuns();
      res.json(runs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch mythic runs" });
    }
  });

  app.get("/api/raid-parses", async (req, res) => {
    try {
      const parses = await storage.getRaidParses();
      res.json(parses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch raid parses" });
    }
  });

  // Role detection based on spec names
  const TANK_SPECS = ["Protection", "Blood", "Guardian", "Brewmaster", "Vengeance"];
  const HEALER_SPECS = ["Restoration", "Holy", "Discipline", "Mistweaver", "Preservation"];
  
  const getRoleFromSpec = (spec: string): "tank" | "healer" | "dps" => {
    if (TANK_SPECS.some(s => spec.includes(s))) return "tank";
    if (HEALER_SPECS.some(s => spec.includes(s))) return "healer";
    return "dps";
  };

  // Raid Core Roster - uses manual core members with visibility settings
  // Falls back to parse-based detection if no manual core members exist
  app.get("/api/raid-core", async (req, res) => {
    try {
      const coreMembers = await storage.getCoreMembers();
      const parses = await storage.getRaidParses();
      const players = await storage.getPlayers();
      
      // Create a map of player ID to player data
      const playerMap = new Map(players.map(p => [p.id, p]));
      
      // Aggregate parse stats for all players (for enrichment)
      const playerStats: Record<string, {
        parseCount: number;
        totalParse: number;
        bestParse: number;
        specs: Record<string, number>;
      }> = {};
      
      for (const parse of parses) {
        if (!playerStats[parse.playerId]) {
          playerStats[parse.playerId] = {
            parseCount: 0,
            totalParse: 0,
            bestParse: 0,
            specs: {},
          };
        }
        const stats = playerStats[parse.playerId];
        stats.parseCount++;
        stats.totalParse += parse.parsePercent;
        stats.bestParse = Math.max(stats.bestParse, parse.parsePercent);
        stats.specs[parse.spec] = (stats.specs[parse.spec] || 0) + 1;
      }
      
      // If we have manually managed core members, use them
      const visibleCoreMembers = coreMembers.filter(m => m.isVisible);
      
      if (visibleCoreMembers.length > 0) {
        // Use manually managed core roster
        const enrichedMembers = visibleCoreMembers.map(member => {
          const player = playerMap.get(member.playerId);
          const stats = playerStats[member.playerId] || { parseCount: 0, totalParse: 0, bestParse: 0, specs: {} };
          
          // Find primary spec from parses
          let primarySpec = player?.spec || "Unknown";
          let maxSpecCount = 0;
          for (const spec of Object.keys(stats.specs)) {
            if (stats.specs[spec] > maxSpecCount) {
              maxSpecCount = stats.specs[spec];
              primarySpec = spec;
            }
          }
          
          return {
            player: player || null,
            primaryRole: member.role as "tank" | "healer" | "dps",
            primarySpec,
            parseCount: stats.parseCount,
            avgParse: stats.parseCount > 0 ? Math.round(stats.totalParse / stats.parseCount) : 0,
            bestParse: Math.round(stats.bestParse),
            priority: member.priority || 0,
          };
        }).filter(m => m.player !== null);
        
        // Sort by priority (higher first), then by parse count
        const tanks = enrichedMembers
          .filter(r => r.primaryRole === "tank")
          .sort((a, b) => b.priority - a.priority || b.parseCount - a.parseCount);
          
        const healers = enrichedMembers
          .filter(r => r.primaryRole === "healer")
          .sort((a, b) => b.priority - a.priority || b.parseCount - a.parseCount);
          
        const dps = enrichedMembers
          .filter(r => r.primaryRole === "dps")
          .sort((a, b) => b.priority - a.priority || b.parseCount - a.parseCount);
        
        return res.json({ tanks, healers, dps });
      }
      
      // Fallback: Auto-detect core from parse data (original behavior)
      const coreRaiders: {
        player: typeof players[0];
        primaryRole: "tank" | "healer" | "dps";
        primarySpec: string;
        parseCount: number;
        avgParse: number;
        bestParse: number;
      }[] = [];
      
      for (const playerId of Object.keys(playerStats)) {
        const stats = playerStats[playerId];
        const player = playerMap.get(playerId);
        if (!player) continue;
        
        // Find primary role (most used)
        let primaryRole: "tank" | "healer" | "dps" = "dps";
        const roles: Record<string, number> = {};
        
        for (const parse of parses.filter(p => p.playerId === playerId)) {
          const role = getRoleFromSpec(parse.spec);
          roles[role] = (roles[role] || 0) + 1;
        }
        
        let maxRoleCount = 0;
        for (const role of Object.keys(roles)) {
          if (roles[role] > maxRoleCount) {
            maxRoleCount = roles[role];
            primaryRole = role as "tank" | "healer" | "dps";
          }
        }
        
        // Find primary spec
        let primarySpec = player.spec || "Unknown";
        let maxSpecCount = 0;
        for (const spec of Object.keys(stats.specs)) {
          if (stats.specs[spec] > maxSpecCount) {
            maxSpecCount = stats.specs[spec];
            primarySpec = spec;
          }
        }
        
        coreRaiders.push({
          player,
          primaryRole,
          primarySpec,
          parseCount: stats.parseCount,
          avgParse: Math.round(stats.totalParse / stats.parseCount),
          bestParse: Math.round(stats.bestParse),
        });
      }
      
      // Sort each role by parse count (most logged first)
      const tanks = coreRaiders
        .filter(r => r.primaryRole === "tank")
        .sort((a, b) => b.parseCount - a.parseCount)
        .slice(0, 2);
        
      const healers = coreRaiders
        .filter(r => r.primaryRole === "healer")
        .sort((a, b) => b.parseCount - a.parseCount)
        .slice(0, 4);
        
      const dps = coreRaiders
        .filter(r => r.primaryRole === "dps")
        .sort((a, b) => b.parseCount - a.parseCount)
        .slice(0, 14);
      
      res.json({ tanks, healers, dps });
    } catch (error) {
      console.error("Error fetching raid core:", error);
      res.status(500).json({ error: "Failed to fetch raid core composition" });
    }
  });

  // Helper: parse player name in "Name-Realm" format
  function parsePlayerName(fullName: string, defaultRealm: string): { name: string; realm: string } {
    if (fullName.includes("-")) {
      const [name, ...realmParts] = fullName.split("-");
      return { name, realm: realmParts.join("-") };
    }
    return { name: fullName, realm: defaultRealm };
  }

  // Helper: convert addon class to display class
  function normalizeClass(addonClass: string | undefined): string {
    if (!addonClass) return "Warrior";
    return WOW_CLASS_MAP[addonClass.toUpperCase()] || addonClass;
  }

  app.post("/api/upload", async (req, res) => {
    try {
      const apiKey = req.headers["x-api-key"] as string;
      if (!apiKey) {
        return res.status(401).json({ error: "API key required" });
      }

      const uploaderId = ((req.headers["x-uploader-id"] as string) || "default").trim();

      const settings = await storage.getGuildSettings();
      if (!uploaderKey && (!settings?.uploadApiKey || settings.uploadApiKey !== apiKey)) {
        return res.status(403).json({ error: "Invalid API key" });
      }

      const uploaderId = uploaderKey?.uploaderId || (settings?.uploadApiKey === apiKey ? "legacy" : null);

      const data = addonUploadSchema.parse(req.body);
      const defaultRealm = settings?.realm || "Unknown";

      let playersProcessed = 0;
      let snapshotsProcessed = 0;
      let chatDataProcessed = 0;
      let removedCount = 0;

      // Normalize camelCase/snake_case fields
      const rosterMode = data.roster_mode || data.rosterMode || null;
      const sessionPhase = data.session_phase || data.sessionPhase || null;
      const removedMembers = data.removed_members || data.removedMembers || [];
      const addUpdateOnly = data.add_update_only ?? data.addUpdateOnly ?? false;
      const confirmRemovals = data.confirm_removals ?? data.confirmRemovals ?? false;
      const baseRosterHash = data.base_roster_hash || data.baseRosterHash || null;
      const rosterSummary = data.roster_summary || data.rosterSummary || null;
      const uploadReason = data.reason || null;
      const batchIndex = data.batch_index;
      const totalBatches = data.total_batches;
      const isBatchedUpload = rosterMode && rosterMode !== 'no_change' && batchIndex !== undefined && !!sessionPhase;

      // Legacy session-based handling (for backwards compatibility when no roster_mode)
      const incomingSessionId = data.upload_session_id;
      const isFinalBatch = data.is_final_batch === true;

      let uploaderStatus = await storage.ensureUploaderStatus(uploaderId);
      const currentSessionId = incomingSessionId ?? uploaderStatus.lastSessionId ?? null;

      // If a new session starts, reset expected batch tracking
      if (incomingSessionId && incomingSessionId !== uploaderStatus.lastSessionId) {
        uploaderStatus = await storage.updateUploaderStatus(uploaderId, {
          lastSessionId: incomingSessionId,
          lastBatchIndex: -1,
          expectedBatchIndex: 0,
          status: "processing",
          totalBatches: totalBatches ?? null,
          lastError: null,
          lastPhase: sessionPhase ?? null,
        });
      }

      // Validate batch ordering for batched uploads
      if (isBatchedUpload) {
        const expectedIndex = sessionPhase === 'start'
          ? 0
          : ((uploaderStatus.lastBatchIndex ?? -1) + 1);

        if (batchIndex !== expectedIndex) {
          const status = await storage.markUploaderOutOfOrder(uploaderId, {
            expectedBatchIndex: expectedIndex,
            receivedBatchIndex: batchIndex,
            sessionId: currentSessionId,
            totalBatches: totalBatches ?? null,
            lastPhase: sessionPhase,
          });

          return res.status(409).json({
            error: "Batch out of order",
            expectedBatchIndex: expectedIndex,
            receivedBatchIndex: batchIndex ?? null,
            action: "reprocess",
            uploaderStatus: status,
          });
        }
      }

      // Helper to parse removed members (can be string or {name, reason} object)
      const parseRemovedMember = (member: string | { name: string; reason?: string }): { name: string; realm: string } => {
        const fullName = typeof member === 'string' ? member : member.name;
        return parsePlayerName(fullName, defaultRealm);
      };

      const removalGuardPassed =
        removedMembers.length > 0 &&
        !addUpdateOnly &&
        (confirmRemovals || !!baseRosterHash);

      const removalSkipReason = removedMembers.length === 0
        ? null
        : addUpdateOnly
          ? "add_update_only flag enabled"
          : (confirmRemovals || baseRosterHash)
            ? null
            : "removals require confirm_removals or base_roster_hash";

      // Helper to upsert players from roster (used by all modes)
      const upsertRosterPlayers = async () => {
        if (!data.master_roster) return 0;
        let count = 0;
        for (const fullName of Object.keys(data.master_roster)) {
          const entry = data.master_roster[fullName];
          const { name, realm } = parsePlayerName(fullName, defaultRealm);
          
          await storage.upsertPlayer({
            name,
            realm,
            class: normalizeClass(entry.class),
            level: entry.lvl || 80,
            guildRank: entry.rank || "Member",
            isActive: true,
          });
          count++;
        }
        return count;
      };

      console.log(`Upload received: uploader=${uploaderId || 'default'}, mode=${rosterMode || 'legacy'}, phase=${sessionPhase || 'none'}, batch=${batchIndex ?? 'n/a'}/${totalBatches ?? 'n/a'}, roster=${Object.keys(data.master_roster || {}).length}, removed=${removedMembers.length}`);

      // ============================================================
      // GOLDEN RULE: NEVER mark players inactive just because they
      // didn't come in THIS batch. Only deactivate explicitly via
      // removed_members on the FINAL phase.
      // ============================================================

      // Validate: if roster_mode is set and batched (has batch_index), require session_phase
      // This prevents falling into legacy mode accidentally
      if (rosterMode && rosterMode !== 'no_change' && batchIndex !== undefined && !sessionPhase) {
        return res.status(400).json({ 
          error: "session_phase required for batched uploads",
          hint: "Use session_phase: 'start' for first batch, 'chunk' for intermediate, 'final' for last batch"
        });
      }

      // Process based on roster_mode
      if (rosterMode === 'no_change') {
        // Heartbeat mode - no roster changes, just update timestamp
        await storage.clearUploadSession(uploaderId); // Update lastCompletedAt
        console.log('Heartbeat received (no_change mode) - no roster mutations');
        
      } else if (rosterMode === 'delta' || rosterMode === 'full') {
        // Both delta and full modes use session_phase for batched uploads
        // Key insight: "absence in a batch" NEVER means removal
        
        if (sessionPhase === 'start') {
          // START phase: Initialize session, don't touch any players
          if (incomingSessionId) {
            const currentSession = await storage.getCurrentUploadSession(uploaderId);
            // Only start session if it's a new one (guard against re-processing)
            if (currentSession.sessionId !== incomingSessionId) {
              await storage.startUploadSession(uploaderId, incomingSessionId);
              console.log(`Started upload session ${incomingSessionId} for uploader ${uploaderId} (${rosterMode} mode)`);
            } else {
              console.log(`Session ${incomingSessionId} already active, continuing...`);
            }
          }
          // Upsert any players in this batch
          playersProcessed = await upsertRosterPlayers();
          
        } else if (sessionPhase === 'chunk') {
          // CHUNK phase: Just upsert players, don't touch anything else
          playersProcessed = await upsertRosterPlayers();
          console.log(`Chunk batch ${batchIndex}/${totalBatches}: processed ${playersProcessed} players`);
          
        } else if (sessionPhase === 'final') {
          // FINAL phase: Upsert remaining players, then process removals
          playersProcessed = await upsertRosterPlayers();

          // Only now do we process explicit removals
          if (removalGuardPassed) {
            const playersToRemove = removedMembers.map(parseRemovedMember);
            removedCount = await storage.deactivatePlayersByName(playersToRemove);
            console.log(`Final batch: deactivated ${removedCount} explicitly removed players`);
          } else if (removalSkipReason) {
            console.log(`Final batch: skipped processing removed_members (${removalSkipReason})`);
          }
          
          // Clear session
          await storage.clearUploadSession(uploaderId);
          console.log(`Upload session completed (${rosterMode} mode) for uploader ${uploaderId}: ${playersProcessed} in final batch, ${removedCount} removed`);
          
        } else {
          // No session_phase provided - single-batch upload (backwards compat)
          // Just upsert players and process removals if present
          playersProcessed = await upsertRosterPlayers();

          if (removalGuardPassed) {
            const playersToRemove = removedMembers.map(parseRemovedMember);
            removedCount = await storage.deactivatePlayersByName(playersToRemove);
          } else if (removalSkipReason) {
            console.log(`Single-batch ${rosterMode || 'legacy'} mode: skipped processing removed_members (${removalSkipReason})`);
          }
          
          // If is_final_batch is true, clear session
          if (isFinalBatch) {
            await storage.clearUploadSession(uploaderId);
          }

          console.log(`Single-batch ${rosterMode} mode for uploader ${uploaderId}: processed ${playersProcessed} players, removed ${removedCount}`);
        }
        
      } else {
        // Legacy mode (no roster_mode specified) - backwards compatible with old uploader
        // This mode uses the old session-based logic where a new session marks all inactive
        const currentSession = await storage.getCurrentUploadSession(uploaderId);

        // If new session ID provided and different from current, start new session
        if (incomingSessionId && incomingSessionId !== currentSession.sessionId) {
          // New upload session - mark all existing players as inactive
          const markedInactive = await storage.markAllPlayersInactive();
          await storage.startUploadSession(uploaderId, incomingSessionId);
          console.log(`[LEGACY] Started new upload session ${incomingSessionId} for uploader ${uploaderId}, marked ${markedInactive} players inactive`);
        }

        // Process master_roster
        playersProcessed = await upsertRosterPlayers();

        if (playersProcessed > 0) {
          await storage.incrementUploadProcessedCount(uploaderId, playersProcessed);
        }

        if (isFinalBatch && incomingSessionId) {
          await storage.clearUploadSession(uploaderId);
          console.log(`[LEGACY] Upload session ${incomingSessionId} for uploader ${uploaderId} completed. Players not in roster remain inactive.`);
        }
      }

      // Update processed count for new modes
      if (rosterMode && playersProcessed > 0) {
        await storage.incrementUploadProcessedCount(uploaderId, playersProcessed);
      }

      // 2. Process stats array - activity snapshots with online players
      if (data.stats) {
        const statsArray: StatsSnapshot[] = Array.isArray(data.stats) 
          ? data.stats 
          : Object.values(data.stats);

        for (const snapshot of statsArray) {
          const timestamp = new Date(snapshot.iso);
          if (isNaN(timestamp.getTime())) continue;

          // Convert to Miami timezone (America/New_York) for heatmap display
          const miamiTime = new Date(timestamp.toLocaleString("en-US", { timeZone: "America/New_York" }));
          // Convert from JS getDay() (0=Sunday) to Monday-first format (0=Monday) for frontend
          const jsDay = miamiTime.getDay();
          const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1; // Sunday(0) → 6, Monday(1) → 0, etc.
          const hourOfDay = miamiTime.getHours();

          await storage.createActivitySnapshot({
            timestamp,
            totalOnline: snapshot.onlineCount,
            dayOfWeek,
            hourOfDay,
          });
          snapshotsProcessed++;

          // Update lastSeen for online players in this snapshot
          for (const fullName of Object.keys(snapshot.online)) {
            const playerInfo = snapshot.online[fullName];
            const { name, realm } = parsePlayerName(fullName, defaultRealm);
            
            await storage.updatePlayerLastSeen(name, realm, timestamp);
            
            // Also update class/rank if we have it
            if (playerInfo.class || playerInfo.rank) {
              await storage.upsertPlayer({
                name,
                realm,
                class: normalizeClass(playerInfo.class),
                level: playerInfo.level || 80,
                guildRank: playerInfo.rank || "Member",
                isActive: true,
              });
            }
          }
        }
      }

      // 3. Process data - chat activity counts (only update if total is provided)
      if (data.data) {
        for (const fullName of Object.keys(data.data)) {
          const chatEntry = data.data[fullName];
          const { name, realm } = parsePlayerName(fullName, defaultRealm);

          // Update message count for existing players only if total is defined
          const existing = await storage.getPlayerByName(name, realm);
          if (existing) {
            const updates: Partial<{ 
              messagesCount: number; 
              guildRank: string; 
              lastMessage: string;
              lastMessageTime: Date;
            }> = {};
            
            // Only update messagesCount if explicitly provided
            if (chatEntry.total !== undefined && chatEntry.total !== null) {
              updates.messagesCount = chatEntry.total;
            }
            
            // Only update guildRank if provided and not empty
            if (chatEntry.rankName && chatEntry.rankName !== "—") {
              updates.guildRank = chatEntry.rankName;
            }
            
            // Store last message content and timestamp
            if (chatEntry.lastMessage) {
              updates.lastMessage = chatEntry.lastMessage;
            }
            if (chatEntry.lastSeenTS) {
              updates.lastMessageTime = new Date(chatEntry.lastSeenTS * 1000);
            } else if (chatEntry.lastSeen) {
              updates.lastMessageTime = new Date(chatEntry.lastSeen);
            }
            
            if (Object.keys(updates).length > 0) {
              await storage.updatePlayer(existing.id, updates);
              chatDataProcessed++;
            }
          }
        }
      }

      // Update uploader tracking after successful processing
      if (isBatchedUpload && batchIndex !== undefined) {
        const completed = sessionPhase === 'final' || isFinalBatch;
        await storage.updateUploaderStatus(uploaderId, {
          lastBatchIndex: batchIndex,
          expectedBatchIndex: completed ? 0 : batchIndex + 1,
          lastSessionId: currentSessionId,
          lastPhase: sessionPhase ?? null,
          totalBatches: totalBatches ?? null,
          status: completed ? 'idle' : 'processing',
          lastError: null,
        });
      } else if (incomingSessionId) {
        await storage.updateUploaderStatus(uploaderId, {
          lastSessionId: currentSessionId,
          lastPhase: sessionPhase ?? null,
          totalBatches: totalBatches ?? null,
          status: sessionPhase === 'final' || isFinalBatch ? 'idle' : 'processing',
          lastError: null,
        });
      }

      console.log(`Upload processed: mode=${rosterMode || 'legacy'}, ${playersProcessed} players, ${removedCount} removed, ${snapshotsProcessed} snapshots, ${chatDataProcessed} chat entries`);

      await storage.createAdminAuditLog({
        action: "data_upload",
        details: `Mode: ${rosterMode || 'legacy'}, ${playersProcessed} players, ${removedCount} removed, ${snapshotsProcessed} snapshots, ${chatDataProcessed} chat${uploadReason ? ` (${uploadReason})` : ''}`,
        value: playersProcessed + snapshotsProcessed + chatDataProcessed,
        uploaderId,
      });

      res.json({ 
        success: true,
        rosterMode: rosterMode || 'legacy',
        sessionPhase: sessionPhase || null,
        batch: batchIndex !== undefined ? { index: batchIndex, total: totalBatches } : null,
        processed: {
          players: playersProcessed,
          removed: removedCount,
          snapshots: snapshotsProcessed,
          chatData: chatDataProcessed,
        },
        summary: rosterSummary || null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation error:", error.errors);
        return res.status(400).json({ error: "Invalid upload data", details: error.errors });
      }
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to process upload" });
    }
  });

  app.post("/api/settings/generate-api-key", isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getGuildSettings();
      if (!settings) {
        return res.status(400).json({ error: "Guild settings must be configured first" });
      }

      const uploaderId = typeof req.body?.uploaderId === "string" && req.body.uploaderId.trim()
        ? req.body.uploaderId.trim()
        : "default_uploader";
      const newApiKey = randomBytes(32).toString("hex");

      await storage.upsertUploaderKey({
        uploaderId,
        apiKey: newApiKey,
        isActive: true,
      });

      await storage.updateGuildSettings({
        ...settings,
        uploadApiKey: newApiKey,
      });

      res.json({ apiKey: newApiKey, uploaderId });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate API key" });
    }
  });

  app.get("/api/admin/audit-logs", isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const logs = await storage.getAdminAuditLogs(limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  app.post("/api/sync/raiderio", isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getGuildSettings();
      const region = settings?.region?.toLowerCase() || "us";
      
      console.log("Starting Raider.IO batch sync...");
      const result = await syncNextBatch(region);
      console.log(`Raider.IO batch sync: ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`);
      
      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error("Raider.IO sync error:", error);
      res.status(500).json({ error: "Failed to sync with Raider.IO" });
    }
  });

  app.get("/api/sync/status", async (req, res) => {
    try {
      const state = getSyncState();
      res.json(state);
    } catch (error) {
      res.status(500).json({ error: "Failed to get sync status" });
    }
  });

  app.get("/api/guild-mythic-runs/count", async (req, res) => {
    try {
      const count = await storage.getGuildMythicRunsCount();
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to get guild mythic runs count" });
    }
  });

  app.post("/api/sync/start", isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getGuildSettings();
      const region = settings?.region?.toLowerCase() || "us";
      
      startPeriodicSync(region);
      res.json({ success: true, message: "Periodic sync started" });
    } catch (error) {
      res.status(500).json({ error: "Failed to start periodic sync" });
    }
  });

  app.post("/api/sync/stop", isAuthenticated, async (req, res) => {
    try {
      stopPeriodicSync();
      res.json({ success: true, message: "Periodic sync stopped" });
    } catch (error) {
      res.status(500).json({ error: "Failed to stop periodic sync" });
    }
  });

  // Warcraft Logs sync endpoints
  app.get("/api/sync/warcraftlogs/status", async (req, res) => {
    try {
      const state = getWCLSyncState();
      res.json(state);
    } catch (error) {
      res.status(500).json({ error: "Failed to get WCL sync status" });
    }
  });

  app.post("/api/sync/warcraftlogs/start", isAuthenticated, async (req, res) => {
    try {
      startPeriodicWCLSync();
      res.json({ success: true, message: "Periodic WCL sync started (runs every 1 hour)" });
    } catch (error) {
      res.status(500).json({ error: "Failed to start periodic WCL sync" });
    }
  });

  app.post("/api/sync/warcraftlogs/stop", isAuthenticated, async (req, res) => {
    try {
      stopPeriodicWCLSync();
      res.json({ success: true, message: "Periodic WCL sync stopped" });
    } catch (error) {
      res.status(500).json({ error: "Failed to stop periodic WCL sync" });
    }
  });

  app.get("/api/raid-reports", async (req, res) => {
    try {
      const reports = await storage.getRaidReports();
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch raid reports" });
    }
  });

  app.get("/api/raid-reports/count", async (req, res) => {
    try {
      const count = await storage.getRaidReportsCount();
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch raid reports count" });
    }
  });

  // Auto-start WCL periodic sync if credentials are configured
  (async () => {
    try {
      const settings = await storage.getGuildSettings();
      if (settings?.warcraftLogsClientId && settings?.warcraftLogsClientSecret) {
        console.log("WCL credentials found, starting periodic sync...");
        startPeriodicWCLSync();
      }
    } catch (error) {
      console.error("Failed to auto-start WCL sync:", error);
    }
  })();

  // Auto-start RaiderIO periodic sync (always active, runs every 20 minutes)
  // Unified sync: updates player stats AND detects guild runs for all players
  console.log("Starting RaiderIO unified sync (500 players every 20 minutes with guild run detection)...");
  startPeriodicSync("us");

  // Import from RaiderIO is DISABLED - Uploader is the sole source of truth for roster membership
  app.post("/api/sync/import-guild", isAuthenticated, async (req, res) => {
    return res.status(400).json({ 
      error: "Guild roster import from RaiderIO is disabled. Use the Uploader addon to manage guild membership. RaiderIO sync only updates stats for existing roster members." 
    });
  });

  // Get distinct guild ranks from current roster (for dynamic dropdown filters)
  // Sorted by hierarchy order (highest rank first)
  app.get("/api/guild-ranks", async (req, res) => {
    try {
      const ranks = await storage.getDistinctGuildRanks();
      
      // Normalize function: lowercase + remove diacritics for comparison
      const normalize = (s: string) => 
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
      // Build lookup map with normalized keys for O(1) access
      const orderMap = new Map<string, number>();
      GUILD_RANK_ORDER.forEach((rank, idx) => {
        orderMap.set(normalize(rank), idx);
      });
      
      // Sort by hierarchy order (ranks not in order go to end)
      const sortedRanks = [...ranks].sort((a, b) => {
        const orderA = orderMap.get(normalize(a)) ?? 999;
        const orderB = orderMap.get(normalize(b)) ?? 999;
        return orderA - orderB;
      });
      res.json(sortedRanks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch guild ranks" });
    }
  });

  app.post("/api/sync/player/:id", async (req, res) => {
    try {
      const settings = await storage.getGuildSettings();
      const region = settings?.region?.toLowerCase() || "us";
      
      const success = await triggerSinglePlayerSync(req.params.id, region);
      if (!success) {
        return res.status(404).json({ error: "Player not found or sync failed" });
      }
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync player" });
    }
  });

  // Deep sync - fetches ALL M+ run types for comprehensive stats tracking
  app.post("/api/sync/player/:id/deep", async (req, res) => {
    try {
      const settings = await storage.getGuildSettings();
      const region = settings?.region?.toLowerCase() || "us";
      
      const result = await triggerDeepPlayerSync(req.params.id, region);
      if (!result.success) {
        // Distinguish between different error types
        let status = 500;
        if (result.error === "Player not found") {
          status = 404;
        } else if (result.error === "Player not found on Raider.IO") {
          status = 404;
        }
        return res.status(status).json({ error: result.error || "Sync failed" });
      }
      
      res.json({ 
        success: true, 
        runsFound: result.runsFound,
        newRuns: result.newRuns 
      });
    } catch (error) {
      console.error("Deep sync endpoint error:", error);
      res.status(500).json({ error: "Failed to deep sync player" });
    }
  });

  app.get("/api/players/:id/raiderio", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.id);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const settings = await storage.getGuildSettings();
      const region = settings?.region?.toLowerCase() || "us";
      
      const data = await fetchRaiderIODataForPlayer(player.name, player.realm, region);
      if (!data) {
        return res.status(404).json({ error: "No Raider.IO data found for this player" });
      }

      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Raider.IO data" });
    }
  });

  // Raid Progress endpoints
  app.get("/api/raid-progress", async (req, res) => {
    try {
      const zoneName = req.query.zone as string | undefined;
      const progress = await getRaidProgressForZone(zoneName);
      
      if (!progress) {
        return res.json(null);
      }
      
      res.json(progress);
    } catch (error) {
      console.error("Error fetching raid progress:", error);
      res.status(500).json({ error: "Failed to fetch raid progress" });
    }
  });

  app.post("/api/sync/warcraftlogs", isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getGuildSettings();
      if (!settings) {
        return res.status(400).json({ error: "Guild settings not configured" });
      }
      
      if (!settings.warcraftLogsClientId || !settings.warcraftLogsClientSecret) {
        return res.status(400).json({ error: "Warcraft Logs Client ID and Secret not configured" });
      }
      
      const result = await syncRaidProgress(
        settings.warcraftLogsClientId,
        settings.warcraftLogsClientSecret,
        settings.name,
        settings.realm,
        settings.region?.toLowerCase() || "us"
      );
      
      res.json({
        success: true,
        synced: result.synced,
        reportsStored: result.reportsStored,
        zone: result.zone,
        message: result.reportsStored > 0 || result.synced > 0 
          ? `Stored ${result.reportsStored} new reports, synced ${result.synced} boss kills${result.zone ? ` for ${result.zone}` : ''}` 
          : "No new raid data found on Warcraft Logs"
      });
    } catch (error) {
      console.error("Warcraft Logs sync error:", error);
      res.status(500).json({ error: "Failed to sync from Warcraft Logs" });
    }
  });

  // ==================== RAID SCHEDULE ROUTES ====================
  
  // Get all raid schedules (public)
  app.get("/api/raid-schedules", async (req, res) => {
    try {
      const schedules = await storage.getRaidSchedules();
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching raid schedules:", error);
      res.status(500).json({ error: "Failed to fetch raid schedules" });
    }
  });

  // Create raid schedule (admin only)
  app.post("/api/raid-schedules", isAuthenticated, async (req, res) => {
    try {
      const data = insertRaidScheduleSchema.parse(req.body);
      const schedule = await storage.createRaidSchedule(data);
      
      await storage.createAdminAuditLog({
        action: "raid_schedule_created",
        details: `Created raid schedule: ${data.name} on day ${data.dayOfWeek}`,
      });
      
      res.status(201).json(schedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid schedule data", details: error.errors });
      }
      console.error("Error creating raid schedule:", error);
      res.status(500).json({ error: "Failed to create raid schedule" });
    }
  });

  // Update raid schedule (admin only)
  app.patch("/api/raid-schedules/:id", isAuthenticated, async (req, res) => {
    try {
      const updates = insertRaidScheduleSchema.partial().parse(req.body);
      const schedule = await storage.updateRaidSchedule(req.params.id, updates);
      
      if (!schedule) {
        return res.status(404).json({ error: "Raid schedule not found" });
      }
      
      await storage.createAdminAuditLog({
        action: "raid_schedule_updated",
        details: `Updated raid schedule: ${schedule.name}`,
      });
      
      res.json(schedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid schedule data", details: error.errors });
      }
      console.error("Error updating raid schedule:", error);
      res.status(500).json({ error: "Failed to update raid schedule" });
    }
  });

  // Delete raid schedule (admin only)
  app.delete("/api/raid-schedules/:id", isAuthenticated, async (req, res) => {
    try {
      const schedule = await storage.getRaidSchedule(req.params.id);
      if (!schedule) {
        return res.status(404).json({ error: "Raid schedule not found" });
      }
      
      await storage.deleteRaidSchedule(req.params.id);
      
      await storage.createAdminAuditLog({
        action: "raid_schedule_deleted",
        details: `Deleted raid schedule: ${schedule.name}`,
      });
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting raid schedule:", error);
      res.status(500).json({ error: "Failed to delete raid schedule" });
    }
  });

  // ==================== CORE MEMBER ROUTES ====================
  
  // Get all core members (public)
  app.get("/api/core-members", async (req, res) => {
    try {
      const members = await storage.getCoreMembers();
      
      // Enrich with player data
      const enrichedMembers = await Promise.all(members.map(async (member) => {
        const player = await storage.getPlayer(member.playerId);
        const parses = await storage.getRaidParses(member.playerId);
        
        return {
          ...member,
          player: player || null,
          parseCount: parses.length,
          avgParse: parses.length > 0 
            ? Math.round(parses.reduce((sum, p) => sum + p.parsePercent, 0) / parses.length)
            : 0,
          bestParse: parses.length > 0 
            ? Math.round(Math.max(...parses.map(p => p.parsePercent)))
            : 0,
        };
      }));
      
      res.json(enrichedMembers);
    } catch (error) {
      console.error("Error fetching core members:", error);
      res.status(500).json({ error: "Failed to fetch core members" });
    }
  });

  // Add core member (admin only)
  app.post("/api/core-members", isAuthenticated, async (req, res) => {
    try {
      const data = insertCoreMemberSchema.parse(req.body);
      
      // Check if player is already a core member
      const existing = await storage.getCoreMemberByPlayerId(data.playerId);
      if (existing) {
        return res.status(400).json({ error: "Player is already a core member" });
      }
      
      const member = await storage.createCoreMember(data);
      const player = await storage.getPlayer(data.playerId);
      
      await storage.createAdminAuditLog({
        action: "core_member_added",
        details: `Added ${player?.name || 'Unknown'} to raid core as ${data.role}`,
      });
      
      res.status(201).json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid core member data", details: error.errors });
      }
      console.error("Error adding core member:", error);
      res.status(500).json({ error: "Failed to add core member" });
    }
  });

  // Update core member visibility/priority (admin only)
  app.patch("/api/core-members/:id", isAuthenticated, async (req, res) => {
    try {
      const updates = insertCoreMemberSchema.partial().parse(req.body);
      const member = await storage.updateCoreMember(req.params.id, updates);
      
      if (!member) {
        return res.status(404).json({ error: "Core member not found" });
      }
      
      const player = await storage.getPlayer(member.playerId);
      
      await storage.createAdminAuditLog({
        action: "core_member_updated",
        details: `Updated core member: ${player?.name || 'Unknown'} (visible: ${member.isVisible})`,
      });
      
      res.json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid update data", details: error.errors });
      }
      console.error("Error updating core member:", error);
      res.status(500).json({ error: "Failed to update core member" });
    }
  });

  // Remove core member (admin only)
  app.delete("/api/core-members/:id", isAuthenticated, async (req, res) => {
    try {
      const member = await storage.getCoreMember(req.params.id);
      if (!member) {
        return res.status(404).json({ error: "Core member not found" });
      }
      
      const player = await storage.getPlayer(member.playerId);
      await storage.deleteCoreMember(req.params.id);
      
      await storage.createAdminAuditLog({
        action: "core_member_removed",
        details: `Removed ${player?.name || 'Unknown'} from raid core`,
      });
      
      res.status(204).send();
    } catch (error) {
      console.error("Error removing core member:", error);
      res.status(500).json({ error: "Failed to remove core member" });
    }
  });

  // ==================== CORE APPLICATION ROUTES ====================
  
  // Get all applications (admin only - or filter by status)
  app.get("/api/core-applications", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const applications = await storage.getCoreApplications(status);
      res.json(applications);
    } catch (error) {
      console.error("Error fetching core applications:", error);
      res.status(500).json({ error: "Failed to fetch core applications" });
    }
  });

  // Submit core application (public)
  app.post("/api/core-applications", async (req, res) => {
    try {
      const data = insertCoreApplicationSchema.parse(req.body);
      
      // Check for existing pending application
      const existing = await storage.getCoreApplicationByPlayerId(data.playerId);
      if (existing) {
        return res.status(400).json({ error: "You already have a pending application" });
      }
      
      // Check if already a core member
      const coreMember = await storage.getCoreMemberByPlayerId(data.playerId);
      if (coreMember) {
        return res.status(400).json({ error: "You are already a core member" });
      }
      
      const application = await storage.createCoreApplication(data);
      
      await storage.createAdminAuditLog({
        action: "core_application_submitted",
        details: `${data.playerName} applied to join core as ${data.desiredRole}`,
      });
      
      res.status(201).json(application);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid application data", details: error.errors });
      }
      console.error("Error submitting core application:", error);
      res.status(500).json({ error: "Failed to submit application" });
    }
  });

  // Review core application - accept/decline (admin only)
  app.patch("/api/core-applications/:id/review", isAuthenticated, async (req, res) => {
    try {
      const { status, reviewNotes } = req.body;
      
      if (!["accepted", "declined"].includes(status)) {
        return res.status(400).json({ error: "Status must be 'accepted' or 'declined'" });
      }
      
      const application = await storage.getCoreApplication(req.params.id);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      
      if (application.status !== "pending") {
        return res.status(400).json({ error: "Application has already been reviewed" });
      }
      
      // Get admin username
      const user = (req as any).user;
      const reviewedBy = user?.username || "Admin";
      
      // Update application
      const updatedApplication = await storage.updateCoreApplication(req.params.id, {
        status,
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes,
      });
      
      // If accepted, add to core members
      if (status === "accepted") {
        await storage.createCoreMember({
          playerId: application.playerId,
          role: application.desiredRole,
          addedBy: `Application (${reviewedBy})`,
          notes: `Applied with motivation: ${application.motivation || 'Not provided'}`,
        });
      }
      
      await storage.createAdminAuditLog({
        action: `core_application_${status}`,
        details: `${reviewedBy} ${status} ${application.playerName}'s application for ${application.desiredRole}`,
      });
      
      res.json(updatedApplication);
    } catch (error) {
      console.error("Error reviewing core application:", error);
      res.status(500).json({ error: "Failed to review application" });
    }
  });

  // Delete application (admin only)
  app.delete("/api/core-applications/:id", isAuthenticated, async (req, res) => {
    try {
      const application = await storage.getCoreApplication(req.params.id);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      
      await storage.deleteCoreApplication(req.params.id);
      
      await storage.createAdminAuditLog({
        action: "core_application_deleted",
        details: `Deleted application from ${application.playerName}`,
      });
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting core application:", error);
      res.status(500).json({ error: "Failed to delete application" });
    }
  });

  // Get players with raid logs for core selection (admin only)
  app.get("/api/core-candidates", isAuthenticated, async (req, res) => {
    try {
      const allParses = await storage.getRaidParses();
      const playerMap = new Map<string, any>();
      
      // Aggregate parse data by player
      for (const parse of allParses) {
        if (!playerMap.has(parse.playerId)) {
          const player = await storage.getPlayer(parse.playerId);
          if (player) {
            playerMap.set(parse.playerId, {
              player,
              parseCount: 0,
              totalParse: 0,
              bestParse: 0,
              specs: new Set<string>(),
            });
          }
        }
        
        const data = playerMap.get(parse.playerId);
        if (data) {
          data.parseCount++;
          data.totalParse += parse.parsePercent;
          data.bestParse = Math.max(data.bestParse, parse.parsePercent);
          data.specs.add(parse.spec);
        }
      }
      
      // Check which are already core members
      const coreMembers = await storage.getCoreMembers();
      const coreMemberPlayerIds = new Set(coreMembers.map(m => m.playerId));
      
      const candidates = Array.from(playerMap.values()).map(data => ({
        player: data.player,
        parseCount: data.parseCount,
        avgParse: Math.round(data.totalParse / data.parseCount),
        bestParse: Math.round(data.bestParse),
        specs: Array.from(data.specs),
        isCoreMember: coreMemberPlayerIds.has(data.player.id),
      })).sort((a, b) => b.parseCount - a.parseCount);
      
      res.json(candidates);
    } catch (error) {
      console.error("Error fetching core candidates:", error);
      res.status(500).json({ error: "Failed to fetch core candidates" });
    }
  });

  return httpServer;
}
