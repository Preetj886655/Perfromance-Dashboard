# ERC Mk-V Dashboard — Phase 4 Report

**Scope:** Machine Master, Machine Consumables, Capacity Change Log, and Planned Shutdowns  
**Live-source validation:** Read-only refresh during this review  
**Status:** **PARTIAL** — implementation, live-source checks, and automated validation pass; authenticated browser walkthrough remains unavailable.

## Delivered

- Added dedicated analytical views on the existing worksheet routes for Machine Master, Machine Consumables, Capacity Change Log, and Planned Shutdowns.
- Added the authenticated API endpoints:
  - `GET /api/v1/line-tracker/assets/machine-master`
  - `GET /api/v1/line-tracker/assets/machine-consumables`
  - `GET /api/v1/line-tracker/assets/capacity-change-log`
  - `GET /api/v1/line-tracker/assets/planned-shutdowns`
- Reused the existing allowlisted worksheet service, source freshness/stale/error metadata, refresh path, and `dashboard:READ` authorization. Sheet selection is server-side; a client cannot submit an arbitrary spreadsheet ID.
- Reused the existing worksheet navigation keys and nested route format:
  - `#/line-tracker/worksheet/machine-master`
  - `#/line-tracker/worksheet/machine-consumables`
  - `#/line-tracker/worksheet/capacity-change-log`
  - `#/line-tracker/worksheet/planned-shutdowns`
- Added search, source-backed filters, sorting, pagination, raw-source disclosure, and related-machine/consumable links where the source relationship is valid.
- Kept example or unverified events separate from confirmed operational history. No example schedule is counted as actual downtime.

## Live worksheets and schemas

All four configured worksheet IDs were checked using fresh, read-only requests. The live sheet IDs and headers matched the Phase 4 implementation's allowlist and expected schema.

| Worksheet | Google `sheetId` | Source rows returned by Phase 4 service | Parsed detail records | Live validation |
|---|---:|---:|---:|---|
| Machine Master | `1022871279` | 33 | 31 | 31 unique machine keys; no duplicate keys |
| Machine Consumables | `1208025434` | 33 | 31 | All 31 records match a unique master machine key |
| Capacity Change Log | `1408359762` | 1 | 1 | One record, classified as an example |
| Planned Shutdowns | `1171824600` | 3 | 1 | One example schedule; two instructional rows excluded from event parsing |

Live headers:

- **Machine Master:** `Work Center`; `Machine`; `Current Rated CT (sec)`; `Status`; `Notes`; `Commissioning Date`; `Manpower Required (Rated) / Shift`; `Decommissioned Date`; `Output`; `Hourly`; `Shift`; `Day`; `85 %`.
- **Machine Consumables:** `Work Center`; `Machine`; `Consumable`; `Category`; `Typical Change Frequency`; `Last Changed Date`; `Next Due Date`; `Notes`.
- **Capacity Change Log:** `Date Changed`; `Work Center`; `Machine`; `Old Rated CT (sec)`; `New Rated CT (sec)`; `Reason / Notes`.
- **Planned Shutdowns:** `Start Date`; `End Date`; `Scope`; `Scope Detail (Work Center or Machine)`; `Hours Affected / Day`; `Reason`; `Notes`.

The source-row counts include instructional/context rows where present. Parsed detail counts do not treat those instructions as machine or event records.

## Relationships, formulas, and units

### Machine Master

- The exact candidate relationship is `(Work Center, Machine)`, normalized only by trimming surrounding whitespace and case-folding. Punctuation is retained.
- All 31 live machine keys are unique. The source status values are 29 `Active` and 2 `De-Comissioned`; status text is preserved, not treated as proof of current availability.
- Rated cycle time is confirmed in seconds by the live header. Two machine records have no usable positive cycle time and are marked incomplete rather than assigned a zero capacity.
- The live Google formulas were read alongside their calculated values. Each of the five capacity columns contains 31 formulas. The formula chain is:
  - `Output = 60 / Current Rated CT (sec)`
  - `Hourly = Output × 60`
  - `Shift = Hourly × 11`
  - `Day = Shift × 2`
  - `85 % = Day × 0.85`
- Independently calculated values matched all five live calculated capacity fields for the 29 machines with positive cycle time: **145/145 matches, 0 mismatches**. The remaining 10 capacity cells for the two incomplete records are not presented as zero capacity.
- The two live cycle-time mirror formulas (`=C20` and `=C21`) both evaluate to `5.5`, matching their referenced cells.
- Capacity is labeled as formula-derived cycle rates (cycles/minute, cycles/hour, cycles/shift, and cycles/day). The source does not define a finished-piece unit, so no piece-count interpretation is asserted. The 11-hour shift, two shifts/day, and 85% factor are visible formula assumptions; 85% is not an availability measurement. Rated manpower is identified as an assumed starting point from source instructions, not measured staffing.

### Machine Consumables

- All 31 records match a unique Machine Master `(Work Center, Machine)` key. This is a one-to-many-capable relationship; consumable rows are not treated as machine-key-unique.
- All 31 `Last Changed Date` and all 31 `Next Due Date` values are blank. Qualitative change-frequency text is preserved; missing dates are not converted into due dates or stock alerts.
- The worksheet is presented as a reference list, not an inventory or stock ledger. No stock balance, reorder quantity, or availability KPI is derived.

### Capacity Change Log

- The single live row is explicitly an **example** and matches a unique Machine Master key.
- Old and new cycle-time fields use seconds and are comparable as source values. No operational capacity trend or confirmed machine change is claimed; the example row does not generate a percentage-change KPI.

### Planned Shutdowns

- The one parsed live schedule is explicitly an **example**, dated `2026-01-26`, with scope `All Machines`, a valid single-day range, and 24 hours affected per day.
- It has no machine-specific scope detail. No individual machine impact is inferred, and no estimated example hours are displayed as actual or confirmed downtime.
- No overlaps were found in the parsed schedule records. Example hours are not aggregated with actual downtime.

## Files changed for Phase 4

- Backend parsing, relationships, formulas, event classification, filters, pagination, and response metadata: [line_tracker_machine_assets_service.py](./backend/app/services/line_tracker_machine_assets_service.py)
- Four authenticated endpoints added to the shared router: [line_tracker.py](./backend/app/api/routes/line_tracker.py)
- Backend parser/API regression coverage: [test_line_tracker_machine_assets_service.py](./backend/tests/test_line_tracker_machine_assets_service.py)
- Typed frontend API requests and responses: [lineTrackerWorksheetsApi.ts](./frontend/src/services/lineTrackerWorksheetsApi.ts)
- Frontend API tests: [lineTrackerWorksheetsApi.test.ts](./frontend/src/services/lineTrackerWorksheetsApi.test.ts)
- Worksheet route tests: [lineTrackerWorksheetRoutes.test.ts](./frontend/src/services/lineTrackerWorksheetRoutes.test.ts)
- Dedicated page and shared status/navigation/source components: [MachineAssetsPage.tsx](./frontend/src/components/lineTracker/MachineAssetsPage.tsx), [MachineAssetShared.tsx](./frontend/src/components/lineTracker/MachineAssetShared.tsx)
- Existing worksheet dispatch integration: [ManufacturingDashboard.tsx](./frontend/src/pages/ManufacturingDashboard.tsx)
- Shared raw-value formatting: [rawMaterialFormatting.ts](./frontend/src/components/lineTracker/rawMaterialFormatting.ts)
- Responsive Phase 4 styles: [line-tracker-machine-assets.css](./frontend/src/styles/line-tracker-machine-assets.css)

The worktree already contained substantial modifications and untracked Phase 1–3 files before Phase 4. They were preserved; no unrelated files were reverted.

## Tests and checks

| Check | Command / scope | Result |
|---|---|---|
| Backend Phase 1–4 and Line Tracker regression | `python -m pytest tests/test_line_tracker_machine_assets_service.py tests/test_line_tracker_worksheets.py tests/test_line_tracker_rm_heat_service.py tests/test_line_tracker_order_analytics.py tests/test_line_tracker_service.py` with process-local `LINE_TRACKER_SOURCE=local_excel` for legacy source assertions | **88 passed** |
| Frontend tests | `npm test` | **114 passed across 9 files** |
| TypeScript | `npm run typecheck` | **Passed** |
| Frontend lint | `npm run lint` | **Passed with warnings** in existing scripts and dashboard hooks |
| Production build | `npm run build` | **Passed**; Vite reported the existing large-bundle advisory (>500 kB) |
| Focused backend Ruff | `ruff check` on Phase 4 service and tests; `ruff format --check` on those files | **Passed** |
| Shared router import order | `ruff check --select I app/api/routes/line_tracker.py` | **Passed** |
| Shared router full Ruff check | `ruff check` including `line_tracker.py` | **Four E501 long-docstring findings** at existing lines 428, 458, 493, and 556, outside the Phase 4 endpoint additions; left unchanged as unrelated |
| Whitespace | `git diff --check` | **Passed** for tracked changes |
| Live read-only source/formula check | Refreshed all four sheets and read Machine Master formulas with `FORMULA` plus calculated values | **Passed**; IDs, schemas, and reported counts above matched; all 145 comparable capacity values matched |

## Unresolved items and manual browser verification

The existing local dashboard browser page at `http://localhost:5173/` is available but is signed out and shows the Sign in page. No credentials were requested, entered, changed, or bypassed. Therefore, an authenticated UI walkthrough and visual desktop/mobile acceptance could not be completed.

After signing in through the normal authorized process, manually verify:

1. Open the existing dashboard and expand the **ERC Mk-V Line Tracker** sidebar group. Confirm there are no duplicate worksheet links.
2. Open all four Phase 4 pages through the sidebar and directly through their hash routes. Verify browser back/forward navigation.
3. On Machine Master, exercise search, work-center/status filters, sorting, pagination, detail disclosure, capacity labels, and the link to matching consumables. Confirm source status/freshness, refresh, stale, error, and empty-state behavior.
4. On Machine Consumables, exercise search/filter/sort/pagination and the link back to the matching machine. Confirm missing dates remain missing and no stock/reorder alert is implied.
5. On Capacity Change Log, confirm the live example is visibly labeled as an example and is not presented as confirmed operational history.
6. On Planned Shutdowns, confirm the example warning, `All Machines` scope, and schedule-vs-actual distinction. Confirm no machine-specific impact or actual downtime is shown.
7. Verify the existing Line Tracker, Downtime Log, Phase 1 worksheet pages, Phase 2 order pages, and Phase 3 heat/lot pages remain functional.
8. Repeat the route, table, and navigation checks at desktop and mobile viewport sizes.

No verified Phase 4 data defect was found in the automated or live read-only checks. Final acceptance remains partial until the authorized browser walkthrough is performed.

## Final status

**PARTIAL** — Phase 4 implementation, live worksheet/formula validation, backend/frontend automated tests, typecheck, lint exit status, and production build are complete. Authenticated browser verification remains outstanding.
