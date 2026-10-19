# ERC Mk-V Dashboard Implementation Plan

## Goal

Extend the existing Patil Manufacturing Analytics application to expose the 17 source worksheets without replacing the current dashboard, altering login/authentication, writing to the Google spreadsheet, or removing existing modules. Proceed in validated phases. This plan is based on the local workbook audit and successful read-only access checks against all live tabs on 2026-10-17.

## Current architecture and constraints

- Backend: FastAPI, existing `/api/v1/line-tracker/*` router, RBAC `dashboard:READ`, `line_tracker_service.py`, and Google Sheets support in `google_sheets_service.py`.
- Existing Google Sheets helper `_fetch_sheet_values_with_metadata` already returns tab title, live sheetId, grid size, values, headers, and optional formulas using the read-only scope.
- Existing live Line Tracker ingestion reads/reconstructs all worksheets and parses orders, Entries, machine/heat masters, and downtime. Its in-memory dataset cache and data-quality warnings are established behavior.
- Frontend: authenticated app with hash-based routing inside `ManufacturingDashboard.tsx`, an existing collapsible/responsive sidebar, existing `LineTrackerView`, and a typed API client.
- Existing dashboard routes and integrations must remain intact. The worksheet pages should be nested routes and grouped sidebar entries under `ERC Mk-V Line Tracker`, not duplicate top-level modules.
- The working tree was already dirty before this audit. Existing modifications/untracked files are not part of this plan and must be preserved.
- Keep the service account and all credentials server-side. Do not log or return secrets. Use read-only Google Sheets calls.

## Foundation decisions

1. Use the 17 exact worksheet names as the canonical source labels and stable frontend route keys as application slugs. Always discover and return live Google `sheetId` from spreadsheet metadata; never assume the local Excel sheet ID or tab position is the live ID.
2. Add one reusable authenticated worksheet catalog/data API rather than 17 route implementations. Return safe metadata, exact headers/rows, live source identifier, request timestamp, cache status, and validation warnings. Use an allowlisted manifest for the expected worksheet list and header/layout metadata. Do not accept arbitrary spreadsheet IDs from page routes.
3. Respect each sheet's layout. Standard row tables use the audited header row; dashboard and multi-section sheets need a layout-aware representation rather than pretending all title/summary cells form one record table. Phase 1 may show them as source rows with stable spreadsheet column labels where no single table exists; specialized visualization is deferred to the relevant phase.
4. Preserve a usable cached result only with explicit stale/cache provenance. A failed fresh fetch must not report a new successful refresh time. Unknown worksheet, no credentials, access denial, and API failures are explicit errors.
5. Provide a common table UX for the source-grid pages: search, pagination, appropriate simple field filters, source/worksheet ID, cache/freshness status, loading/error/empty states, and refresh. Do not manufacture unsupported KPIs or charts.
6. Use the current app's hash router and sidebar. Add nested routes such as `#/line-tracker/worksheet/production-order`; browser back/forward and direct URLs must resolve. Keep `#/line-tracker` and all current dashboard/module routes unchanged.

## Phases and gates

| Phase | Scope based on inspected workbook | Implementation and validation gate |
|---|---|---|
| 1 - Foundation, data access, navigation | Shared catalog/raw sheet access and grouped navigation for all tabs; generic table/status page; retain existing Downtime Log integration. | Verify live catalog against the 17 discovered sheet names/IDs; exercise each sheet page; validate RBAC, caching, refresh/error reporting, and routes; run focused backend and frontend tests, lint/typecheck/build as available. Stop for review after Phase 1. |
| 2 - Production orders and monthly plan | `Production Order`, exact duplicate `Copy of Production Order`, `Order Plan (Monthly)`. | Document the duplicate tab, reconcile 5/6 overlapping PO IDs, validate statuses, dates, quantity/MT conversion and month phasing. Never sum duplicate orders. |
| 3 - Raw material and traceability | `RM Heat Plan vs Actual`, `Heat & Lot Number Reference`. | Use verified composite Heat No. + Lot No. key (33/33 plan pairs matched); validate units, formula yields, one-to-many behavior, unmatched reference rows, and source batch. |
| 4 - Machines, consumables, capacity, shutdowns | `Machine Consumables`, `Machine Master`, `Capacity Change Log`, `Planned Shutdowns`. | Use exact Work Center + Machine key. Replace/confirm sample rows before trends or shutdown/capacity calculations. Verify rated CT formulas and units; do not present planned shutdown as actual downtime. |
| 5 - Shift entries and manpower | `Entries`, `Manpower Summary`. | Validate array/formula outputs and formula ranges; preserve blanks vs zero; reconcile work-center/machine, shift/date, planned vs actual staffing; calculate output per person only if scope compatibility is proven. |
| 6 - Existing workbook dashboards | `Production Dashboard`, `Dashboard`, `Summary`. | Reproduce only source-backed metrics, filters, and definitions. Validate ranges (including possible truncated Machine Master formula range), formula results, date gaps, and duplicates against raw worksheets. Keep existing main dashboard. |
| 7 - Downtime and OEE/reliability | `Downtime Log`, `Downtime Analysis`, `OEE & Reliability`. | Preserve existing integration and mirror suppression. Reconcile missing durations, exact duplicates, Nov 2024 gap, breakdown classification, OEE denominators, weighted vs unweighted values. Do not calculate MTTR/MTBF without verified definitions and event durations. |
| Final QA | All pages and existing modules. | Full regression tests, frontend build/lint/typecheck, API/RBAC checks, route navigation, source reconciliation, error/stale-state checks, final QA report. No deploy/commit without explicit approval. |

## Phase 1 acceptance checklist

- [x] Local workbook contains the listed 17 exact tab names.
- [x] Each live worksheet was individually read using read-only access; all 17 returned successfully.
- [x] Actual live Google `sheetId` values and header/layout rows are documented in `ERC_MKV_WORKSHEET_INVENTORY.md`.
- [x] Reusable authenticated catalog and worksheet data routes provide exact metadata and safely bounded/paginated rows.
- [x] Navigation adds all 17 routes under an `ERC Mk-V Line Tracker` section without removing existing items.
- [x] Each page exposes source status, refresh time/cache status, and loading, error, empty, and stale states. Mixed dashboard sheets use raw-grid display.
- [x] Existing line-tracker routes and the current Downtime Log functions remain unchanged and pass regression tests.
- [x] Backend tests cover catalog completeness, IDs, table/grid layouts, pagination/search, cache/refresh/stale fallback, endpoint errors, and unauthenticated access; frontend API-client tests cover request construction.
- [ ] Signed-in browser walkthrough of all 17 navigation entries and worksheet page display. The available local browser is at the sign-in screen; no credentials or authentication state were changed. See `ERC_MKV_PHASE_1_REPORT.md`.

## Audit items to resolve in their corresponding phases

- The supplied Production Order and Copy tabs are exact duplicates; determine display policy and recheck live cell-level equality.
- Production Order / monthly plan IDs overlap only partially.
- Several dashboard and summary sheets use fixed formula ranges; confirm dynamic coverage before porting results.
- `Capacity Change Log` and `Planned Shutdowns` currently contain explicit examples rather than reliable historical/operational events.
- `Machine Consumables` identifies itself as a starting list with an assumed category, not inventory.
- `Entries` contains 3,300 formulas and array formulas; formula cached results in the local workbook are incomplete. Reconcile with live computed values.
- Downtime source has missing durations, exact duplicate rows, formula-mirrored entries, and an identified November 2024 data gap.
- OEE & Reliability reports averages. Validate weighting and component definitions before creating consolidated OEE.
- Chatbot changes are deferred until the data and calculations for the relevant worksheets pass their phase gates.
