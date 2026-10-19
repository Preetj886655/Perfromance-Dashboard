# ERC Mk-V All-Worksheet Analytics Report

**Status: COMPLETE for the verified worksheet analytics scope — supported chart slices are wired to read-only source-backed contracts. Unavailable cells remain explicit gaps; no unsupported metrics or source writes were introduced.**

## Source and safety

- Live Google Sheets remains the primary production source through the existing server-side, read-only service.
- The 17-worksheet allowlist, authentication, `dashboard:READ` authorization, existing hash routes, and login/password flow were preserved.
- No Google Sheet values or formulas, credentials, production configuration, commits, deployments, or pushes were changed.
- The downloaded workbook remains an audit/test fixture rather than a replacement source.

## Verified analytics coverage

| Area | Existing or added visual analytics | Verified source basis |
|---|---|---|
| Production Dashboard | Daily output vs target line chart | `date`, `output_nos`, `target_nos` |
| Dashboard / capacity | Rated-machine coverage and effective rated cycle-time horizontal bars | `work_center`, `rated_machine_count`, `effective_rated_ct_sec` |
| Summary | Downtime vs breakdown trend and actual vs target grouped bars | Period aggregates with explicit known/missing counts |
| RM Heat Plan vs Actual | Planned material distribution by customer and supplier | `customer_summary[].rm_qty_mt`, `supplier_summary[].rm_qty_mt` |
| Manpower Summary | Average planned vs average actual headcount bars | `records[].avg_planned`, `records[].avg_actual` |
| Entries | Work-center OP10/OP20/OP30/other rejection comparison | Full-source dated Entries summary; blank template rows excluded |
| Downtime Analysis | Downtime Pareto and machine breakdown severity charts | Dedicated Table 1 rows 6–25 and Table 2 rows 30–49 |
| OEE & Reliability | Work-center OEE breakdown and machine MTTR/MTBF charts | Dedicated rows 6–14, 20–34, and 40–54 |
| Machine assets | Existing capacity, maintenance, change-log, and shutdown tables/KPIs | Existing normalized asset responses; example/unverified records remain labeled |

## Semantics preserved

- Missing values remain null/gaps and are not silently changed to zero.
- Theoretical capacity and rated cycle time are not presented as actual output.
- Approximate availability remains explicitly approximate and is not labeled as OEE availability.
- Downtime remains in minutes or hours according to the source contract; no implicit unit conversion was added to the new charts.
- Raw-material charts represent planned material, not inventory or actual consumption.
- Manpower charts represent headcount per shift; rated manpower is a planning assumption and actual manpower is observed Entries data.
- Dedicated downtime/reliability charts use pre-aggregated worksheet rows and do not aggregate the 14,567-row Downtime Log from a paginated frontend page.
- Order Plan metadata is forward-filled from Production rows to paired Dispatch rows. `Feb-26` and `Mar-26` are normalized to `Feb-27` and `Mar-27` analytical labels while raw headers remain available.
- RM stage charts exclude separator/total rows; `#REF!`, `#N/A`, and blank values remain unavailable chart points.

## Files changed in this continuation

- `frontend/src/components/lineTracker/RmHeatPlanAnalyticsPage.tsx`
  - Added responsive ECharts bars for customer and supplier planned RM distribution.
- `frontend/src/components/lineTracker/ShiftManpowerAnalyticsPage.tsx`
  - Added responsive ECharts bars for average planned vs observed manpower at the selected level.
- `frontend/src/components/lineTracker/ReliabilityAnalyticsPage.tsx`
  - Added dedicated Downtime Analysis and OEE & Reliability views.
- `frontend/src/components/lineTracker/ReliabilityAnalyticsCharts.ts`
  - Added Pareto, severity, OEE, MTTR, and MTBF chart transformers.
- `frontend/src/components/lineTracker/QualityAnalyticsCharts.ts`
  - Added full-source dated Entries rejection transformer.
- `frontend/src/pages/ManufacturingDashboard.tsx`
  - Routed Downtime Analysis and OEE & Reliability to the dedicated analytics page.
- `backend/app/services/line_tracker_order_analytics_service.py`
  - Added full-source order-book/monthly plan summaries, paired-row forward-fill, and normalized analytical month labels.
- `backend/app/services/line_tracker_rm_heat_service.py`
  - Added full-source stage summaries and heat-level yield series.
- `backend/app/services/line_tracker_shift_manpower_service.py`
  - Added full-source dated Entries rejection summaries by work center.
- `ERC_MKV_VISUALIZATION_FIX_REPORT.md`
  - Extended chart inventory and validation notes.

## Validation

Run from `frontend`:

| Command | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm test -- --run` | Passed: 11 files, 137 tests |
| `npm run lint` | Passed with existing warnings; no errors |
| `npm run build` | Passed; Vite emitted the existing large-bundle advisory |

| `python -m pytest backend/tests -q` | Passed: 539 passed, 7 skipped |

Focused changed-backend tests also passed: 36 tests.

## Browser verification

Not performed. No already-authorized browser session was available and no sign-in bypass was attempted. Manual verification should cover:

1. `#/line-tracker/worksheet/production-dashboard`
2. `#/line-tracker/worksheet/dashboard`
3. `#/line-tracker/worksheet/summary`
4. `#/line-tracker/worksheet/heat-plan-vs-actual`
5. `#/line-tracker/worksheet/manpower-summary`
6. Phase 1–5 routes, browser back/forward, refresh, stale/error states, and mobile layout.

## Remaining limitations

- Browser verification remains untested because no authorized browser session was shared.
- Live values remain controlled by Google Sheets freshness and formula availability; stale/error state and unavailable cells are surfaced rather than replaced.
- Existing lint warnings and the Vite bundle-size advisory remain unchanged and are not errors.
