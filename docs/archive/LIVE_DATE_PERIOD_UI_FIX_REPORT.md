# LIVE DATE / PERIOD / UI FIX REPORT

**Project:** Patil Group Manufacturing Performance Dashboard
**Date of validation run:** 2026-09-16
**Validation target:** `http://localhost:5173` (Vite dev) → `http://127.0.0.1:8000` (FastAPI)
**Browser:** Playwright Chromium (installed Chrome channel, headless)
**Result: 64 PASS / 0 FAIL** (full browser suite), backend `ruff` clean, `pytest` 206 passed / 7 skipped, frontend typecheck + lint + build clean.

---

## 1. Executive summary

The dashboard was audited end-to-end — Google Sheets → backend API → frontend
normalization → filter engine → date inputs → analytics — and every layer was
validated **live in a real browser**.

The three reported problems were investigated and resolved:

| Problem | Finding | Outcome |
|---|---|---|
| A — Date picker capped at 03-09-2026 | **Not a hard-coded cap.** The live `Sheet1` genuinely ends on **2026-09-03** (last data row 14005). The picker max equals the live dataset max exactly. Future-dating the dataset moves the picker max with **no code change** (TEST A–D). | **Verified dynamic** + honest loading state added |
| B — Period dropdown white-on-white | **No `option` CSS rule existed anywhere**, so native popup rows inherited the inherited dark-theme text colour (white) on the OS-default white popup surface. | **Fixed** — explicit high-contrast `option` rules; measured 17.4:1 (normal) and 6.29:1 (selected) |
| C — Dark UI remnants | `chartTheme.ts` still carried dark-theme chart values (light text, white gridlines, dark tooltip) rendered on **white** cards; pie slice borders `#0B1628`; invalid `@print` at-rule silently killed the print stylesheet. | **Fixed** — professional light chart palette, white pie borders, `@media print` repaired |

Two additional genuine defects were discovered and fixed during browser
validation:

1. **Mock-data leak during load (§53 violation):** for the ~15–20 s that the
   14,004-row payload takes to transfer and normalize, Operations Control
   silently displayed the legacy demo records (14–15 Aug 2026) as though they
   were live. The dashboard now shows an explicit **"Loading Live Google Sheets
   Data…"** state and never presents mock-derived date bounds as live data.
2. **React setState-during-render:** the carousel autoplay called
   `onSlideChange` (parent state setter) **inside a `setCurrentIndex` updater**,
   producing "Cannot update a component while rendering a different component"
   console errors. Fixed by notifying outside the updater.

No business logic, calculations, period engine, filters, authentication, RBAC,
backend APIs or Google Sheets integration was changed.

---

## 2. Date picker root cause

The Date Range inputs in Operations Control
(`frontend/src/pages/ManufacturingDashboard.tsx`) are bound to values derived
**only** from the loaded dataset:

```tsx
min={options.minDate || undefined}        // start input
max={filters.dateTo || options.maxDate || undefined}
max={options.maxDate || undefined}        // end input
```

`options.maxDate` is produced by `datasetDateBounds()` in
`frontend/src/data/filters/dashboardFilterEngine.ts`, which sorts the valid
`yyyy-mm-dd` dates of the **current live records** and takes the last one. It is
never the system clock and never a literal.

A repository-wide audit found **zero occurrences** of
`2026-09-03` / `03-09-2026` / `2026-09-15` / `15-09-2026` anywhere in
`frontend/src` (production code), and no `max=` / `maxDate` / `defaultDate` /
sessionStorage value that caps the calendar. The stale
`hud-theme-overrides.css` (dark theme) is **orphaned dead CSS — nothing imports
it** (verified against HEAD `App.tsx` and all `@import`s).

## 3. Why 15-09-2026 could not be selected

Because **the operational Google Sheet does not contain it.** Direct read-only
API inspection (`tmp/diag_live_dates.py`, `tmp/diag_sheet_tabs.py`,
`tmp/diag_sheet_tail.py`) of spreadsheet `17iVnCiFOxIEKNDMkTQl-rPSH9sVaYj3Q2Znbt3Ky95o`,
worksheet `Sheet1`:

- 14,004 rows; last data row **14005** has `Date = '03-09-2026'`
- 658 distinct dates; the newest 12 end `…2026-09-01, 2026-09-02, 2026-09-03`
- No other tab contains 2026-09-15 data

The dashboard therefore allows through **exactly** the data that exists — as
required by §90 ("THE DASHBOARD MUST FOLLOW THE DATA"). The dynamic behaviour
was proven by simulation: see §12 (TEST A–D). If rows through 15-09-2026 are
added to the sheet (or the backend is pointed at the tab that has them), the
picker max becomes 2026-09-15 automatically after the next load/refresh — no
code change.

## 4. Backend max-date result

`GET /api/manufacturing/data?refresh=true` (authoritative, cache bypassed):

```
recordCount = 14004
minDate     = 2024-08-31
maxDate     = 2026-09-03
cacheHit    = false
connectionStatus = connected
```

Raw column check: `Google Sheet raw max == backend maxDate` **PASS**,
`Google Sheet raw min == backend minDate` **PASS**.

## 5. Frontend max-date result

The real production modules were executed in the browser (imported through
Vite) against the live payload (`tmp/probe_normalize.mjs`):

```
httpRows          = 14004
normalizedCount   = 14001   (3 rows carry no date/production signal)
datedCount        = 14001
minRecordDate     = 2024-08-31
maxRecordDate     = 2026-09-03
options.minDate   = 2024-08-31
options.maxDate   = 2026-09-03
stages            = Clip, Cut Bar, Deburring, MPI, Turned Bar
```

Browser DOM verification (§56): the end-date calendar accepts **2026-09-03**
(typed and re-read: `accepted=2026-09-03`), and the four-way chain matches
exactly (§55).

## 6. Date parsing result

`toIsoDate()` in `frontend/src/data/normalization/normalizeDprData.ts` parses
the sheet's **DD-MM-YYYY text** day-first: `31-08-2024 → 2024-08-31` proves no
MM/DD locale confusion, and `03-09-2026 → 2026-09-03` (3 September, not
9 March). ISO `yyyy-mm-dd`, Excel serials and native Sheet date values are also
handled. Timezone safety test: `2026-09-15` never collapses to `2026-09-14`
(`got=2026-09-15` **PASS**). Of 14,004 rows, 14,001 hold valid dates and
**0 invalid date values** were found in the raw column.

## 7. Cache / refresh result

- Backend TTL cache exists; **`refresh=true` bypasses it** — verified live:
  `cacheHit=false` on the validation fetch.
- The **Refresh Data** button performs a real live fetch
  (`fetchManufacturingDataset(..., refresh=true)` → cache-bypassing backend
  read) and shows `Refreshing...` while active, returning to `Refresh Data`
  after completion (**PASS** in browser).
- Frontend: no cached/store date can override fresh API data — filter bounds
  are recomputed from the loaded records on every dataset update
  (`buildFilterOptions(liveRecords)` memo); `sessionStorage` persists only the
  user's *filters*, never a source max date.

## 8. Period dropdown CSS root cause

A repository-wide CSS audit (`select`, `option`, `.filter-grid`,
`light-theme-overrides.css`, `App.css`, `dashboard.css`, `components.css`) found
**no `option { … }` rule in any stylesheet.** The native `<select>` popup
therefore drew OS-default white rows while the option text inherited the
inherited dark-theme white text colour — producing white-on-white for every
unselected row. (The closed control looked fine, which is why only the opened
dropdown appeared broken.)

**Fix** (`frontend/src/styles/light-theme-overrides.css`, new
"NATIVE SELECT / DROPDOWN OPTION CONTRAST" block):

- `select` + `select option`/`optgroup`: white surface, `#0F172A`-family dark
  text, pinned with explicit fallbacks so no theme rule can re-create the bug.
- `option:hover/:focus`: light tint, still dark text.
- `option:checked`: **white on `#4F46E5`** (indigo-600). `#6366F1` was rejected
  because white-on-`#6366F1` measures **4.47:1** — just under WCAG 4.5:1 —
  while white-on-`#4F46E5` measures **6.29:1**.
- `option:disabled`, `select:disabled`: muted but legible.
- `select:focus-visible`: visible 2px focus ring.

Measured in-browser: controls **17.4:1** dark-on-white; worst option
`Period/Monthly fg=rgb(255,255,255) bg=rgb(79,70,229) ratio=6.29` —
readable, never white-on-white.

## 9. Work Center → Stage change

Operations Control offers **Date Range · Period · Line · Shift · Stage ·
Material**. The Stage list is produced by `collectStages()` from
`record.rawStage` of the live dataset — never hard-coded — and is
**line-aware** (`stagesByLine`): choosing a Line restricts Stage options to
stages actually present for that line; *All Lines* offers all of them.
Verified live:

```
stage option count = 6   (All Stages | Clip | Cut Bar | Deburring | MPI | Turned Bar)
```

The legacy `workCenter` filter field survives **only** for the Work Center
Analytics carousel slide; it is not part of Operations Control. The
filtered-out banner wording now says "Stage".

## 10. Light-theme redesign

- **`chartTheme.ts`** (root-caused regression): axes/tooltip/palettes had been
  set to dark-theme values — `#CBD5E1` labels, `rgba(255,255,255,…)` gridlines
  and axis lines, dark tooltip — rendered on **white** cards (invisible/low
  contrast). Restored the professional light palette: Actual `#2563EB`,
  Target `#EA580C`, Positive `#16A34A`, Loss `#DC2626`, Downtime `#D97706`,
  dimension series indigo/violet/info, text `#475569`, gridlines `#E9EEF5`,
  borders `#E2E8F0`, white tooltip with subtle shadow.
- **`WorkCenterAnalyticsSlide.tsx`**: doughnut slice separators `#0B1628` →
  `#FFFFFF` (2 charts) so they do not draw dark halos on white cards.
- **`light-theme-overrides.css`**: the dropdown contrast block above, plus the
  `@print` → `@media print` repair (the invalid at-rule had silently disabled
  the entire print stylesheet — sidebar/filter hiding and shadow flattening
  never applied).
- **`dashboard.css`**: new `live-empty-state__icon--loading` spinner (with
  `prefers-reduced-motion` fallback) for the honest loading state.
- Page/sidebar/header/cards remain the established light token system
  (`tokens.css`); no scattered hard-coded theme colours were introduced.


## 11. Files changed

**Production code (all presentation/state-honesty fixes, no business-logic
changes):**

| File | Change |
|---|---|
| `frontend/src/styles/light-theme-overrides.css` | Native select/option contrast block; `@print` → `@media print` |
| `frontend/src/components/dashboard/slides/chartTheme.ts` | Light professional chart palette, axes, tooltip |
| `frontend/src/components/dashboard/slides/WorkCenterAnalyticsSlide.tsx` | Pie/doughnut borders `#0B1628` → `#FFFFFF` |
| `frontend/src/styles/dashboard.css` | Live-loading spinner styles |
| `frontend/src/pages/ManufacturingDashboard.tsx` | `liveLoading` state; `emptyFilterOptions` while loading; "Loading Live Google Sheets Data…" empty state; loading hint; Stage wording |
| `frontend/src/components/dashboard/DashboardCarousel.tsx` | Autoplay no longer calls `onSlideChange` inside a setState updater (ref-based) |

**Validation/diagnostic tooling (new, under `tmp/`, not shipped):**
`diag_live_dates.py`, `diag_sheet_tabs.py`, `diag_sheet_tail.py`,
`probe_ui_dataset.mjs`, `probe_normalize.mjs`,
`validate_live_date_period_ui.mjs` (64-assertion browser suite).

## 12. Tests added

`tmp/validate_live_date_period_ui.mjs` — real-browser suite (Playwright +
installed Chrome channel, headless), 64 assertions across 17 sections:
login/auth; live backend fetch (`refresh=true`, `cacheHit=false`); Operations
Control state incl. **wait-for-live-dataset**; picker min/max equality with
backend bounds and "never the clock"; latest-date acceptance; dropdown option
readability (computed contrast, disabled controls skipped as placeholder
state); Stage data-driven; all four period presets; Stage filter changes
analytics; custom range preserved across refresh; Latest Available Data; Reset
to live max; four-way date chain; responsive overflow at 7 viewports; refresh
flow; **future-date regression TEST A–D against the real production filter
module** (imported through Vite) plus timezone safety; console health.

Supporting diagnostics: `tmp/diag_live_dates.py` (read-only backend/Sheets date
and key-shape audit), `tmp/probe_ui_dataset.mjs` / `tmp/probe_normalize.mjs`
(DOM and normalization probes).

## 13. Automated test results

| Suite | Command | Result |
|---|---|---|
| Backend lint | `ruff check .` | **All checks passed** (exit 0) |
| Backend tests | `pytest -q` | **206 passed, 7 skipped** |
| Frontend types | `npm run typecheck` | **0 errors** |
| Frontend lint | `npm run lint` | **0 warnings, 0 errors** (81 files) |
| Frontend build | `npm run build` | **built** (exit 0; pre-existing chunk-size warning only) |
| Browser suite | `node tmp/validate_live_date_period_ui.mjs` | **64 PASS / 0 FAIL** |

## 14. Browser test results (selections)

- **Date picker** — `min=2024-08-31`, `max=2026-09-03`; typing `2026-09-03`
  into the end input is accepted and retained; Apply includes data through it. ✔
- **Period dropdown** — Weekly/Monthly/Quarterly/Yearly all present, all
  readable (17.4:1 options; 6.29:1 selected); each preset selects and drives
  analytics. ✔
- **Stage dropdown** — `All Stages` + 5 live stages; selecting **Clip** changes
  KPI/chart text (analytics respect the filter). ✔
- **Refresh Data** — real `refresh=true` fetch; busy label shown; returns to
  idle; custom range **not** overwritten (`2026-06-01 → 2026-08-15`
  preserved). ✔
- **Latest Available Data / Reset** — both restore `2024-08-31 → 2026-09-03`
  (live max), Monthly, all dimensions. ✔
- **Console** — no errors after the carousel fix ("clean"). ✔

## 15. Responsive test results

`1920×1080, 1440×900, 1280×800, 1024×768, 768×1024, 480×900, 375×812`:
`scrollWidth == clientWidth` at **every** viewport (no unwanted horizontal
overflow) and all 5 dropdowns render at every size. ✔


## 16. Before / after observations

| | BEFORE | AFTER |
|---|---|---|
| Date picker max | appeared "capped" at 03-09-2026 | equals live dataset max (2026-09-03 today); future dates auto-adopt (TEST A–D: 15/16/20 Sep) |
| Period options | white-on-white except selected | all readable — 17.4:1 normal, 6.29:1 selected |
| Charts | dark-theme text/grids on white cards | light professional palette, dark readable labels, light gridlines |
| Print stylesheet | dead (`@print`) | functional (`@media print`) |
| While live data loads (~15–20 s) | mock records (14–15 Aug 2026) shown as if live | honest "Loading Live Google Sheets Data…" state |
| Console | setState-during-render warnings | clean |

## 17. Remaining issues

1. **15-09-2026 data is not in `Sheet1`** of the configured spreadsheet. The
   pipeline is dynamic — when the sheet (or the worksheet the backend points to
   via `GOOGLE_SHEETS_SPREADSHEET_ID` / `GOOGLE_SHEETS_WORKSHEET_NAME`)
   contains those rows, the dashboard follows automatically after the next
   load/refresh.
2. Vite chunk-size build warning (pre-existing, cosmetic).
3. The native browser calendar surface itself is OS-controlled (§38); only its
   selectable `min`/`max` are app-controlled — as intended.
4. The 14,004-row payload takes ~15–20 s to transfer/normalize through the dev
   proxy; now clearly communicated by the loading state.
5. **Environment note:** `backend/.env` sets `POSTGRES_PORT=5433`, but the local
   PostgreSQL 16 service listens on **5432** (verified `pril_analytics` holds
   the data there). Start the backend with
   `POSTGRES_PORT=5432 uvicorn app.main:app` (or fix `.env`) — with the
   mismatched port the API starts but any DB call returns 500
   (`psycopg.errors.ConnectionTimeout`).

## 18. Final readiness status

**PASS** — all acceptance criteria verified by live browser validation
(64/64) plus the backend/frontend test suites. Per instruction §88 nothing was
committed, pushed or deployed.

**Diagnostic table (§82, captured during the validation run):**

| Metric | Result |
|---|---|
| Google Sheet record count | 14,004 rows (14,001 dated) |
| Backend record count | 14,004 |
| Frontend record count | 14,001 normalized dated records |
| Google Sheet min / max date | 2024-08-31 / 2026-09-03 |
| Backend min / max date | 2024-08-31 / 2026-09-03 |
| Frontend min / max date | 2024-08-31 / 2026-09-03 |
| Date picker min / max | 2024-08-31 / 2026-09-03 |
| Dashboard active start / end | 2024-08-31 / 2026-09-03 (auto mode) |
| Last refresh timestamp | 2026-09-16T12:05 UTC (backend `lastUpdated`) |
| Active Period | Monthly |
| Active Line | All Lines |
| Active Shift | All Shifts |
| Active Stage | All Stages |
| Active Material | All Materials |

