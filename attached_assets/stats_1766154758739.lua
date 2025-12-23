local addonName = ...
local GAT = _G[addonName]

-- =========================================================
-- Guild Activity Tracker (GAT) - stats.lua (MASTER ROSTER)
-- =========================================================

local SNAPSHOT_INTERVAL = 600        -- 10 min
local MIN_SNAPSHOT_DELAY = 60        -- 1 min throttle

GAT.LastSnapshotTime = GAT.LastSnapshotTime or 0
GAT.StatsActive = GAT.StatsActive or false
GAT.SnapshotTimer = GAT.SnapshotTimer or nil

local function Now() return time() end

-- Normalización estricta: Nombre-Reino
local function GetCanonicalName(name)
    if not name then return nil end
    if name:find("-") then return name end
    
    local myRealm = GetNormalizedRealmName() or GetRealmName()
    if myRealm then
        myRealm = myRealm:gsub(" ", "") 
        return name .. "-" .. myRealm
    end
    return name
end

local function EnsureDB()
    GAT.db = GAT.db or {}
    GAT.db.stats = GAT.db.stats or {}
    -- master_roster: La única fuente de verdad. Se reinicia en cada snapshot.
    GAT.db.master_roster = GAT.db.master_roster or {} 
end

local function CancelTimer()
    if GAT.SnapshotTimer and GAT.SnapshotTimer.Cancel then
        GAT.SnapshotTimer:Cancel()
    end
    GAT.SnapshotTimer = nil
end

function GAT:ScheduleNextSnapshot()
    CancelTimer()
    GAT.SnapshotTimer = C_Timer.NewTimer(SNAPSHOT_INTERVAL, function()
        GAT:TakeActivitySnapshot(false, false)
    end)
end

function GAT:TakeActivitySnapshot(force, immediate)
    EnsureDB()
    if not IsInGuild() then return end

    local now = Now()
    if not force and (now - (GAT.LastSnapshotTime or 0) < MIN_SNAPSHOT_DELAY) then
        return
    end

    local function SaveData()
        EnsureDB()
        local numMembers = GetNumGuildMembers()
        local onlineCount = 0
        
        -- 1. LIMPIEZA TOTAL DE LA LISTA MAESTRA ANTERIOR
        -- Esto asegura que si alguien se fue, desaparece de aquí.
        GAT.db.master_roster = {} 

        local snapshot = {
            ts = now,
            iso = date("!%Y-%m-%dT%H:%M:%SZ", now),
            online = {},
            onlineCount = 0
        }

        for i = 1, numMembers do
            local ok, err = pcall(function()
                local name, rank, rankIndex, level, classDisplay, zone, note, officerNote,
                      isOnline, status, classFileName, achievementPoints, achievementRank,
                      isMobile = GetGuildRosterInfo(i)

                if name then
                    local key = GetCanonicalName(name)
                    
                    -- AGREGAR A LA LISTA MAESTRA (Solo los presentes)
                    GAT.db.master_roster[key] = {
                        rank = rank,
                        lvl = level,
                        class = classFileName
                    }

                    if isOnline then
                        onlineCount = onlineCount + 1
                        snapshot.online[key] = {
                            rank = rank,
                            status = status or (isMobile and "MOBILE" or "ONLINE"),
                            zone = zone or ""
                        }
                    end
                end
            end)
        end

        snapshot.onlineCount = onlineCount
        table.insert(GAT.db.stats, snapshot)

        -- Limpieza de historial de snapshots (no afecta al roster)
        local MAX_SNAPSHOTS = 2000
        if #GAT.db.stats > MAX_SNAPSHOTS then
            local excess = #GAT.db.stats - MAX_SNAPSHOTS
            for _ = 1, excess do table.remove(GAT.db.stats, 1) end
        end

        GAT.LastSnapshotTime = now
        GAT:ScheduleNextSnapshot()
        
        -- Feedback visual en el juego para saber que se actualizó
        print("|cff00ff00[GAT]|r Roster actualizado: " .. numMembers .. " miembros.")
    end

    if immediate then
        SaveData()
    else
        if C_GuildInfo and C_GuildInfo.GuildRoster then C_GuildInfo.GuildRoster() end
        C_Timer.After(2, SaveData)
    end
end

function GAT:InitStats()
    if GAT.StatsActive then return end
    EnsureDB()
    GAT.StatsActive = true
    GAT:ScheduleNextSnapshot()

    local f = CreateFrame("Frame")
    f:RegisterEvent("PLAYER_ENTERING_WORLD")
    f:RegisterEvent("PLAYER_LOGOUT")
    f:RegisterEvent("GUILD_ROSTER_UPDATE")
    
    f:SetScript("OnEvent", function(_, event)
        if event == "PLAYER_ENTERING_WORLD" then
            GAT:TakeActivitySnapshot(false, false)
        elseif event == "PLAYER_LOGOUT" then
            GAT:TakeActivitySnapshot(true, true)
        elseif event == "GUILD_ROSTER_UPDATE" then
            local now = Now()
            if (now - (GAT.LastSnapshotTime or 0) > MIN_SNAPSHOT_DELAY) then
                C_Timer.After(2, function() GAT:TakeActivitySnapshot(false, false) end)
            end
        end
    end)
end

local loader = CreateFrame("Frame")
loader:RegisterEvent("PLAYER_LOGIN")
loader:SetScript("OnEvent", function() if GAT and GAT.InitStats then GAT:InitStats() end end)