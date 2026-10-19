# ERC Mk-V Dashboard — Phase 6 Report

**Scope:** Production Dashboard, Dashboard, and Summary  
**Spreadsheet:** `1axzlqa-0nga1nnLSOZ1HQpjFZzx1kUlQ-KrqJgblw-s`  
**Status:** **PARTIAL** — live-source calculations and automated checks pass for the Phase 6 and Line Tracker regression suites. Full backend validation has unrelated failures, and authenticated browser verification remains outstanding.

## Delivered

- Reused the three existing worksheet entries and routes; each now opens a dedicated, source-backed analytics view while retaining source provenance and freshness/error states.
- Added authenticated dashboard endpoints:
  - `GET /api/v1/line-tracker/dashboards/production`
  - `GET /api/v1/line-tracker/dashboards/capacity`
  - `GET /api/v1/line-tracker/dashboards/summary`
- The endpoints use the existing worksheet reader and `dashboard:READ` access dependency. Worksheet selection and spreadsheet IDs remain server-side.
- Added date/stage/machine filters where supported, daily and period tables, capacity comparisons, source-reconciliation indicators, missing-data warnings, and responsive page layouts.
- Kept source records and worksheet formulas read-only. Summary cells are reconciled against underlying records, not treated as additional production records.
- Excluded the Downtime Log's Entries mirror formula range from historical downtime calculations.

## Live worksheets, schemas, and coverage

All three live worksheet IDs were verified by fetching the worksheet data:

| Worksheet | Google `sheetId` | Verified layout |
|---|---:|---|
| Production Dashboard | `1905823832` | Daily table header row 7: `Day#`, `Date`, `Output`, `Target`, `Downtime (hrs)`, `Fill %`. Date-window, latest-log-date, and source filter settings are above the table. |
| Dashboard | `1047718776` | Work-center header row 5: `Work Center`, `Machines`, `Effective Rated CT (sec)`, `Bottleneck?`. Actual-performance section is rows 24–32. |
| Summary | `311599185` | Monthly header row 5: `Month`, `Downtime Hours`, `Breakdown Hours`, `Target NOS`, `Actual NOS`, `Fill %`, `Approx. Availability %`; yearly section is rows 34–37. |

The dashboards also read their verified dependencies: Entries (`1019432778`), Machine Master (`1022871279`), and Downtime Log (`1490231673`).

### Production Dashboard

- Current source period: **2026-09-04 through 2026-09-18**.
- **13** daily formula rows were returned for the 15-day source window; **2026-09-13** and **2026-09-14** have no source daily records.
- The source date-window setting is 15 days; latest log date is **2026-09-18**.
- Output is summed from Downtime Log `Total PROD NOS` (column M), target from `Prod Target NOS` (L), downtime from `Downtime Mins` (J) converted to hours, and Fill is output divided by target. Missing source values remain missing.
- The source's “Work Center” filter actually matches Downtime Log `Stage` (E); the machine filter matches `Machine` (F). The page identifies the mismatch and labels the filter Stage rather than claiming the field is a work center.
- The refreshed live calculation compared **52 daily formula values with 0 mismatches** and **2 source summary values with 0 mismatches**.
- The source summary values for average fill and total downtime reconciled with recalculated data.

### Dashboard capacity view

- Current Machine Master contains **31** parsed machine records: **27 active with valid rated cycle time**, **2 decommissioned**, and **2 active but unrated**. The latter four are excluded from active rated capacity calculations.
- Effective rated cycle time is recalculated as `1 / SUM(1 / rated CT)` for active, rated machines at each work center. This is a theoretical aggregate cycle time, not an actual production output metric.
- The source capacity formulas cover Machine Master rows **2–28**. All 27 currently active, rated machines are in the range; the formula range must be reviewed if source records extend below row 28.
- Live capacity reconciliation checked **18 values across 9 work centers with 0 mismatches**.
- Source-defined actual-performance rows **24–32** were independently compared with Entries. **24 values checked, 0 mismatches**.
- Packing is the current theoretical bottleneck at **4.4 sec**, corresponding to **818.18 pcs/hour** and **9,818.18 pcs per 12-hour shift** under the source's explicitly stated theoretical capacity assumption. These are not actual output values.
- The Dashboard's calculated machine count reflects rated active machines for the formula reconciliation; the UI also distinguishes registered and unrated/decommissioned machine counts.

### Summary view

- The source has **25 monthly rows** and yearly rows for **2024–2026**.
- Downtime and Breakdown Hours are duration sums in minutes converted to hours; Breakdown is selected only where the source category is `Breakdown`.
- Target NOS and Actual NOS use the Downtime Log target and production fields. Fill is actual divided by target.
- “Approx. Availability %” is kept explicitly approximate and follows the source's formula: `1 - (downtime hours / (calendar days × 24 × 27))`. It is not represented as OEE availability.
- Live reconciliation checked **143 monthly formula values with 2 differences** and **18 yearly formula values with 0 differences**.
- The two monthly differences are **2024-12** and **2025-08**. Their source periods have blank downtime durations while the worksheet formula produces zero downtime and 100% approximate availability. The implementation preserves missing downtime as missing and does not present that as zero; this source/formula semantic discrepancy remains documented.
- November 2024 has **0** source Downtime Log records. The currently fetched historical records span **2024-08-31 through 2026-09-18**, with **14,567 historical records**.

## Formula, data-quality, and duplicate handling

- Downtime Log historical records are rows **2–14,568**. Rows **14,569–14,868** are the **300-row** formula-mirror range for Entries and are excluded from historical aggregates. One nonempty value in the mirror range was also excluded; **0 invalid dates** remained after parsing valid date cells and padding omitted trailing cells.
- Google Sheets date serials are converted to calendar dates before filtering and aggregation.
- Blank / `#N/A` formula values are treated as unavailable, not zero.
- Duration inputs are in minutes and are converted to hours explicitly. No mirrored Entry records are added to downtime totals.
- The Production Dashboard's fill and source summary values reconcile for the current live pull. Summary's two blank-duration discrepancies are not silently “fixed.”
- Machine Master rows outside the source's capacity formula range are not assumed included in future Dashboard formulas.
- Dashboard capacity and approximate availability values are presented with their theoretical/approximate definitions; no audited OEE, actual production rate, or unsupported breakdown classification is inferred.

## Files changed for Phase 6

- Backend calculations, parsing, and reconciliation: [line_tracker_dashboard_service.py](./backend/app/services/line_tracker_dashboard_service.py)
- Authenticated API routes: [line_tracker.py](./backend/app/api/routes/line_tracker.py)
- Backend Phase 6 tests: [test_line_tracker_dashboard_service.py](./backend/tests/test_line_tracker_dashboard_service.py)
- Frontend dashboard types and API calls: [lineTrackerWorksheetsApi.ts](./frontend/src/services/lineTrackerWorksheetsApi.ts)
- Frontend API tests: [lineTrackerWorksheetsApi.test.ts](./frontend/src/services/lineTrackerWorksheetsApi.test.ts)
- Frontend route tests: [lineTrackerWorksheetRoutes.test.ts](./frontend/src/services/lineTrackerWorksheetRoutes.test.ts)
- Dedicated analytics views: [DashboardAnalyticsPage.tsx](./frontend/src/components/lineTracker/DashboardAnalyticsPage.tsx)
- Existing worksheet page dispatch: [ManufacturingDashboard.tsx](./frontend/src/pages/ManufacturingDashboard.tsx)
- Responsive dashboard styling: [line-tracker-dashboards.css](./frontend/src/styles/line-tracker-dashboards.css)

## Validation performed

| Check | Result |
|---|---|
| Focused Phase 6 backend tests: `python -m pytest backend/tests/test_line_tracker_dashboard_service.py -q` | **7 passed** |
| Phase 1–6 Line Tracker regression selection: worksheet, order analytics, heat/lot, machine assets, shift/manpower, and dashboard service test modules | **61 passed** |
| Live read-only service refresh for all three dashboards | IDs verified; production 52 daily / 2 summary values matched; capacity 18 values and actual performance 24 values matched; Summary 143 monthly values had 2 documented differences and 18 yearly values matched |
| Frontend tests: `npm test -- --run` from `frontend` | **120 passed** across 9 files |
| Frontend type check: `npm run typecheck` | Passed |
| Frontend lint: `npm run lint` | Passed with 6 warnings (unused variables and hook dependency warnings, including existing warnings in the main dashboard) |
| Frontend production build: `npm run build` | Passed; Vite reports the existing large-chunk advisory (2,371.34 kB JS minified) |
| Ruff import check and format check on the Phase 6 backend service | Passed |
| `git diff --check` | Passed; Git printed line-ending conversion warnings only |
| Full backend suite: `python -m pytest backend/tests -q` with `LINE_TRACKER_SOURCE=local_excel` | **477 passed, 59 failed, 7 skipped**. Failures are outside the Phase 6 focused/Line Tracker regression selection; failure output includes DPR/OEE ingestion and worker tests requiring seeded `rejection_reasons` A–J, which are absent in this test database. Full backend suite is therefore not green. |

The live read-only validation used `refresh=True` and printed only worksheet IDs, counts, reconciliation results, and data-quality metadata; it did not expose credentials or write source data.

## Browser verification and manual checks

Authenticated browser verification was not completed. The available browser session was at the sign-in page and returned unauthorized responses. No credentials were requested, changed, or bypassed.

In an already-authorized development session, manually:

1. Open the existing dashboard and expand **ERC Mk-V Line Tracker**.
2. Open **Production Dashboard**, **Dashboard**, and **Summary** from their existing sidebar entries. Verify no duplicate navigation entries were added.
3. On Production Dashboard, compare the daily chart/table to the displayed date window; exercise Stage, Machine, and date filters; refresh and confirm source freshness.
4. On Dashboard, confirm the work-center capacity and bottleneck labels, theoretical-unit labels, and links/drill-downs to Machine Master where present.
5. On Summary, switch monthly/yearly summaries and date periods; check downtime hours, breakdown hours, Fill, and the explicitly approximate availability label.
6. Check loading, empty, stale, and source-error states when safely reproducible; verify source IDs and last-successful-refresh metadata.
7. Use browser back/forward and direct-load each existing route.
8. Confirm existing Phase 1–5 worksheet routes, the original Line Tracker and Downtime Log still work.
9. Check desktop and mobile widths for readable charts, controls, and tables.

## Recommendation

**PARTIAL.** The Phase 6 live-source reconciliations and targeted automated regressions passed, but the full backend suite is not green because of test-environment prerequisites, two Summary source/formula semantic discrepancies remain, and authenticated browser walkthroughs are unverified. No Phase 7 work was started.
