import { storage } from "./storage";
import type { InsertRaidProgress, InsertRaidReport, RaidZoneProgress } from "@shared/schema";

const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
const API_URL = "https://www.warcraftlogs.com/api/v2/client";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  // Trim whitespace from credentials to prevent auth failures
  const trimmedClientId = clientId.trim();
  const trimmedClientSecret = clientSecret.trim();
  
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const auth = Buffer.from(`${trimmedClientId}:${trimmedClientSecret}`).toString("base64");
  
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000)
  };

  return cachedToken.token;
}

async function graphqlQuery(token: string, query: string, variables?: Record<string, unknown>) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

const FIND_GUILD_QUERY = `
query FindGuild($name: String!, $serverSlug: String!, $serverRegion: String!) {
  guildData {
    guild(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
      id
      name
    }
  }
}
`;

// Simplified query without fights to reduce complexity
const GET_GUILD_REPORTS_QUERY = `
query GetGuildReports($guildID: Int!, $limit: Int) {
  reportData {
    reports(guildID: $guildID, limit: $limit) {
      data {
        code
        title
        startTime
        endTime
        owner {
          name
        }
        zone {
          id
          name
        }
        segments
      }
    }
  }
}
`;

// Separate query to get fights for a specific report
const GET_REPORT_FIGHTS_QUERY = `
query GetReportFights($code: String!) {
  reportData {
    report(code: $code) {
      fights(killType: Encounters) {
        encounterID
        name
        kill
        difficulty
        fightPercentage
      }
    }
  }
}
`;

const GET_ZONE_ENCOUNTERS_QUERY = `
query GetZoneEncounters($zoneID: Int!) {
  worldData {
    zone(id: $zoneID) {
      id
      name
      encounters {
        id
        name
      }
    }
  }
}
`;

const DIFFICULTY_MAP: Record<number, string> = {
  1: "LFR",
  3: "Normal",
  4: "Heroic",
  5: "Mythic"
};

export async function findGuildId(
  clientId: string,
  clientSecret: string,
  guildName: string,
  realm: string,
  region: string
): Promise<number | null> {
  try {
    const token = await getAccessToken(clientId, clientSecret);
    // WCL uses lowercase realm with no spaces or apostrophes (e.g., "quelthalas" not "quel-thalas")
    const serverSlug = realm.toLowerCase().replace(/['\s-]/g, "");
    
    console.log(`WCL: Looking for guild "${guildName}" on server "${serverSlug}" region "${region.toUpperCase()}"`);
    
    const data = await graphqlQuery(token, FIND_GUILD_QUERY, {
      name: guildName,
      serverSlug,
      serverRegion: region.toUpperCase()
    });

    const guildId = data?.guildData?.guild?.id || null;
    console.log(`WCL: Guild ID found: ${guildId}`);
    return guildId;
  } catch (error) {
    console.error("Error finding guild:", error);
    return null;
  }
}

export interface WCLRaidReport {
  code: string;
  title: string;
  startTime: number;
  endTime: number;
  owner?: { name: string };
  zone: { id: number; name: string } | null;
  segments?: number;
}

export interface WCLFight {
  encounterID: number;
  name: string;
  kill: boolean;
  difficulty: number;
  fightPercentage: number;
}

export async function fetchGuildReports(
  clientId: string,
  clientSecret: string,
  guildId: number,
  limit: number = 100
): Promise<WCLRaidReport[]> {
  const token = await getAccessToken(clientId, clientSecret);
  
  const data = await graphqlQuery(token, GET_GUILD_REPORTS_QUERY, {
    guildID: guildId,
    limit
  });

  return data?.reportData?.reports?.data || [];
}

export async function fetchZoneEncounters(
  clientId: string,
  clientSecret: string,
  zoneId: number
): Promise<{ id: number; name: string }[]> {
  const token = await getAccessToken(clientId, clientSecret);
  
  const data = await graphqlQuery(token, GET_ZONE_ENCOUNTERS_QUERY, {
    zoneID: zoneId
  });

  return data?.worldData?.zone?.encounters || [];
}

export async function fetchReportFights(
  clientId: string,
  clientSecret: string,
  reportCode: string
): Promise<WCLFight[]> {
  const token = await getAccessToken(clientId, clientSecret);
  
  const data = await graphqlQuery(token, GET_REPORT_FIGHTS_QUERY, {
    code: reportCode
  });

  return data?.reportData?.report?.fights || [];
}

export async function syncRaidProgress(
  clientId: string,
  clientSecret: string,
  guildName: string,
  realm: string,
  region: string
): Promise<{ synced: number; reportsStored: number; zone: string | null }> {
  const guildId = await findGuildId(clientId, clientSecret, guildName, realm, region);
  
  if (!guildId) {
    console.log(`Guild not found on Warcraft Logs: ${guildName}-${realm}`);
    return { synced: 0, reportsStored: 0, zone: null };
  }

  // Fetch ALL reports (up to 100 most recent) - without fights to reduce complexity
  const reports = await fetchGuildReports(clientId, clientSecret, guildId, 100);
  
  if (reports.length === 0) {
    console.log("No reports found for guild");
    return { synced: 0, reportsStored: 0, zone: null };
  }

  console.log(`WCL: Found ${reports.length} reports for guild`);

  // Store ALL reports in the database (skip duplicates)
  let reportsStored = 0;
  for (const report of reports) {
    const existing = await storage.getRaidReportByCode(report.code);
    if (!existing) {
      const reportData: InsertRaidReport = {
        code: report.code,
        title: report.title,
        owner: report.owner?.name || null,
        startTime: new Date(report.startTime),
        endTime: new Date(report.endTime),
        zoneId: report.zone?.id || null,
        zoneName: report.zone?.name || null,
        segmentsCount: report.segments || 0,
        fightsCount: 0, // Will be updated when we fetch fights
      };
      await storage.upsertRaidReport(reportData);
      reportsStored++;
    }
  }
  console.log(`Stored ${reportsStored} new reports (${reports.length - reportsStored} already existed)`);

  // Process raid progress from reports - group by zone
  const reportsByZone = new Map<number, WCLRaidReport[]>();
  for (const report of reports) {
    if (report.zone) {
      const existing = reportsByZone.get(report.zone.id) || [];
      existing.push(report);
      reportsByZone.set(report.zone.id, existing);
    }
  }

  if (reportsByZone.size === 0) {
    return { synced: 0, reportsStored, zone: null };
  }

  const sortedZones = Array.from(reportsByZone.entries())
    .map(([zoneId, zoneReports]) => ({
      zoneId,
      zoneName: zoneReports[0].zone?.name || "Unknown",
      latestReport: Math.max(...zoneReports.map(r => r.endTime))
    }))
    .sort((a, b) => b.latestReport - a.latestReport);

  const latestZone = sortedZones[0];
  const zoneReports = reportsByZone.get(latestZone.zoneId) || [];
  
  console.log(`WCL: Processing ${zoneReports.length} reports for zone "${latestZone.zoneName}"`);

  const bossKills = new Map<string, {
    encounterID: number;
    name: string;
    difficulty: string;
    killCount: number;
    bestPercent: number;
    lastKillTime: number;
    reportCode: string;
  }>();

  // Fetch fights for each report in the latest zone (rate limit: process sequentially)
  for (const report of zoneReports) {
    try {
      const fights = await fetchReportFights(clientId, clientSecret, report.code);
      
      for (const fight of fights) {
        if (fight.kill) {
          const difficulty = DIFFICULTY_MAP[fight.difficulty] || "Normal";
          const key = `${fight.encounterID}-${difficulty}`;
          
          const existing = bossKills.get(key);
          if (existing) {
            existing.killCount++;
            if (report.endTime > existing.lastKillTime) {
              existing.lastKillTime = report.endTime;
              existing.reportCode = report.code;
            }
            if (fight.fightPercentage !== undefined && fight.fightPercentage < existing.bestPercent) {
              existing.bestPercent = fight.fightPercentage;
            }
          } else {
            bossKills.set(key, {
              encounterID: fight.encounterID,
              name: fight.name,
              difficulty,
              killCount: 1,
              bestPercent: fight.fightPercentage ?? 0,
              lastKillTime: report.endTime,
              reportCode: report.code
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to fetch fights for report ${report.code}:`, error);
    }
  }

  let synced = 0;
  const bossKillsArray = Array.from(bossKills.values());
  for (const boss of bossKillsArray) {
    const progressData: InsertRaidProgress = {
      zoneName: latestZone.zoneName,
      zoneId: latestZone.zoneId,
      difficulty: boss.difficulty,
      bossName: boss.name,
      bossId: boss.encounterID,
      killCount: boss.killCount,
      bestPercent: boss.bestPercent,
      lastKillTimestamp: new Date(boss.lastKillTime),
      reportCode: boss.reportCode
    };
    
    await storage.upsertRaidProgress(progressData);
    synced++;
  }

  console.log(`Synced ${synced} boss kills for ${latestZone.zoneName}`);
  return { synced, reportsStored, zone: latestZone.zoneName };
}

export async function getRaidProgressForZone(zoneName?: string): Promise<RaidZoneProgress | null> {
  const progress = await storage.getRaidProgress(zoneName);
  
  if (progress.length === 0) {
    return null;
  }

  const grouped = new Map<string, typeof progress>();
  for (const p of progress) {
    const key = `${p.zoneName}-${p.difficulty}`;
    const existing = grouped.get(key) || [];
    existing.push(p);
    grouped.set(key, existing);
  }

  const heroicKey = Array.from(grouped.keys()).find(k => k.includes("Heroic"));
  const mythicKey = Array.from(grouped.keys()).find(k => k.includes("Mythic"));
  const normalKey = Array.from(grouped.keys()).find(k => k.includes("Normal"));
  
  const preferredKey = mythicKey || heroicKey || normalKey || Array.from(grouped.keys())[0];
  const zoneProgress = grouped.get(preferredKey) || progress;

  if (zoneProgress.length === 0) {
    return null;
  }

  const totalBosses = 8;
  
  return {
    zoneName: zoneProgress[0].zoneName,
    zoneId: zoneProgress[0].zoneId,
    difficulty: zoneProgress[0].difficulty,
    bosses: zoneProgress.map(p => ({
      name: p.bossName,
      bossId: p.bossId,
      killed: (p.killCount ?? 0) > 0,
      killCount: p.killCount ?? 0,
      bestPercent: p.bestPercent ?? undefined,
      lastKill: p.lastKillTimestamp?.toISOString()
    })),
    totalBosses,
    killedBosses: zoneProgress.filter(p => (p.killCount ?? 0) > 0).length
  };
}

// Warcraft Logs periodic sync state
const WCL_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

interface WCLSyncState {
  isRunning: boolean;
  periodicActive: boolean;
  lastSync: Date | null;
  nextSyncScheduled: Date | null;
  lastSyncResult: {
    reportsStored: number;
    bossesUpdated: number;
    zone: string | null;
  } | null;
}

const wclSyncState: WCLSyncState = {
  isRunning: false,
  periodicActive: false,
  lastSync: null,
  nextSyncScheduled: null,
  lastSyncResult: null,
};

let wclSyncIntervalId: NodeJS.Timeout | null = null;

export function getWCLSyncState(): WCLSyncState {
  return { ...wclSyncState };
}

export async function runWCLSync(): Promise<{ reportsStored: number; synced: number; zone: string | null } | null> {
  if (wclSyncState.isRunning) {
    console.log("WCL sync already in progress, skipping...");
    return null;
  }

  const settings = await storage.getGuildSettings();
  if (!settings?.warcraftLogsClientId || !settings?.warcraftLogsClientSecret) {
    console.log("WCL sync: Missing credentials, skipping...");
    return null;
  }

  try {
    wclSyncState.isRunning = true;
    
    const result = await syncRaidProgress(
      settings.warcraftLogsClientId,
      settings.warcraftLogsClientSecret,
      settings.name,
      settings.realm,
      settings.region?.toLowerCase() || "us"
    );

    wclSyncState.lastSync = new Date();
    wclSyncState.lastSyncResult = {
      reportsStored: result.reportsStored,
      bossesUpdated: result.synced,
      zone: result.zone,
    };

    await storage.createAdminAuditLog({
      action: "warcraftlogs_sync",
      details: `Synced ${result.reportsStored} reports, ${result.synced} boss kills${result.zone ? ` from ${result.zone}` : ""}`,
      value: result.synced,
    });

    return result;
  } catch (error) {
    console.error("WCL sync error:", error);
    return null;
  } finally {
    wclSyncState.isRunning = false;
  }
}

export function startPeriodicWCLSync(): void {
  if (wclSyncIntervalId) {
    console.log("Periodic WCL sync already running");
    return;
  }

  console.log(`Starting periodic Warcraft Logs sync (every ${WCL_SYNC_INTERVAL_MS / 1000 / 60} minutes)`);
  wclSyncState.periodicActive = true;
  
  // Run initial sync
  runWCLSync().then(result => {
    if (result) {
      console.log(`Initial WCL sync: ${result.reportsStored} reports stored, ${result.synced} boss kills synced`);
    }
    wclSyncState.nextSyncScheduled = new Date(Date.now() + WCL_SYNC_INTERVAL_MS);
  });

  // Schedule periodic syncs
  wclSyncIntervalId = setInterval(async () => {
    try {
      wclSyncState.nextSyncScheduled = null;
      const result = await runWCLSync();
      if (result) {
        console.log(`Periodic WCL sync: ${result.reportsStored} reports stored, ${result.synced} boss kills synced`);
      }
      wclSyncState.nextSyncScheduled = new Date(Date.now() + WCL_SYNC_INTERVAL_MS);
    } catch (error) {
      console.error("Periodic WCL sync error:", error);
    }
  }, WCL_SYNC_INTERVAL_MS);
}

export function stopPeriodicWCLSync(): void {
  if (wclSyncIntervalId) {
    clearInterval(wclSyncIntervalId);
    wclSyncIntervalId = null;
    wclSyncState.periodicActive = false;
    wclSyncState.nextSyncScheduled = null;
    console.log("Periodic Warcraft Logs sync stopped");
  }
}
