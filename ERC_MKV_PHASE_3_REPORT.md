# ERC Mk-V Dashboard - Phase 3 Report

**Scope:** Raw Material Planning and Heat/Lot Traceability  
**Live source validation:** 2026-10-17  
**Status:** **PARTIAL** - implementation and automated validation pass; authenticated browser walkthrough remains unavailable.

## Delivered

- Added dedicated views for `RM Heat Plan vs Actual` and `Heat & Lot Number Reference`, while retaining access to all original worksheet rows.
- Reused the Phase 1 allowlisted, cached, read-only Google Sheets service and `dashboard:READ` authorization.
- Added authenticated endpoints:
  - `GET /api/v1/line-tracker/raw-material/plan-actual`
  - `GET /api/v1/line-tracker/raw-material/heat-lot-reference`
- Kept the Phase 1 nested worksheet routes:
  - `#/line-tracker/worksheet/rm-heat-plan-vs-actual`
  - `#/line-tracker/worksheet/heat-lot-number-reference`
- Added customer, supplier, source-batch, search, sorting, pagination, and exact composite-key filtering. Reference-to-plan and plan-to-reference drill-down links preserve both identifiers in the URL.
- Preserved source freshness, stale-cache status, refresh errors, validation warnings, and raw-source row disclosure.
- The heat/lot reference remains a master/reference source. Its material quantities are not summed with plan quantities.

## Live worksheets and schema

Both sources were fetched using read-only access. The service checked the configured source and the expected live sheet IDs before parsing.

| Worksheet | Google `sheetId` | Header row | Principal detail rows | Source rows returned after header |
|---|---:|---:|---:|---:|
| RM Heat Plan vs Actual | 217356585 | 4 | 40 | 52 |
| Heat & Lot Number Reference | 1881319427 | 5 | 40 | 79 |

Live headers for `RM Heat Plan vs Actual`:

`Customer`, `Supplier`, `Heat No.`, `Lot No.`, `RM Qty (MT)`, `Plan: Cut Bar (Nos)`, `Actual: Bar Cropper OK`, `Actual: Endbit Scrap`, `Actual: ACM/Turning OK`, `Actual: ACM/Turning REJ`, `Plan: Clip Prod (Nos)`, `Actual: Forming OK`, `Actual: Forming REJ`, `Plan: Final Supply (Nos)`, `Yield vs Plan %`, `Balance / Reconciliation`, `Source Batch`

Live headers for `Heat & Lot Number Reference`:

`Heat No.`, `Lot No.`, `Customer`, `Supplier`, `RM Qty (MT)`, `Source Batch`

The extra returned rows include source labels, a total/separator, summary values, and (in the reference sheet) a distinct-lot reverse cross-reference. The parser excludes those secondary sections from the principal detail dataset; the raw-source disclosure retains source rows rather than treating the excluded sections as transactions.

## Composite-key reconciliation and data quality

The join key is `(Heat No., Lot No.)`. Identifiers are trimmed and case-folded only for matching; punctuation and leading zeroes are retained, and the original source spelling is displayed.

| Check | Live result |
|---|---:|
| Principal plan rows | 40 |
| Principal reference rows | 40 |
| Complete plan keys | 33 |
| Incomplete plan keys | 7 |
| Complete reference keys | 33 |
| Incomplete reference keys | 7 |
| Exact matched complete pairs | 33 |
| Unmatched complete plan pairs | 0 |
| Complete reference-only pairs | 0 |
| Duplicate complete keys (plan/reference) | 0 / 0 |
| Ambiguous complete plan keys | 0 |
| Matched-pair customer/supplier/batch/RM quantity differences | 0 |
| Distinct Lot Numbers cross-reference entries | 33 |
| Cross-reference entries resolving to a primary reference pair | 33 |
| Unmatched/duplicate cross-reference pairs | 0 / 0 |

The seven incomplete-key records on each side are retained and are not joined using Heat No. alone. Repeated plan/reference quantities for matched pairs are consistent reference attributes, not independent material receipts. The 33 cross-reference entries are a separate reverse index, not another additive dataset.

## Formula and unit validation

The live `Yield vs Plan %` formula is `=IFERROR(Lr/Kr,"")`, where column L is `Actual: Forming OK` and column K is `Plan: Clip Prod (Nos)`. The formula was independently recalculated against the live returned values: **35 populated yield results checked; 35 matched; 0 mismatches**. Missing formula results remain blank, and no yield average was introduced.

The live summary formulas and independently recomputed detail sums reconcile:

| Live cell | Formula | Live result | Detail-row recomputation |
|---|---|---:|---:|
| B51 | `=SUM(E5:E45)` | 2,102.182 MT | 2,102.182 MT |
| B52 | `=SUM(N5:N45)` | 1,774,734.2116197099 | 1,774,734.2116197099 |
| B53 | `=SUM(L5:L45)` | 1,456,660 | 1,456,660 |

The downloaded workbook contains the same formula definitions. Its cached B52 value is rounded to 1,774,734.212; the live Google Sheets calculation carries more precision. The unrounded live result and detail sum match.

- `RM Qty (MT)` and the applicable plan quantities explicitly label their units in the source.
- Actual-stage column headers do not specify units; the UI displays those values as source quantities, without unit conversion or implied unit.
- `Balance / Reconciliation` has no explicit unit and is shown only as the source value.
- The page displays plan and actual stage quantities separately and does not invent a plan/actual variance where the actual-stage unit is unspecified.
- The reference sheet's RM Qty is displayed per reference row and is not used as an additive material-receipt total.

## Files changed for Phase 3

- `backend/app/services/line_tracker_rm_heat_service.py`
- `backend/app/api/routes/line_tracker.py`
- `backend/tests/test_line_tracker_rm_heat_service.py`
- `frontend/src/services/lineTrackerWorksheetsApi.ts`
- `frontend/src/services/lineTrackerWorksheetsApi.test.ts`
- `frontend/src/services/lineTrackerWorksheetRoutes.ts`
- `frontend/src/services/lineTrackerWorksheetRoutes.test.ts`
- `frontend/src/pages/ManufacturingDashboard.tsx`
- `frontend/src/components/lineTracker/RmHeatPlanAnalyticsPage.tsx`
- `frontend/src/components/lineTracker/HeatLotReferencePage.tsx`
- `frontend/src/components/lineTracker/RawMaterialShared.tsx`
- `frontend/src/components/lineTracker/rawMaterialFormatting.ts`
- `frontend/src/styles/line-tracker-raw-material.css`

## Automated validation

| Check | Exact command/scope | Result |
|---|---|---|
| Backend Phase 1/2/3 and Line Tracker regressions | From `backend`: set process-local `$env:LINE_TRACKER_SOURCE = 'local_excel'`; run `.\.venv\Scripts\python.exe -m pytest tests\test_line_tracker_worksheets.py tests\test_line_tracker_order_analytics.py tests\test_line_tracker_rm_heat_service.py tests\test_line_tracker_service.py -q` | **77 passed** |
| Frontend typecheck | From `frontend`: `npm run typecheck` | **Passed** |
| Frontend tests | From `frontend`: `npm test` | **111 passed across 9 files** |
| Frontend lint | From `frontend`: `npm run lint` | **Passed with existing warnings** in `TargetActualChart.tsx`, scripts, and unrelated `ManufacturingDashboard.tsx` hook dependency sites; no new Phase 3 lint warnings |
| Frontend production build | From `frontend`: `npm run build` | **Passed**; Vite reports its existing large-chunk advisory (about 2.31 MB uncompressed JS) |
| Backend Ruff | `ruff check app\services\line_tracker_rm_heat_service.py tests\test_line_tracker_rm_heat_service.py` | **Passed** |
| Backend route import order | `ruff check --select I app\api\routes\line_tracker.py` | **Passed** |
| Backend format | `ruff format --check app\services\line_tracker_rm_heat_service.py tests\test_line_tracker_rm_heat_service.py` | **Passed** |
| Patch whitespace | `git diff --check` | **Passed**; Git printed line-ending notices for pre-existing `backend/.env.example` and `frontend/src/App.tsx` |
| Live read-only formula validation | Direct live value/formula reads plus Phase 3 parser summary | **Passed**; 40 detail rows each, 33 exact complete pairs, 35/35 populated yield checks, and all three summary sums reconcile |

The first combined backend regression invocation did not set the expected test-only source override and returned 61 passed / 2 failed: two legacy Line Tracker assertions expect `local_excel`, while this worktree's active configuration selected `google_sheets`. Rerunning with the process-local `LINE_TRACKER_SOURCE=local_excel` override passed all 77 tests. No `.env`, production configuration, or Google Sheet was changed.

## Browser verification and remaining manual checks

The existing local browser tab is signed out and displays the Sign in page, with recent API 401 responses. No authorized session was available. No credentials were requested, entered, changed, or bypassed. An authenticated browser walkthrough therefore remains unverified.

Using an existing authorized development session, manually verify:

1. Open the dashboard and expand the ERC Mk-V Line Tracker worksheet group.
2. Open both new worksheet pages; verify source ID, freshness, 40 principal rows, metric labels, and raw-source disclosure.
3. Search and filter by customer, supplier, source batch, and terms. Sort and paginate both tables.
4. Enter a heat number and lot number together and submit an exact lookup. Follow both directions of the plan/reference drill-down and confirm the composite pair remains in the route.
5. Use browser back/forward and directly load each nested route, including an exact heat/lot query.
6. Exercise refresh and, only where safely reproducible, inspect stale/error handling. Do not write to either sheet.
7. Confirm the existing Line Tracker and Downtime Log still work, and confirm Phase 2 Production Order and monthly-plan routes remain accessible.
8. Check desktop and mobile layouts, especially horizontal scrolling for the wide plan and raw-source tables.

## Safety and final status

No Google Sheets writes, credential changes, commits, pushes, merges, deployments, publication, or production-configuration changes were made. Pre-existing modifications and untracked files were preserved. No Phase 4 work was started.

**Final status: PARTIAL.** The live-data reconciliation, implementation, backend/frontend tests, type checks, lint, and build are complete. Final acceptance is limited only by the unavailable authenticated browser session and the manual checks above.
