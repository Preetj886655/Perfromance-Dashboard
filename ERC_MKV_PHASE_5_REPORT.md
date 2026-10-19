# ERC Mk-V Dashboard — Phase 5 Report

**Scope:** Entries and Manpower Summary  
**Live-source mode:** Read-only Google Sheets access  
**Status:** **PARTIAL** — implementation and data/test validation are complete; authenticated browser verification remains outstanding.

## Delivered

- Added dedicated, source-backed **Shift Entries** and **Manpower Summary** views to the existing worksheet pages.
- Reused the existing worksheet catalog entries, nested hash routes, read-only worksheet service, freshness metadata, and `dashboard:READ` authorization.
- Added authenticated endpoints:
  - `GET /api/v1/line-tracker/operations/entries`
  - `GET /api/v1/line-tracker/operations/manpower-summary`
- Added search, supported source-column filters, sorting, pagination, formula validation labels, missing-value handling, source status, refresh/error/stale/empty states, and verified machine/heat-lot relationship indicators.
- Kept work-center and machine manpower summaries separate. The pages do not calculate weighted OEE or productivity per person.
- Did not add formula-mirrored Downtime Log records to downtime totals.

## Live worksheets and schemas

Both worksheet names and Google `sheetId` values were verified against the configured read-only source. The spreadsheet ID is `1axzlqa-0nga1nnLSOZ1HQpjFZzx1kUlQ-KrqJgblw-s`.

| Worksheet | Google `sheetId` | Source records returned | Parsed records / sections |
|---|---:|---:|---|
| Entries | `1019432778` | 302 | 11 machine-populated entries: 10 dated and 1 incomplete/undated |
| Manpower Summary | `1841059416` | 47 nonempty grid rows | 9 work-center rows and 31 machine rows |

The live `Entries` schema matched all expected 32 fields:

`Date`; `Shift`; `Shift Duration (min)`; `Source`; `Work Center`; `Machine`; `Rated CT (sec)`; `Output Qty`; `Downtime (min)`; `Rejects (Other Ops)`; `Actual CT (sec)`; `Efficiency %`; `Status vs Rated`; `Downtime Category`; `Breakdown Type`; `Downtime Description`; `Planned Shutdown (min)`; `Availability %`; `Performance %`; `Quality %`; `OEE %`; `Planned Manpower`; `Actual Manpower`; `Manpower Shortfall`; `RM Heat Nr`; `Bundle Nr`; `Lot Number`; `Part`; `OP10 Rejects (Forming)`; `OP20 Rejects (Forming)`; `OP30 Rejects (Forming)`; `Total Rejects`.

`Manpower Summary` is a grid with two distinct sections rather than a single table:

- Work-center summary: Work Center, Avg Planned, Avg Actual, Total Shortfall, Shifts Logged.
- Machine summary: Machine, Rated Manpower / Shift, Avg Planned, Avg Actual, Total Shortfall, Shifts Logged.

The parser now rejects a changed Manpower Summary layout if either complete section header is missing.

The 10 dated entries span `2026-09-19` through `2026-09-20`: 9 are Shift 2 and 1 is Shift 1. The separate undated entry is retained and marked incomplete. Manpower formulas reference Entries rows 2–301 (300 rows); all current machine-populated rows were within that range.

## Formula and calculation validation

The Entries sheet has formula coverage for 14 derived fields from rows 2–301: Shift Duration, Work Center, Rated CT, Actual CT, Efficiency, Status vs Rated, Planned Shutdown, Availability, Performance, Quality, OEE, Planned Manpower, Manpower Shortfall, and Total Rejects. The observed formulas and independent comparisons were:

| Field | Verified source definition / comparison |
|---|---|
| Shift Duration | `60 × 11` = 660 minutes |
| Work Center, Rated CT, Planned Manpower | Lookups from Machine Master using machine name |
| Actual CT | `MAX((shift duration − downtime − planned shutdown) × 60, 0) ÷ Output Qty`, in seconds per source output unit |
| Efficiency | Rated CT ÷ Actual CT; compared as a fraction rendered as percent |
| Status vs Rated | “Slower than rated” when Actual CT exceeds Rated CT; otherwise “On / under rated” |
| Availability | (shift duration − planned shutdown − downtime) ÷ (shift duration − planned shutdown) |
| Performance | Output Qty × Rated CT ÷ runtime seconds after downtime and planned shutdown |
| Quality | (Output Qty − Total Rejects) ÷ Output Qty |
| OEE | Availability × Performance × Quality |
| Manpower Shortfall | Planned Manpower − Actual Manpower |
| Total Rejects | OP10 + OP20 + OP30 for Forming; Rejects (Other Ops) otherwise |

Live calculated values matched independently for dated entries: Efficiency **10/10**, Status vs Rated **10/10**, Quality **10/10**, OEE **10/10**, and Total Rejects **10/10**. Actual CT, Availability, and Performance each matched **1/1** where all required numeric operands were available. Manpower Shortfall matched **2/2** where actual staffing was recorded. Missing formula inputs remain unverified rather than being replaced by zero.

The Manpower Summary contains 222 formulas: 36 across 9 work-center rows and 186 across 31 machine rows. They reference Entries rows 2–301. Recalculation from Entries matched **9/9 work-center rows** and **31/31 machine rows**; rated manpower matched Machine Master with **0 mismatches**. “Shifts Logged” counts rows with nonblank Actual Manpower, not all dated entries. Only 2 dated entries currently contain actual manpower.

## Relationships, units, and data-quality limits

- All **11/11** machine-populated Entries matched Machine Master using the exact `(Work Center, Machine)` relationship.
- Of 11 Entries, **10** have incomplete heat/lot identifiers. The sole complete pair (`H-2409-118`, `LOT-20260920-DB-01`) has no matching reference record. No heat/lot drill-down is presented as matched.
- Output Qty has no explicit unit in its source header; the UI and report do not label it as pieces or another inferred unit. Rejects are source counts. Downtime and planned shutdown are in minutes; cycle times are in seconds. Manpower figures represent source headcount per machine/shift, not unique people.
- Current known-value totals over the 11 parsed entries: Output Qty **18,260** (10 known, 1 missing); Downtime **0 min** (1 known, 10 missing); Total Rejects **101** (10 known, 1 missing); Planned Manpower **26.5** (11 known); Actual Manpower **4** (2 known); Manpower Shortfall **3** (2 known, 9 missing). These are known-value totals, with missing counts displayed; they do not imply missing values are zero.
- Entries' blank formula outputs and missing manual values remain missing. No weighted OEE or per-person productivity is calculated. Rated manpower is a planning value, not measured staffing.
- The existing Downtime Log has 3,600 formula-mirrored cells referring to Entries rows 2–301 and mapped to destination rows 14,569–14,868. Those mirrors were not added to or counted as additional downtime events.
- No source discrepancies were silently corrected. The Manpower Summary formula ranges and the Entries formula ranges cover through row 301; this is adequate for the currently populated machine entries, but future rows beyond that range would require source formula-range review.

## Files and interfaces

Phase 5 implementation files:

- Backend parser, calculations, data validation, filters, and reconciliation: [line_tracker_shift_manpower_service.py](./backend/app/services/line_tracker_shift_manpower_service.py)
- Authenticated endpoints: [line_tracker.py](./backend/app/api/routes/line_tracker.py)
- Backend service and API tests: [test_line_tracker_shift_manpower_service.py](./backend/tests/test_line_tracker_shift_manpower_service.py)
- Dedicated frontend pages and UI states: [ShiftManpowerAnalyticsPage.tsx](./frontend/src/components/lineTracker/ShiftManpowerAnalyticsPage.tsx)
- Typed requests and response types: [lineTrackerWorksheetsApi.ts](./frontend/src/services/lineTrackerWorksheetsApi.ts)
- Frontend API and route tests: [lineTrackerWorksheetsApi.test.ts](./frontend/src/services/lineTrackerWorksheetsApi.test.ts), [lineTrackerWorksheetRoutes.test.ts](./frontend/src/services/lineTrackerWorksheetRoutes.test.ts)
- Existing worksheet dispatch integration: [ManufacturingDashboard.tsx](./frontend/src/pages/ManufacturingDashboard.tsx)
- Responsive styles: [line-tracker-shift-manpower.css](./frontend/src/styles/line-tracker-shift-manpower.css)

Routes use the existing keys:

- `#/line-tracker/worksheet/entries`
- `#/line-tracker/worksheet/manpower-summary`

The API does not accept a client-supplied spreadsheet ID; worksheet selection remains server-side.

## Tests and checks

| Check | Command / scope | Result |
|---|---|---|
| Phase 1–5 backend regression | `LINE_TRACKER_SOURCE=local_excel python -m pytest` for the Phase 5, Phase 4, Phase 3, Phase 2, Phase 1 worksheet, and original Line Tracker service suites | **97 passed** |
| Phase 5 backend coverage | Included in the regression above; service, schema, formula, joins, filters, pagination, authorization, source-error, stale, and empty-data cases | **9 passed** |
| Frontend suite | `npm run test -- --run` | **117 passed, 9 test files** |
| Focused frontend worksheet API/routes | `vitest run src/services/lineTrackerWorksheetsApi.test.ts src/services/lineTrackerWorksheetRoutes.test.ts` | **16 passed, 2 test files** |
| TypeScript | `npm run typecheck` | **Passed** |
| Frontend lint | `npm run lint` | **Passed with existing warnings**: unused variables and React hook dependency warnings in existing scripts/components |
| Production frontend build | `npm run build` | **Passed**; Vite emitted the existing >500 kB chunk advisory |
| Backend lint/format | Ruff check and format check for Phase 5 service and tests | **Passed** |
| Whitespace | `git diff --check` | **Passed**; Git reported only existing line-ending warnings |

The initial broad backend command without a source selector had **95 passed and 2 failed** because two legacy tests require `local_excel`. The documented local-development source selector was set for the regression rerun; all **97 passed**. No production configuration was changed.

## Manual browser verification still required

An authenticated walkthrough was not performed. No credentials were requested, entered, changed, or bypassed. Verify after signing in through the normal authorized process:

1. Open the existing dashboard and expand the ERC Mk-V Line Tracker sidebar group. Confirm Entries and Manpower Summary appear once and existing navigation remains intact.
2. Open both pages through the sidebar and direct hash routes. Test browser back/forward and refresh.
3. On Entries, exercise search, date range, shift, work-center, machine, part, source, downtime category, breakdown type, status, sorting, and pagination. Check missing fields, formula match/mismatch labels, verified/unmatched relationship indicators, and all metric units/definitions.
4. On Manpower Summary, switch between machine and work-center levels; verify they remain separate and that “Shifts Logged” is described as actual-manpower observations.
5. Exercise source refresh and verify fresh, stale, error, and empty states where safely reproducible.
6. Verify Phase 1 worksheet pages, Phase 2 order pages, Phase 3 heat/lot pages, Phase 4 asset pages, the existing Line Tracker, and Downtime Log still work.
7. Repeat at desktop and mobile viewport sizes.

## Final status

**PARTIAL** — Phase 5 implementation, read-only live-source/formula checks, automated backend/frontend regressions, typecheck, lint, and production build are complete. Authenticated browser verification remains for review.
