# GAT-Web Design Guidelines: "Ethereal Chronomancy"

## Design Approach
**Reference-Based**: World of Warcraft UI aesthetics (Ulduar architecture, Arcane/Titan magic) combined with cosmic/ethereal elements. This creates a dark fantasy gaming interface that honors WoW's visual language while maintaining modern web UX principles.

## Core Visual Identity

### Atmosphere & Background
- **Primary Background**: Deep abysal blue (#0a0e1a to #000000), evoking WoW's cosmic Void/space
- **Animated Elements**: Subtle floating thread-like filaments moving slowly across the background, creating living energy effect
- **Thread Colors**: Shift per section - Gold (dashboard/success), Red (alerts/conflict), Arcane Blue (#4a9eff) for stats/magic
- **Edge Treatment**: Stone vignette texture mimicking Ulduar/dungeon architecture, creating portal/window framing effect

### Typography System

**Display (H1/H2)**
- Font: Gothic serif with sharp edges (Cinzel or Friz Quadrata style)
- Effect: Subtle glow (drop-shadow) in gold (#d4af37) or cyan (#4a9eff)
- Usage: Page titles, section headers, hero text

**Body Text**
- Font: Clean, readable serif on semi-transparent dark containers
- Color: Bone/beige (#e8dcc4) for optimal contrast
- Backgrounds: Semi-transparent obsidian or parchment textures

**Data/Stats**
- Font: Monospace or condensed gothic for numbers
- Colors: Class-based (Warrior=tan, Mage=cyan, etc.) or metric-based (green=good, red=bad)

## Layout Architecture

### Spacing System
Tailwind units: **4, 6, 8, 12, 16** (e.g., p-4, gap-8, my-12)
- Component padding: p-6 to p-8
- Section spacing: py-16 to py-24
- Card gaps: gap-6

### Container Philosophy
**Medieval UI Frames**: Information lives inside decorative containers, never floating
- Dark metallic borders (iron/bronze #3a3022)
- Corner decorations: Gem accents or rivet details
- Backgrounds: Semi-transparent obsidian glass (#1a1a2e at 85% opacity) or aged parchment texture
- Border styling: 2px solid with subtle inset shadow

### Navigation
**Top Bar**: Fixed header with stone/metal texture
- Guild emblem (left)
- Main nav links with hover glow effect
- User profile/login (right)
- Active state: Glowing underline in arcane blue

**Sidebar** (Admin Panel): Dark sidebar with vertical navigation, icon + label, active state highlighted with colored border

## Component Library

### Cards (Roster, Stats, KPIs)
- Container: Dark glass with metallic border
- Header: Class-colored accent bar at top
- Content: Structured data with icon indicators
- Hover: Subtle lift (shadow-lg) + border glow

### Tables (Roster & Members)
- Header: Dark stone texture with gold text
- Rows: Alternating transparency for readability
- Hover: Row highlight with class color tint
- Sortable columns: Chevron indicators
- Status Indicators: Green/gray dots for online/offline

### Buttons
**Primary**: Stone-textured with engraved text
- Base: Dark gray (#2d2d3a) with subtle texture
- Hover: Arcane blue (#4a9eff) glow, magical shimmer
- Active: Press-down effect (shadow-inner)

**Secondary**: Outlined metallic with transparent fill

### Player Profiles
- Hero: 3D character render with class-themed background gradient
- Stats Grid: 2-3 columns of metric cards
- Activity Graph: Line chart with glowing data points
- Parse Colors: WarcraftLogs standard (gray→green→blue→purple→orange→pink)

## Page-Specific Layouts

### Dashboard (Home)
- **Hero**: Interactive "Thread Map" visualization - circular animated disc with runas, threads react on hover
- **KPI Cards**: 3-column grid (Active Members, Online Now, Avg Score) with large numbers and sparklines
- **Heatmap**: Full-width interactive calendar-style grid (days × hours), tooltip on hover
- **Activity Feed**: 2-column layout (feed left, upcoming events right)

### Roster Page
- Full-width table with advanced filters sidebar (collapsible)
- Search bar with class/role icons for quick filtering
- Pagination at bottom with metallic page numbers

### Leaderboard
- Top 3 podium-style display with 3D character models
- Ranked list below with medals/badges
- Team Builder tool: Drag-drop 5-player slots with buff calculation

### Raid Analytics
- Boss progress: Grid of boss portraits with kill status overlays
- Attendance: Calendar view with participation percentages
- Parse charts: Multi-line comparison graphs

## Color Coding by Section
- **Nexonir (Guild Info)**: Steel blue (#4a6fa5), silver accents
- **Conflict (Alerts/Issues)**: Blood red (#8b1a1a), shadow tones
- **Emperor (Admin)**: Prismatic shimmer, multi-color gradient shifts
- **General**: Arcane blue (#4a9eff), gold (#d4af37)

## Interactive Elements
- Minimal animation budget: Focus on hover glows and subtle floating backgrounds
- Button sounds: Optional subtle "magic click" on interaction (can be toggled)
- Transitions: 200-300ms ease-out for smooth feel
- Loading states: Arcane circle spinner with rotating runes

## Images
**Hero Section**: Not using large static hero image - instead using interactive "Thread Map" visualization (animated canvas/SVG)

**Player Profiles**: 3D character renders from Blizzard/Raider.IO API (programmatic)

**Icons**: Font Awesome or custom WoW-style icon set for classes, specs, dungeons

**Textures**: Stone, metal, parchment overlays for container backgrounds (subtle, non-intrusive)

## Accessibility
- Ensure glow effects don't obscure text
- Maintain WCAG AA contrast (beige text on dark backgrounds)
- Keyboard navigation with visible focus states (arcane blue outline)
- Alt text for all character renders and icons