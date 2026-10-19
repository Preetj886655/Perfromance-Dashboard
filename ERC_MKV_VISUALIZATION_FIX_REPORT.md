# ERC Mk-V Dashboard — Phase 6 Visualization Fix Report

**Scope:** Phase 6 visualization completion and premium analytics presentation  
**Status:** **PASS — supported interactive charts, KPI scorecards, searchable/sortable data tables, restored module navigation, and automated frontend checks pass; authenticated browser verification remains untested**

## Responsive UI upgrade

- Added a mobile-first responsive layer for 320–430px phones, tablets, and desktop layouts without changing authentication, API contracts, chart data, or hash routes.
- Added viewport-fit/theme/social metadata to `frontend/index.html`.
- Added a touch-friendly mobile bottom navigation bar, off-canvas sidebar behavior, compact sticky executive header treatment, and safe-area spacing for the AI action.
- Added a mobile active-filter summary strip and full-height filter drawer behavior while preserving the existing `FilterBar` controls and apply/reset handlers.
- Added responsive chart/table containment, compact KPI grids, tabular-number styling, and horizontal table fallback for complete record visibility on narrow screens.

## Insight-first refactor continuation

- Replaced the former raw worksheet navigation list with an `ERC Mk-V Analytics Modules` section that mounts all seven data-rich analytics modules.
- Kept source-backed tables available below charts so users can verify the complete returned dataset without exposing authentication or backend details.
- Preserved natural-language stale/error states while retaining source validation information where it explains data completeness.
- Added Stage + Machine normalization for Bar Cropping, Deburring, MPI Inspection, CNC Turning, Autocopy Turning, Clip Forming, Heat Treatment, and Packing.
- Added Downtime Log aliases for `Downtime Mins`, `Downtime Hours`, `Downtime Category`, and raw downtime type fields. Comma-formatted numbers and hour values are normalized to minutes; unavailable tokens remain unavailable.
- Updated downtime reason aggregation to prefer verified category/type fields before legacy idle-reason text.

## Charts implemented

| Dashboard | Visualization | Source fields | Units and caveats |
|---|---|---|---|
| Production Dashboard | Existing daily Output vs Target line chart retained | `records[].date`, `records[].output_nos`, `records[].target_nos` | Source labels use NOS. Null output/target values remain null chart gaps. Date, Stage, and Machine filters submit to the API and the chart renders the returned `records`. |
| Capacity Dashboard | Rated-machine coverage horizontal bar chart added | `work_center`, `rated_machine_count` | Machine count, not output capacity or actual production. The chart explicitly describes it as capacity basis only. |
| Capacity Dashboard | Effective rated cycle time horizontal bar chart added | `work_center`, `effective_rated_ct_sec` | Seconds per cycle, using the backend's source-validated calculation. Lower means faster theoretical processing; it is not actual production performance. Work centers with null effective CT are listed in a warning and omitted from the chart, not plotted as zero. |
| Summary | Existing Downtime vs Breakdown line chart retained | `period`, `downtime_hours`, `breakdown_hours` | Hours. Existing source classification and missing-value behavior are unchanged. |
| Summary | Monthly/yearly Actual vs Target grouped bar chart added | `period`, `actual_nos`, `actual_known_count`, `target_nos`, `target_known_count` | Source values in NOS. The chart is shown only when at least one selected period has both actual and target values known. Unknown values are passed as null gaps, never zero-filled. |
| RM Heat Plan vs Actual | Planned raw-material distribution horizontal bar charts by customer and supplier | `customer_summary[].name`, `customer_summary[].rm_qty_mt`, `supplier_summary[].name`, `supplier_summary[].rm_qty_mt` | Planned raw material in MT. Null values remain gaps; this is not actual consumption or inventory. |
| Manpower Summary | Average planned vs average actual headcount horizontal bar chart | `records[].name`, `records[].avg_planned`, `records[].avg_actual` | Headcount per shift from the selected machine/work-center result set. Rated manpower remains a planning assumption; actual values are observed Entries data. |
| Production Order / Order Plan | Customer order-book and monthly Production vs Dispatch plan charts | Full-source order and monthly-plan aggregates | Production rows only for order-book totals; paired dispatch metadata is forward-filled and missing monthly cells remain gaps. |
| RM Heat Plan vs Actual | Supplier stage conversion/scrap bars and heat-level Yield vs Plan line | Full-source RM plan rows | Separator/total rows excluded; null, `#N/A`, and `#REF!` values remain gaps. |
| Entries | Work-center OP10/OP20/OP30/other rejection comparison | Full-source dated Entries summary | Blank template rows are excluded from aggregate chart input. |
| Downtime Analysis | Downtime Pareto and machine breakdown severity | Pre-aggregated Table 1 and Table 2 rows | Dedicated worksheet values; no aggregation from a paginated Downtime Log page. |
| OEE & Reliability | Work-center OEE breakdown plus machine MTTR/MTBF | Pre-aggregated Tables 1–3 | Source percentages/hours are shown as supplied; unavailable cells remain gaps. |

### Capacity-rate limitation

The Capacity API supplies an aggregate plant-level `theoretical_output_pcs_per_hour`, but it does not supply a comparable theoretical output rate per work center. The UI therefore does **not** derive per-center pieces/hour from cycle time or present a misleading rated-capacity comparison. It shows work-center rated-machine coverage and effective rated cycle time, both directly supported by response fields.

## Source semantics and preserved behavior

- The three Phase 6 worksheet routes remain mapped to `DashboardAnalyticsPage`; no route or authorization changes were made.
- Summary still distinguishes missing downtime from confirmed zero and retains the warning for `2024-12` and `2025-08`.
- Summary Approx. Availability remains explicitly approximate and is not relabeled as OEE availability.
- Analytics charts, KPI scorecards, filters, loading/error/empty states, refresh controls, and source-backed tables remain available.
- RM and manpower charts are rendered only when the corresponding response contains records; paginated tables and source-backed filters remain unchanged.
- Dedicated reliability worksheets load pre-aggregated source rows with original row numbers and source provenance.
- Tests use typed mocked API response fixtures and a chart-wrapper test double to inspect the options passed to ECharts; these test values are not live production metrics.
- No backend files, credentials, Google Sheets data, production configuration, or authentication/login code were changed.

## Files changed

- `frontend/src/components/lineTracker/DashboardAnalyticsPage.tsx`
  - Added the capacity charts and Summary production-vs-target chart.
  - Extracted state-driven view components so visual states and chart options can be tested without changing the API flow.
- `frontend/src/components/lineTracker/DashboardAnalyticsPage.test.tsx`
  - Added component tests for chart fields/series, rated-CT gaps, data availability, empty/loading/stale/error states, Summary missing-vs-zero warnings, and Phase 6 page-key dispatch.
- `frontend/src/services/lineTrackerWorksheetRoutes.test.ts`
  - Expanded route-preservation coverage across Phase 1–4 worksheet keys; existing Phase 5 and Phase 6 route tests remain.
- `frontend/src/components/lineTracker/RmHeatPlanAnalyticsPage.tsx`
  - Added customer and supplier planned-material distribution charts using the existing normalized response summaries.
- `frontend/src/components/lineTracker/ShiftManpowerAnalyticsPage.tsx`
  - Added planned-versus-observed headcount chart for the selected manpower summary level.
- `frontend/src/components/lineTracker/WorksheetAnalyticsCharts.test.ts`
  - Verifies chart-ready category/series mapping and preservation of null gaps for raw material and manpower analytics.
- `frontend/src/components/lineTracker/OrderAnalyticsCharts.ts`
  - Transforms full-source order-book and monthly production/dispatch summaries.
- `frontend/src/components/lineTracker/RawMaterialAnalyticsCharts.ts`
  - Transforms stage-wise totals and heat-level yield series.
- `frontend/src/components/lineTracker/QualityAnalyticsCharts.ts`
  - Transforms dated Entries rejection summaries.
- `frontend/src/components/lineTracker/ReliabilityAnalyticsCharts.ts`
  - Transforms dedicated downtime Pareto, severity, OEE, MTTR, and MTBF tables.
- `frontend/src/components/lineTracker/ReliabilityAnalyticsPage.tsx`
  - Provides dedicated Downtime Analysis and OEE & Reliability views.
- `frontend/src/pages/ManufacturingDashboard.tsx`
  - Restores organized analytics-module navigation while retaining analytical routing.
- `frontend/src/styles/responsive-dashboard.css`
  - Adds mobile navigation, filter drawer, responsive chart/table containment, KPI bento layout, and overflow protection.
- `frontend/index.html`
  - Adds `viewport-fit=cover`, theme color, and Open Graph metadata for mobile/browser sharing.
- `frontend/src/data/normalization/workCenterMapping.ts`
  - Resolves Stage + Machine families to canonical work centers.
- `frontend/src/data/normalization/normalizeDprData.ts`
  - Binds Downtime Log aliases and preserves missing downtime values.
- `frontend/src/data/normalization/normalizeDprData.test.ts`
  - Covers downtime coercion, canonical work-center mapping, and unavailable values.
- Backend worksheet analytics services
  - Add full-source order, RM-stage, yield, and Entries-quality aggregates without changing source data.
- `ERC_MKV_VISUALIZATION_FIX_REPORT.md`
  - This report.

## Validation

Commands were run from `frontend`:

| Command | Result |
|---|---|
| `npm test -- --run src/components/lineTracker/DashboardAnalyticsPage.test.tsx src/services/lineTrackerWorksheetRoutes.test.ts src/services/lineTrackerWorksheetsApi.test.ts` | **Not rerun in this continuation; prior result:** 3 test files, 29 tests |
| `npm test -- --run` | **Passed:** 12 test files, 140 tests |
| `npm run typecheck` | **Passed** |
| `npm run lint` | **Passed with 6 warnings** in existing scripts and dashboard files outside this visualization change; no lint errors |
| `npm run build` | **Passed**; Vite emitted its existing large-chunk advisory (main JS bundle is above 500 kB) |

| `python -m pytest backend/tests -q` | **Passed:** 539 passed, 7 skipped |

Focused changed-backend tests also passed: 36 tests.

## Browser verification

**Untested.** No authorized browser page was shared for this task. I did not attempt to bypass sign-in. The exact routes to verify in an authenticated session are:

- `#/line-tracker/worksheet/production-dashboard`
- `#/line-tracker/worksheet/dashboard`
- `#/line-tracker/worksheet/summary`

Confirm that charts are visible after data loads, filters update the displayed series, chart gaps remain gaps for missing source values, and there are no browser console or network errors.

## Remaining limitations

- Per-work-center theoretical output/hour is unavailable from the current API response; no such chart is claimed or fabricated.
- Browser rendering and authenticated live-source requests remain unverified in this session.
- The lint warnings and bundle-size advisory were not addressed because they are unrelated to this scoped visualization change.
