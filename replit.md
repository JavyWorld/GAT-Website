# GAT-Web - Guild Activity Tracker

## Overview
GAT-Web is a World of Warcraft guild management platform featuring the "Ethereal Chronomancy" dark fantasy design theme. It tracks guild activity through external uploader snapshots, M+ scores, raid performance, and message counts.

**Important Constraint**: The system cannot track individual online/offline status or activity time. Only snapshot data (player counts at time intervals) and message counts are available from the external uploader.

## Architecture

### Frontend (React + TypeScript)
- **Framework**: React with Vite, using wouter for routing
- **Styling**: Tailwind CSS with custom WoW-themed design tokens
- **State Management**: TanStack Query for server state
- **Components**: Shadcn/UI with custom WoW-themed components

### Backend (Express + TypeScript)
- **Server**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **API**: RESTful endpoints prefixed with `/api`

### Database Schema
- **players**: Guild member data (name, realm, class, spec, itemLevel, mythicScore, messagesCount, lastMessage, lastMessageTime)
- **activity_snapshots**: Time-based snapshots of player counts for heatmap
- **mythic_runs**: M+ dungeon completions
- **raid_parses**: Warcraft Logs parse data
- **raid_progress**: Guild raid boss kills synced from Warcraft Logs (zoneName, difficulty, bossName, killCount)
- **activity_events**: Activity feed events
- **guild_settings**: Guild configuration including upload API key and Warcraft Logs API credentials

### Design Theme: Ethereal Chronomancy
- Deep abysal blue backgrounds (#0a0e1a)
- Arcane blue glow effects (hsl 210, 90%, 55%)
- Gold accents (hsl 43, 85%, 55%)
- Cinzel display font for headings
- WoW class colors for player display

## Key Features

### Dashboard
- KPI cards (Active Members, Avg Online from snapshots, Avg M+ Score, Raid Progress)
- Activity heatmap computed from snapshot data
- Recent activity feed
- Top M+ players quick view

### Roster
- Full player table with sorting/filtering
- Class filter, rank filter, search
- Click to view player profile

### Chats
- Guild chat activity from uploader
- Member list with message counts
- Last message and timestamp for each member
- Filter by rank, sort by most messages or most recent
- Real-time relative timestamps ("2 hours ago")

### Player Profile
- Item Level, M+ Score, Messages count
- Raid parses with parse percentile coloring
- M+ run history

### Leaderboard
- Top 10 M+ rankings with podium display
- Healer and Tank specific leaderboards

### Raid Analytics
- Boss progress tracking
- Raid schedule display
- Parse distribution visualization

### Admin Panel
- Guild settings configuration
- Upload API key generation for external uploader
- Warcraft Logs API sync for raid progress
- Activity audit log

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/players | Get all players |
| GET | /api/players/:id | Get player by ID |
| POST | /api/players | Create player |
| PATCH | /api/players/:id | Update player |
| DELETE | /api/players/:id | Delete player |
| GET | /api/players/:id/mythic-runs | Get player M+ runs |
| GET | /api/players/:id/parses | Get player raid parses |
| GET | /api/activity/heatmap | Get heatmap data (computed from snapshots) |
| GET | /api/activity/events | Get activity events |
| GET | /api/dashboard/stats | Get dashboard statistics |
| GET | /api/settings | Get guild settings |
| POST | /api/settings | Update guild settings |
| POST | /api/settings/generate-api-key | Generate upload API key |
| GET | /api/leaderboard | Get M+ leaderboard |
| POST | /api/upload | Upload data from external uploader (requires X-API-Key header) |
| GET | /api/raid-progress | Get raid boss progress from Warcraft Logs |
| POST | /api/sync/warcraftlogs | Sync raid progress from Warcraft Logs (requires auth) |

## External Uploader Integration

The `/api/upload` endpoint accepts data from an external Python uploader:

**Headers**: `X-API-Key: <your-api-key>`

### Roster Modes

The uploader can specify a `roster_mode` to control how roster changes are processed:

| Mode | Description |
|------|-------------|
| `delta` | Incremental updates only. Players in `master_roster` are upserted. Only players in `removed_members` are soft-deleted. Missing players are NOT affected. |
| `full` | Complete roster snapshot via batches. All batched players are upserted. Only `removed_members` are soft-deleted at the end. |
| `no_change` | Heartbeat only. No roster modifications, just updates the last upload timestamp. Useful for activity-only uploads. |
| (none) | Legacy mode. Uses session-based batch processing for backwards compatibility. |

### Session Phases (for batched uploads)

**GOLDEN RULE**: "Absence in a batch" NEVER means removal. Only players in `removed_members` are deactivated, and only on the `final` phase.

| Phase | Description |
|-------|-------------|
| `start` | First batch. Initializes upload session. Upserts players in this batch. Does NOT touch other players. |
| `chunk` | Intermediate batch. Just upserts players, nothing else. |
| `final` | Last batch. Upserts remaining players, then processes `removed_members` and closes session. |

**Request Body with Session Phase** (batched full upload):
```json
{
  "roster_mode": "full",
  "session_phase": "start",
  "upload_session_id": "abc123",
  "batch_index": 0,
  "total_batches": 20,
  "master_roster": {
    "Thrallor-Area52": {
      "rank": "Raider",
      "class": "WARRIOR",
      "lvl": 80
    }
  },
  "stats": [...],
  "data": {...}
}
```

**Final batch includes removed_members**:
```json
{
  "roster_mode": "full",
  "session_phase": "final",
  "upload_session_id": "abc123",
  "batch_index": 19,
  "total_batches": 20,
  "is_final_batch": true,
  "master_roster": {...},
  "removed_members": [
    "OldPlayer-Area52",
    {"name": "LeftPlayer-Area52", "reason": "left guild"}
  ],
  "roster_summary": {
    "total": 1000,
    "added": 5,
    "removed": 2,
    "updated": 50,
    "unchanged": 943
  },
  "reason": "full_roster_sync"
}
```

**Response includes**:
```json
{
  "success": true,
  "rosterMode": "full",
  "sessionPhase": "chunk",
  "batch": {"index": 5, "total": 20},
  "processed": {
    "players": 50,
    "removed": 0,
    "snapshots": 0,
    "chatData": 0
  },
  "summary": null
}
```

**Legacy Request Body** (no roster_mode):
```json
{
  "upload_session_id": "abc123",
  "is_final_batch": true,
  "master_roster": {...},
  "stats": [...],
  "data": {...}
}
```

## Development

### Database Commands
```bash
npm run db:push          # Push schema changes to database
npm run db:push --force  # Force push if needed
```

### Running the Application
```bash
npm run dev
```
This starts both the Express backend and Vite frontend on port 5000.

### Project Structure
```
├── client/src/
│   ├── components/     # Reusable UI components
│   ├── pages/          # Route pages
│   ├── hooks/          # Custom React hooks
│   └── lib/            # Utilities and query client
├── server/
│   ├── routes.ts       # API routes
│   ├── storage.ts      # Database storage implementation
│   ├── db.ts           # Drizzle database connection
│   └── index.ts        # Server entry point
└── shared/
    └── schema.ts       # Drizzle tables and Zod schemas
```

## Recent Changes
- Migrated from in-memory storage to PostgreSQL with Drizzle ORM
- Removed isOnline and weeklyActivity fields (uploader limitation)
- Updated Dashboard to show avgOnlineByHour and totalSnapshots instead of realtime online count
- Updated Player Profile to show only Item Level, M+ Score, and Messages
- Removed online status indicators from Roster and Player Profile
- Added /api/upload endpoint with API key authentication
- Added /api/settings/generate-api-key endpoint
- Created upload data schemas for external uploader integration
- Added Replit Auth for admin panel protection
  - Admin routes (settings, sync) require authentication
  - Public routes (roster, leaderboard, dashboard) remain accessible
  - /api/auth/user returns null for unauthenticated users (no 401)
- **Batch Upload System with Soft-Delete**
  - Changed from hard-delete to soft-delete (isActive flag) for roster management
  - Uploader sends `upload_session_id` and `is_final_batch` to coordinate batch uploads
  - When new session starts, all players marked isActive=false
  - Players in batch are marked isActive=true as they arrive
  - After final batch, players not seen remain inactive (not deleted)
  - Show/Hide Inactive toggle restored to Roster page
  - Multi-select checkboxes + Delete Selected button for manual cleanup
- Added Chats page to display guild chat activity
  - Shows member list with message counts, last message, and timestamp
  - Filter by rank, sort by most messages or most recent
  - Only shows active (isActive=true) players
  - Data comes from external uploader's chat tracking
- Added lastMessage and lastMessageTime fields to players table
- Fixed Warcraft Logs sync query complexity issue
  - Split GraphQL queries to stay under 50,000 complexity limit
  - Reports fetched separately from fights data
- Added Admin role system
  - Only users with Admin status can access the Admin Panel
  - First authenticated user can become admin (first-time setup)
  - adminUserIds stored in guild_settings table
  - Admin Panel link hidden from sidebar for non-admins
- Activity Heatmap now uses Miami timezone (America/New_York)
  - All timestamps converted to Eastern Time for display
  - Label indicates "Miami Time" in heatmap header
- **RaiderIO Auto-Sync Always Active**
  - Syncs 500 players every 30 minutes (always running, not optional)
  - Rotation logic prioritizes players with oldest lastRioSync timestamp
  - Randomizes order for players synced within same hour to minimize repetition
  - API limit: 1000 queries/min allowed, using 500 queries per 30-min cycle
  - Auto-starts on server startup (no manual start required)
- **Guild M+ Activity Feed**
  - Detects when 2+ guild members complete a Mythic+ dungeon together
  - Guild runs stored in `guild_mythic_runs` table (prevents duplicates via runKey)
  - Creates activity_events of type "guild_mythic_run" for Activity Feed
  - Shows dungeon, key level, and all participating guild members
- **Guild Runs Fast Detection (Every 3 Minutes)**
  - Polls RaiderIO every 3 minutes for faster guild run detection
  - Queries top 20 active M+ players from roster (sorted by mythicScore)
  - Step 1: Fetch recent run IDs from character profiles
  - Step 2: Fetch full roster via run-details endpoint for each unique run
  - Detects guild groups (2+ members) and creates activity events
  - Deduplication via runKey prevents duplicate entries
  - Admin Panel shows sync status with countdown timer
- **Player Statistics Tracking**
  - Tracks aggregate M+ stats: totalRunsTracked, mostPlayedDungeon, runsInTime/runsOverTime
  - Level brackets: runsByLevelLow (1-6), runsByLevelMid (7-9), runsByLevelHigh (10-14), runsByLevelElite (15+)
  - Only 5 most recent runs stored per player (auto-cleanup of old runs)
  - Stats updated only for new runs (deduplication via runKey)
- **Roster Management System**
  - New admin-only page at /roster-management with 3 tabs: Core Members, Applications, Add Members
  - Three database tables: raidSchedules, coreMembers, coreApplications
  - Manual core roster management with visibility toggles and priority settings
  - Application workflow: players submit via Raids page, admins approve/decline in Roster Management
  - /api/raid-core endpoint prioritizes manual core members over parse-based auto-detection
  - Role detection: Tank (Protection/Blood/Guardian/Brewmaster/Vengeance), Healer (Restoration/Holy/Discipline/Mistweaver/Preservation), DPS (all others)
- **Dynamic Raid Schedules**
  - Raid schedule CRUD in Admin Panel (Raid Schedule section)
  - Schedules display on Raids page with day name, times, and event type
  - Event types: Progress, Farm, Alt Run
- **Raids Page Improvements**
  - "Apply to Core" button opens modal form for player applications
  - Core Performance card replaces old Attendance section (shows real stats from core members)
  - Parse distribution computed from actual core member data

## User Preferences
- Dark mode by default (class="dark" on body)
- WoW-inspired fantasy aesthetic
- Information-dense but clean layouts
- No online/offline tracking (uploader constraint)
