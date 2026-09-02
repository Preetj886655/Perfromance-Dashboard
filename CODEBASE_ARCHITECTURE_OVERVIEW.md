# Patil Manufacturing Analytics - Codebase Architecture Overview

**Last Updated:** 2026-09-01 | **Phase Status:** Phase 3 & 4 Complete (Live Dashboard with Modern Design System)

---

## 1. FRONTEND STRUCTURE

### Component Hierarchy

```
src/
├── pages/
│   ├── ManufacturingDashboard.tsx          (Main orchestrator - 2000+ lines)
│   ├── OeeDashboard.tsx
│   ├── MasterDataPage.tsx
│   ├── UserManagementPage.tsx
│   └── Auth Pages (Login, Reset, etc.)
├── components/
│   ├── dashboard/
│   │   ├── FilterBar.tsx                    (Scope/period/hierarchical filtering)
│   │   ├── DashboardHeader.tsx              (Branding + SSE status indicator)
│   │   ├── KpiCards.tsx                     (OEE snapshot metrics)
│   │   ├── TrendChart.tsx                   (ECharts line trends)
│   │   ├── BreakdownChart.tsx               (A/P/Q/OEE breakdown bars)
│   │   ├── SnapshotTable.tsx                (Data table for drill-down)
│   │   └── StatusBanner.tsx                 (Loading/error/empty states)
│   └── LiveStatusIndicator.tsx              (Connection badge + sync controls)
├── services/
│   └── manufacturingApi.ts                  (API client + Google Sheets data fetching)
├── hooks/
│   └── useManufacturingLivePolling.ts       (Auto-refresh polling logic)
├── data/
│   ├── calculations/
│   │   ├── oeeCalculator.ts                 (OEE: A×P×Q formula)
│   │   ├── productionKpis.ts                (Total production, target, rejection %)
│   │   ├── qualityAnalysis.ts               (Rejection by machine/part/shift/reason)
│   │   ├── downtimeAnalysis.ts              (Downtime by machine/shift/reason)
│   │   └── manufacturingAnalysis.ts         (Aggregate insights + analysis mode detection)
│   ├── normalization/
│   │   └── normalizeDprData.ts              (Daily Production Record: field mapping + validation)
│   ├── parser/
│   │   └── excelParser.ts                   (XLSX/CSV parsing + sheet detection)
│   └── state/
│       └── dashboardDataStore.ts            (localStorage persistence)
├── styles/
│   ├── tokens.css                           (Design tokens: colors, spacing, typography)
│   ├── layout.css                           (Grid: sidebar, topbar, responsive)
│   ├── components.css                       (Buttons, cards, forms, tables, badges)
│   ├── animations.css                       (Motion library: fade, slide, bounce, shimmer)
│   ├── dashboard.css                        (KPI cards, status indicators, gauges)
│   └── light-theme-overrides.css            (Light mode CSS customizations)
├── types/
│   ├── dashboard.ts                         (OeeSnapshot, Filters, Scope/Period enums)
│   └── userManagement.ts
└── utils/
    └── format.ts                            (Percentage, number, datetime formatters)
```

### Dashboard Pages & Navigation

The dashboard has 18 main routes (hash-based):
- **#/dashboard** → Executive Overview (KPIs, production trend, downtime Pareto, insights)
- **#/production** → Production Dashboard (Actual vs Target, daily achievement)
- **#/quality** → Quality Analysis (Rejection Pareto, by shift/machine/reason)
- **#/downtime** → Downtime Analysis (Machine/shift/reason breakdown)
- **#/machine-line** → Machine/Line Performance (Comparative analysis)
- **#/oee** → OEE Dashboard (A/P/Q gauges, warnings)
- **#/insights** → Analytics & Insights (Evidence-based observations)
- **#/kpi** → KPI & Reports
- **#/data-import** → Data Import Center (File upload, Google Sheets connection, preview)
- **#/data-quality** → Data Quality Assessment
- Plus: PPC, SCM, Store, Maintenance, NPD, HR, Safety, Logistics, 5S, Google Forms, Actions, Settings (stub pages)

### Key Dashboard Features

**Dashboard Slides (Navigation + Layout):**
- Organized into 9 "slides" with keyboard navigation (Home/End/Arrow keys)
- Each slide maps to a page route
- Touch/swipe support for mobile

**Filter Architecture:**
- Scope Type: plant → line → machine (hierarchical)
- Period Type: day / week / month
- Dynamic filter options built from dataset
- Individual filters: date, shift, machine, material, part
- All filters apply to ALL displayed calculations

**Data Sources:**
1. **Excel/CSV Upload** → File parsing → localStorage persistence
2. **Google Sheets** → Real-time polling every 60s (configurable)
3. **Mock Data** → Fallback with 3 sample DprRecords

---

## 2. DESIGN SYSTEM (CSS-in-CSS)

### Design Tokens (`tokens.css` - 300+ lines)

```css
/* Color Palette */
--color-primary: #6366f1;                   /* Indigo */
--color-secondary: #06b6d4;                 /* Cyan */
--color-success: #10b981;                   /* Green */
--color-warning: #f59e0b;                   /* Amber */
--color-danger: #ef4444;                    /* Red */

/* Backgrounds */
--color-bg-primary: #f5f7fa;                /* Page background (light gray) */
--color-bg-secondary: #ffffff;              /* Card background */
--color-surface-highlight: #f0f4ff;         /* Active selection highlight */

/* Typography */
--font-family-base: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
--font-size-xs: 0.75rem;                    /* 12px */
--font-size-sm: 0.875rem;                   /* 14px - default */
--font-size-base: 1rem;                     /* 16px */
--font-size-lg: 1.25rem;                    /* 20px - heading */
--font-size-xl: 1.5rem;                     /* 24px - large heading */
--font-weight-regular: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;

/* Spacing Scale */
--spacing-xs: 0.25rem;    /* 4px */
--spacing-sm: 0.5rem;     /* 8px */
--spacing-md: 1rem;       /* 16px */
--spacing-lg: 1.5rem;     /* 24px */
--spacing-xl: 2rem;       /* 32px */
--spacing-2xl: 4rem;      /* 64px */

/* Shadows */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 4px 6px rgba(0,0,0,0.1);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.1);

/* Z-Index Scale */
--z-hide: -1;
--z-base: 0;
--z-dropdown: 100;
--z-sticky: 500;
--z-modal: 600;
--z-tooltip: 700;

/* Motion */
--duration-fast: 150ms;
--duration-base: 200ms;
--duration-slow: 300ms;
--duration-slower: 500ms;
--easing-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

**Dark Mode Support:** All colors support `@media (prefers-color-scheme: dark)` 
**Accessibility:** All animations respect `@media (prefers-reduced-motion: reduce)`

### Layout System (`layout.css` - 400+ lines)

```css
.factory-layout {
  display: grid;
  grid-template-columns: 260px 1fr;         /* Sidebar + content */
  grid-template-rows: 60px 1fr;             /* Top bar + main */
  min-height: 100vh;
}

.factory-layout.sidebar-collapsed {
  grid-template-columns: 80px 1fr;          /* Collapsed sidebar */
}

/* Responsive Breakpoints */
@media (max-width: 1024px) { /* Tablet */ }
@media (max-width: 640px) { /* Mobile */ }
```

**Fixed Components:**
- Sidebar: 260px wide (80px when collapsed), fixed left, z-index sticky
- Topbar: 60px height, fixed top, contains navigation buttons
- Main content: Scrollable, auto-wrapping layout

### Component Styles (`components.css` - 550+ lines)

**Buttons:**
- `.btn--primary` (indigo, elevated)
- `.btn--secondary` (white, bordered)
- `.btn--ghost` (transparent, primary text)
- `.btn--danger` (red)
- Sizes: `--sm`, `--lg`, `--block`

**Cards & Containers:**
- `.panel` (white background, border, hover elevation)
- `.kpi-card` (metric display with gradient accent bar)
- `.gauge-card` (conic gradient progress indicator)

**Forms:**
- `.field` (label + input/select wrapper)
- `.field__hint` (helper text, error states)
- Disabled, focus-visible, error styling

**Tables:**
- `.data-table` (striped rows, hover states)
- `.table-wrap` (horizontal scroll container)

**Badges & Status:**
- `.status-pill` (Good/Warning/Critical colors)
- `.priority` (Critical/High/Medium/Low colors)
- `.badge` (inline labels)

**Loading States:**
- `.skeleton` (shimmer animation)
- `.spinner` (rotating loader)
- `.loading` (opacity + pulse)

**Grids:**
- `.kpi-grid` (responsive 2/3/4 column)
- `.gauge-grid` (2-column gauge displays)
- `.panel-grid` (two-up / four-up layouts)

### Animation Library (`animations.css` - 350+ lines)

**Keyframe Animations:**
```
fade, slide-in-left/right/up/down, scale, bounce,
pulse, shimmer, rotate, glow, wobble
```

**Utility Classes:**
- `.animate-fade`, `.animate-slide`, `.animate-scale`, etc.
- `.animate-fast` (150ms), `.animate-base` (200ms), `.animate-slow` (300ms), `.animate-slower` (500ms)
- `.animate-delay-50`, `.animate-delay-100`, etc. (0-500ms increments)
- `.animate-stagger` (cascading list animations)

---

## 3. DATA FLOW & ARCHITECTURE

### Data Source Pipeline

```
Excel/CSV File
    ↓
parseDprWorkbookFile()  [excelParser.ts]
    ↓
DprRawRow[]  (header-normalized)
    ↓
normalizeDprRows()  [normalizeDprData.ts]
    ↓
DprRecord[]  (fully normalized manufacturing records)
    ↓
saveDashboardDataset()  [dashboardDataStore.ts]
    ↓
localStorage.patil.dashboard.dataset
    ↓
Dashboard Calculations (OEE, KPIs, Quality, Downtime)
```

### Daily Production Record (DprRecord) Schema

```typescript
type DprRecord = {
  // Identification
  index: number;
  serialNo?: number;
  date?: string;                    // ISO 8601
  shift?: string;                   // A/B/C
  
  // Asset & Dimension
  lineName?: string;
  machineName?: string;
  machineNo?: string;
  materialName?: string;
  partName?: string;
  partNo?: string;
  
  // Production Metrics
  productionHour?: number;
  targetQtyPerHour?: number;
  targetProduction?: number;
  actualProductionQty?: number;
  productionLoss?: number;
  
  // Time Components (minutes)
  plannedDownTimeMinutes?: number;  /* Scheduled maintenance/meetings */
  availableTimeMinutes?: number;    /* Shift time - planned downtime */
  totalIdleTimeMinutes?: number;    /* Unplanned downtime */
  totalRunTimeMinutes?: number;     /* Actual machine run time */
  
  // Calculated Ratios (0-1)
  availabilityRatio?: number;       /* Run time / Available time */
  performanceRatio?: number;        /* Actual QTY/Hr / Target QTY/Hr */
  qualityRatio?: number;            /* Good qty / Total production */
  sourceOeeRatio?: number;          /* From source file (if provided) */
  machineUtilizationRatio?: number; /* Run time / Shift time */
  
  // Quality & Rejection
  totalRejectionQty?: number;
  rejectionPpm?: number;            /* Parts per million */
  rejectionReasonBreakup: Array<{ reason: string; qty: number }>;
  
  // Downtime Details
  idleReason?: string;
  idleReasonBreakup: Array<{ reason: string; minutes: number }>;
  
  // Custom Data
  customColumns: Record<string, unknown>;
  raw: DprRawRow;                   /* Original input row */
};
```

### Excel/CSV Parsing Flow

1. **File Ingestion** (`excelParser.ts`)
   - Detects file type (CSV or Excel)
   - Auto-detects sheet (looks for standard names)
   - Extracts headers from row N (usually 0 or 1)
   - Loads all rows as raw objects

2. **Header Mapping** (Field alias resolution)
   ```
   Input Column → Normalized Name → DprRecord Field
   "Production Qty." → actualproductionqty → DprRecord.actualProductionQty
   "Machine Name" → machine → DprRecord.machineName
   ```
   - ~60 alias patterns defined in FIELD_ALIASES
   - Case-insensitive matching

3. **Data Quality Assessment**
   - Missing value %
   - Duplicate row detection
   - Sheet name recommendations
   - Analysis mode detection (OEE vs Manufacturing vs Downtime)

### Analytics Calculations

**OEE Calculation** (`oeeCalculator.ts`):
```
Availability (A) = Total Run Time / Total Available Time
Performance (P)  = Actual QTY/Hr / Target QTY/Hr
Quality (Q)      = Good Qty / Total Produced Qty
OEE              = A × P × Q
```
- Aggregated across all filtered records
- Returns summary (average ratios) + validation warnings

**Production KPIs** (`productionKpis.ts`):
- Total Production, Target Achievement %
- Total Rejection, Rejection Rate %
- Machine Utilization %
- Downtime breakdown

**Quality Analysis** (`qualityAnalysis.ts`):
- Total rejection quantity
- Rejection rate %
- Rejection PPM average
- Breakdowns by: machine, part, shift, reason

**Downtime Analysis** (`downtimeAnalysis.ts`):
- Total downtime (planned + unplanned)
- Breakdowns by: machine, shift, reason

**Manufacturing Analysis** (`manufacturingAnalysis.ts`):
- Auto-detects data quality signals
- Suggests analysis mode (OEE vs Manufacturing vs Production-Downtime)
- Generates automated insights

---

## 4. LIVE POLLING & REAL-TIME SYNC

### Live Polling Hook (`useManufacturingLivePolling.ts`)

**Purpose:** Auto-refresh Google Sheets data at configurable intervals with change detection

**Features:**
- Configurable polling interval (10s-10m, default 60s)
- Hash-based change detection (efficient string comparison)
- State machine: idle → polling → syncing → error/offline
- Graceful error handling and offline fallback
- Automatic cleanup on unmount

**API Integration:**
```
GET /api/v1/manufacturing/status
  → Returns: connectionStatus, recordCount, lastSync, error

GET /api/v1/manufacturing/data
  → Returns: data[], connectionStatus, spreadsheetId, worksheet, recordCount
```

**Status Components:**
- `LiveStatusIndicator` - Connection badge + sync time + record count + refresh button
- `DataSourceIndicator` - Source label + filename
- `AutoRefreshToggle` - Enable/disable toggle + interval display

---

## 5. BACKEND STRUCTURE

### Database Models (SQLAlchemy ORM)

**Core Manufacturing:**
- `Machine` - Equipment inventory
- `Line` - Production lines
- `Plant` - Facility/site
- `Shift` - Work periods
- `Part` - Product SKUs
- `Material` - Raw materials
- `Operator` - Employees
- `ProductionRecord` - Daily production entries
- `OeeSnapshot` - Aggregated OEE metrics
- `ImportJob` - Data import tracking

**Master Data:**
- `MachineType`, `MachineStatus`
- `DowntimeReason`, `RejectionReason`
- `Department`, `Role`, `User`
- `KpiDefinition`, `KpiResult`

**Quality & Maintenance:**
- `QualityInspection`, `RejectionEvent`
- `MaintenanceTicket`, `PmSchedule`
- `AlertRule`, `Alert`, `Action`, `ActionLink`

**Audit & Integration:**
- `AuditLog` - Track all changes
- `DataSource` - Track data sources
- `ColumnMappingTemplate` - Custom field mapping
- `ImportJobRow` - Row-level import tracking

### API Routes (`backend/app/api/routes/`)

**Manufacturing Endpoints:**
- `GET /api/manufacturing/status` - Connection status + record count
- `GET /api/manufacturing/data` - Normalized dataset
- `GET /v1/manufacturing/status` - Versioned status endpoint
- `GET /v1/manufacturing/data` - Versioned data endpoint

**Dashboard Endpoints:** (See `dashboard.py`)
- `GET /v1/dashboard/oee/snapshot` - OEE metrics for filters
- `GET /v1/dashboard/oee/breakdown` - A/P/Q breakdown
- `GET /v1/dashboard/oee/trend` - OEE over time

**Master Data Endpoints:**
- `GET /v1/masters/plants`
- `GET /v1/masters/lines`
- `GET /v1/masters/machines`
- `GET /v1/masters/parts`
- `GET /v1/masters/shifts`

**Other Routes:**
- `/api/auth/*` - Authentication/login
- `/v1/users/*` - User management
- `/api/health` - Health check

### Google Sheets Integration (`google_sheets_service.py`)

**Features:**
- Service account authentication
- Row-by-row normalization
- ~45s response caching (avoid quota exhaustion)
- Graceful error handling
- Spreadsheet ID detection from environment

**Functions:**
- `fetch_google_sheet_dataset()` - Full dataset + metadata
- `get_google_sheet_status()` - Lightweight status check

---

## 6. EXISTING FEATURES & DISPLAYS

### Executive Overview Dashboard

**KPI Cards** (6 cards):
1. Production Achievement (% vs 100% target)
2. OEE (% vs 75% target)
3. Quality (% vs 98.5% target)
4. Machine Utilization (% vs 85% target)
5. Rejection Rate (% vs 1.5% target)
6. Downtime (minutes, planned + unplanned)

Each card displays:
- Current value
- Target value
- Variance (trend up/down/flat)
- Status badge (Good/Warning/Critical)
- Sparkline chart (8 recent data points)

**Charts & Tables:**
- **Production Plan vs Target vs Actual** (Stacked bar chart)
- **OEE Gauges** (Conic progress: Availability, Performance, Quality, OEE)
- **Production Trend** (Line chart with shaded area)
- **Downtime Pareto** (Top 8 reasons by minutes)
- **Top 10 Pending Actions** (Table: priority, action, owner, due date, status)

**Insights Section:**
- Generated insights (AI observations)
- What's going well (good signals)
- What requires attention (issues)

### Production Dashboard
- KPI cards 1-4 (Production, OEE, Quality, Utilization)
- Plan vs Target vs Actual chart
- Daily production trend

### Quality Dashboard
- Total rejection, rejection rate, PPM, quality ratio KPIs
- Rejection Pareto (top 8 reasons)
- Rejection by Shift (bar chart)

### OEE Dashboard
- 4 Gauge cards (A/P/Q/OEE)
- Validation warnings (source vs calculated differences)

### Data Import Center
- **3-Step Workflow:**
  1. Upload (Excel/CSV dropzone)
  2. Inspect (File preview + sheet selection)
  3. Analyze (Validation + generate dashboard)

- **Google Sheets Connection:**
  - Paste URL or spreadsheet ID
  - Auto-detect worksheet
  - One-click connection
  - Auto-refresh toggle (configurable interval)

- **Preview Summary:**
  - Dataset name, record count, columns
  - Date range, machines, lines, shifts, parts
  - Missing values %, duplicate rows
  - Analysis mode detection
  - Automated insights

- **Validation:**
  - Header row detection
  - Available fields listing
  - Error/warning messages
  - Data quality metrics

---

## 7. EXISTING CSS CONFLICTS & STYLING STATUS

### Design System Status: **✓ COMPLETE**

**5 CSS Files (1,900+ lines total):**
1. `tokens.css` (300 lines) - All design variables
2. `layout.css` (400 lines) - Grid system + responsive
3. `components.css` (550 lines) - Buttons, cards, forms, tables
4. `animations.css` (350 lines) - Motion library
5. `dashboard.css` (250 lines) - Dashboard-specific styles

**Light Theme Overrides:** `light-theme-overrides.css` (custom light mode tweaks)

**Known Non-Conflicts:**
- No circular dependencies in cascade
- Proper CSS variable scoping to `:root`
- All animations compliant with prefers-reduced-motion
- Dark mode media query properly implemented
- Accessibility built-in (focus states, color contrast, semantic HTML)

**Build Validation:**
- ✓ CSS structure verified (no conflicts)
- ✓ TypeScript compilation passes cleanly
- ✓ Production build succeeds (59.71 kB CSS, 1,796 kB JS)
- ✓ All component styles render correctly

---

## 8. KEY TECHNICAL DECISIONS

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 18 + TypeScript | Type safety, component modularity |
| State Mgmt | localStorage + React hooks | Offline support, no external dependencies |
| Styling | CSS-in-CSS (tokens + cascade) | No build overhead, design system first |
| Charts | ECharts for React | Rich visualization, lightweight |
| Parsing | XLSX library | Excel/CSV support, browser-native |
| Backend | FastAPI | Fast, async-ready, OpenAPI docs |
| Database | PostgreSQL 16 | Transactional, JSONB support |
| Authentication | JWT + FastAPI Security | Stateless, scalable |
| Deployment | Docker Compose (local) | Consistent environment |

---

## 9. NAVIGATION & ROUTING

### Hash-Based Routing

All routes are hash-based (`#/<page>`):
```
#/dashboard         → Main overview
#/production        → Production metrics
#/quality           → Quality analysis
#/oee               → OEE breakdown
#/downtime          → Downtime analysis
#/machine-line      → Machine comparison
#/ppc               → Production planning
#/scm               → Supply chain
#/data-import       → Upload center
#/data-quality      → Data assessment
```

### Keyboard Navigation

- **Home** → First slide (executive overview)
- **End** → Last slide (settings)
- **Left Arrow** → Previous slide
- **Right Arrow** → Next slide

### Touch Navigation

- Swipe left/right for mobile slide navigation

---

## 10. STATE MANAGEMENT FLOW

```
User Actions (Upload/Connect/Filter)
    ↓
Component State Update
    ↓
Trigger Calculation (useMemo)
    ↓
Update localStorage (dashboardDataStore)
    ↓
Re-render with new KPIs
```

**No Redux/MobX** - All state is local to ManufacturingDashboard component
**Persistence** - localStorage survives page refresh
**Google Sheets** - Auto-poll every 60s, update on change detection

---

## 11. KNOWN LIMITATIONS & TBD

**Out of Scope (Phase 1 Only):**
- OEE engine (not implemented)
- Excel ingestion (parser only, manual flow)
- Auth/RBAC (stubbed, no enforcement)
- Department dashboards (not implemented)
- SSE (planned but not active)
- Google Forms (stubbed)
- AI features (out of scope)

**Business Questions (TBC):** See `docs/business-confirmations-tbc.md`

---

## 12. FILE SIZE & BUILD METRICS

```
Production Build Output:
├── CSS: 59.71 kB (minified)
├── JS: 1,796 kB (minified)
└── Build time: 631ms

Modules transformed: 658
Source files analyzed: ~150
TypeScript lines: ~8,000
CSS lines: ~1,900
```

---

## Summary: What's Ready to Extend

✓ **Design System** - Complete token system + motion library  
✓ **Component Library** - Buttons, cards, forms, tables, charts  
✓ **Layout Grid** - Responsive sidebar + topbar + content area  
✓ **Data Pipeline** - Excel/CSV parsing + normalization + localStorage  
✓ **Calculations** - OEE, KPIs, Quality, Downtime, Manufacturing analysis  
✓ **Google Sheets** - Live polling with change detection  
✓ **Charts** - ECharts integration for all visualization types  
✓ **Filters** - Hierarchical scope + period filters  
✓ **API Structure** - Manufacturing endpoints + versioning  
✓ **Database Models** - Comprehensive manufacturing/master data schema  

**Ready for:** Dashboard slide customization, new KPI additions, data import workflows, department-specific views, drill-down navigation, advanced filtering, report generation, batch import optimization.

