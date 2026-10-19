# ERC Mk-V Dashboard — Phase 2 Report

**Scope:** Production Order, Copy of Production Order, and Order Plan (Monthly)  
**Live source validation date:** 2026-10-17  
**Status:** Phase 2 implementation complete; submitted for review

## Delivered

- Added authenticated, read-only analytics endpoints:
  - `GET /api/v1/line-tracker/orders/analytics`
  - `GET /api/v1/line-tracker/orders/monthly-plan`
- Both endpoints use the existing `dashboard:READ` permission. The API accepts only the two allowlisted order worksheet keys, and spreadsheet selection remains server-configured.
- Added bounded search, source-column filters, sorting, and pagination. The analytics service reads all rows through the Phase 1 cached worksheet service, with a 5,000-row guard and preserved stale-source/error provenance.
- Added dedicated Production Order and Copy of Production Order views and a separate monthly-plan view. Existing worksheet routes continue to use the Phase 1 generic page; `#/line-tracker` continues to render the original Line Tracker.
- Kept the copied order tab separate and excluded it from combined metrics. Monthly Production and Dispatch remain source Type labels; the UI does not describe them as validated actuals.
- Preserved source blanks as missing values, source month labels verbatim, source status strings verbatim, source Grand Total separately from the sum of monthly cells, and the monthly worksheet's information-only snapshot notice.
- Added backend parsing, join, deduplication, calculation, filtering, API/RBAC, stale/error, and validation tests, along with frontend API-client coverage.

## Live sheet and calculation validation

The configured Google Sheets service was used only for reads. The direct helper was invoked with `include_formulas=True` for value/formula comparisons. The service account scope is read-only; no sheet values were written.

| Worksheet | Live Google `sheetId` | Result |
|---|---:|---|
| Production Order | 1832059257 | Read succeeded |
| Copy of Production Order | 827106177 | Read succeeded |
| Order Plan (Monthly) | 443868223 | Read succeeded |

### Production orders and copy

- The live Production Order adapter parsed **6 order records** and excluded the instructional rows.
- Production Order and Copy of Production Order have the same headers and equal live calculated-value and formula grids after trimming trailing empty cells. The direct live reads returned 204 rows for each sheet; all compared values and formulas matched.
- The copy remains a distinct route/page for review, but it is not added to primary order counts or any total.
- The source currently has **5 `Open` rows and 1 `Closed?` row**. `Closed?` is retained literally; no status meaning was inferred.
- Only one of six orders has a populated RM requirement: **717.1863 MT**. This partial known-value total is accompanied by its known-value count. The `Order Qty` header does not state a unit, so no unit is assigned to it.
- Formula checks against the live calculated values:

| Cell | Live formula | Live calculated value |
|---|---|---:|
| Production Order D2 | `=345285+262500` | 607,785 |
| Production Order K2 | `=D2*1.18/1000` | 717.1863 |
| Copy of Production Order D2 | `=345285+262500` | 607,785 |
| Copy of Production Order K2 | `=D2*1.18/1000` | 717.1863 |

### Monthly plan and order overlap

- The exact source title is **“Order Plan — Monthly Production & Dispatch (FY 2026-27) — INFORMATION ONLY”**; the fiscal label is **FY 2026-27**.
- The page preserves the live headers exactly: `Apr-26`, `May-26`, `Jun-26`, `Jul-26`, `Aug-26`, `Sep-26`, `Oct-26`, `Nov-26`, `Dec-26`, `Jan-27`, `Feb-26`, `Mar-26`. The unusual final two labels are intentionally not corrected.
- The live formula in Order Plan (Monthly) E18 is `=SUMIF($I$5:$I$16,"Production",$E$5:$E$16)`, returning **3,943,015**. The analytics service independently sums the six Production `PO Qty` values and also returns **3,943,015**; the values match.
- **5 of 6** monthly Production PO identifiers match an order number exactly. The sixth monthly PO, `26265489205106`, is explicitly listed in the Production Order note as the real PO number for the placeholder order number `PO-2026-001`. It is shown as a **note-backed alias**, not an exact match. Current live reconciliation is therefore **5 exact + 1 note alias + 0 unmatched + 0 ambiguous**.
- The two Dispatch rows without source PO identifiers are paired in the display with their preceding Production plan row. That inherited PO is labeled as a paired/parent reference and is not represented as if it were present in the Dispatch source cell.
- Month-cell sums include only populated month values; blank cells remain `null`/blank. The source Grand Total (which may include carryover or another period) is displayed separately and is never substituted for a missing monthly sum.
- No plan-vs-actual production KPI is inferred from the plan sheet.

## Automated validation

| Check | Exact command / scope | Result |
|---|---|---|
| Phase 2 backend tests | `.\.venv\Scripts\python.exe -m pytest tests\test_line_tracker_order_analytics.py -q` | **13 passed** |
| Phase 2 + worksheet + Line Tracker backend regressions | With process-only `$env:LINE_TRACKER_SOURCE='local_excel'`: `.\.venv\Scripts\python.exe -m pytest tests\test_line_tracker_order_analytics.py tests\test_line_tracker_worksheets.py tests\test_line_tracker_service.py -q` | **63 passed** |
| Frontend tests | `npm run test -- --reporter=dot` | **106 passed** across 8 test files |
| Frontend typecheck | `npm run typecheck` | **Passed** |
| Frontend production build | `npm run build` | **Passed**; Vite emitted the existing large-chunk advisory (2.28 MB uncompressed JS) |
| Frontend lint | `npm run lint` | **Passed with warnings**: existing unused-variable warnings in scripts, hook dependency warnings in `TargetActualChart.tsx`, and hook dependency warnings in `ManufacturingDashboard.tsx` |
| Backend Ruff on new service and tests | `ruff check app\services\line_tracker_order_analytics_service.py tests\test_line_tracker_order_analytics.py` | **Passed** |
| Backend Ruff route import ordering | `ruff check --select I app\api\routes\line_tracker.py` | **Passed** |
| Backend Ruff formatting | `ruff format --check app\services\line_tracker_order_analytics_service.py tests\test_line_tracker_order_analytics.py` | **Passed** |
| Patch whitespace | `git diff --check` | **Passed**; Git printed line-ending notices for pre-existing `backend/.env.example` and `frontend/src/App.tsx` |

The Line Tracker service regressions require the local Excel source, so the combined regression run used a process-local `LINE_TRACKER_SOURCE=local_excel` override. No `.env` or production configuration was changed.

A full Ruff check of the expanded `line_tracker.py` route module reports four E501 long-line diagnostics in existing sections outside the Phase 2 endpoints. Its import-order diagnostic was corrected; the new Phase 2 service and tests pass Ruff. No unrelated long lines were changed.

## Browser walkthrough and manual verification still required

The available browser page at `http://localhost:5173/` displayed **Sign in**. No authorized signed-in browser session was available. No credentials were requested, entered, changed, or bypassed, and no attempt was made to simulate authentication. Consequently, rendered UI and authenticated navigation remain unverified.

When an authorized development session is available, verify:

1. Open the dashboard and expand the ERC Mk-V Line Tracker worksheet group.
2. Open Production Order and Copy of Production Order from the sidebar. Confirm both show separate views and the duplicate warning; verify the copy is never added to primary metrics.
3. Open Order Plan (Monthly). Confirm the full source title, FY label, and exact month headers—including `Feb-26` and `Mar-26`.
4. Search by customer/PO, filter by available source status/customer/part/type/month, change sort order, and paginate. The production-order source has six records and the UI page size is ten, so it will not have a second production-order page; the monthly plan has enough rows to exercise pagination.
5. Refresh each page and confirm source IDs and freshness timestamps. Verify stale/error presentation only if a safe development failure can be reproduced; do not cause an outage or alter production.
6. Test direct nested-route loading and browser back/forward navigation for all three pages.
7. Reopen the existing `#/line-tracker` page and verify its original Line Tracker and Downtime Log.
8. Check desktop and mobile layouts, especially horizontal table scrolling and sidebar navigation.

## Scope and handoff

No login/password behavior was changed for Phase 2. No Google Sheets writes, commits, pushes, merges, deployments, publication, or production configuration changes were performed. Pre-existing modified and untracked worktree files were preserved. Phase 3 has not started.

**Recommendation:** Phase 2 is implemented and its data, calculations, APIs, and automated checks are ready for review. The user should review this report; authenticated visual/browser verification remains the sole identified review limitation.
