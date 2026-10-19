# ERC Mk-V Dashboard — Phase 1 Report

## Scope delivered

Phase 1 adds a read-only foundation for browsing the 17 audited ERC Mk-V Google Sheets tabs. It does not alter authentication, write to the spreadsheet, replace the existing Line Tracker, or add derived production KPIs.

- Added authenticated catalog and worksheet-data endpoints under `/api/v1/line-tracker/worksheets`, using the existing `dashboard:READ` dependency.
- Added a manifest of the 17 expected tabs and stable keys. Live tab IDs and availability are discovered from Google Sheets metadata; arbitrary spreadsheet IDs are not accepted from the frontend.
- Added per-worksheet caching, bounded page size (maximum 200), server-side search, source row numbers, stale-cache signaling, explicit upstream errors, and header validation warnings.
- Added raw-grid display for multi-section/dashboard layouts (`Production Dashboard`, `Dashboard`, `Summary`, `Downtime Analysis`, and `Manpower Summary`) so independent blocks are not misrepresented as one normalized table.
- Added grouped sidebar links for all expected worksheets, nested hash routes, and one searchable/paginated page with read-only source/freshness status, refresh, loading, error, empty, stale, and validation-warning states.
- Preserved the existing `#/line-tracker` page and its Downtime Log functionality.

## Live read-only validation

Using the configured service-account read-only access, the new worksheet service fetched page data for all 17 catalog entries. The following are generic source-row counts after the adapter's header/blank-row rules; they are not normalized business-record or KPI counts. In particular, the raw Downtime Log page includes source rows that the existing Line Tracker parser may separately suppress as formula mirrors.

| Worksheet | Live Google `sheetId` | Display rows | Columns surfaced |
|---|---:|---:|---:|
| Production Order | 1832059257 | 8 | 11 |
| Copy of Production Order | 827106177 | 8 | 11 |
| Order Plan (Monthly) | 443868223 | 15 | 22 |
| RM Heat Plan vs Actual | 217356585 | 52 | 17 |
| Heat & Lot Number Reference | 1881319427 | 79 | 6 |
| Machine Consumables | 1208025434 | 33 | 8 |
| Machine Master | 1022871279 | 33 | 13 |
| Capacity Change Log | 1408359762 | 1 | 6 |
| Entries | 1019432778 | 302 | 32 |
| Planned Shutdowns | 1171824600 | 3 | 7 |
| Manpower Summary | 1841059416 | 47 | 7 |
| Production Dashboard | 1905823832 | 77 | 10 |
| Dashboard | 1047718776 | 35 | 6 |
| Summary | 311599185 | 45 | 8 |
| Downtime Log | 1490231673 | 14568 | 15 |
| Downtime Analysis | 1296123007 | 85 | 9 |
| OEE & Reliability | 1752221202 | 49 | 6 |

The mixed-layout sheets expose additional occupied cells beyond their principal table headers. Their grid counts include populated title, note, and header rows, and therefore should not be compared directly with table-only row counts. Phase 1 reports blank header positions and uses spreadsheet column labels rather than discarding those cells.

## Validation results

| Check | Result |
|---|---|
| Backend worksheet and existing Line Tracker regressions | **50 passed** (`test_line_tracker_worksheets.py` and `test_line_tracker_service.py`) |
| Frontend focused worksheet/API regression tests | **18 passed** across the worksheet API client and existing Line Tracker API client test files |
| Frontend TypeScript check | **Passed** (`npm run typecheck`) |
| Frontend production build | **Passed** (`npm run build`) |
| Frontend lint | **Passed** (`npm run lint`); existing warnings remain in `ManufacturingDashboard.tsx`, `TargetActualChart.tsx`, and two debug scripts |
| Live worksheet service | **17/17 tabs returned page data** with the expected live IDs |
| Patch whitespace check | **Passed** (`git diff --check`) |

The Line Tracker regression suite expects the local Excel source. Its passing run used a process-only `LINE_TRACKER_SOURCE=local_excel` override; the repository `.env` was not edited. An initial unoverridden run had two expected-source assertions fail because the configured runtime source is Google Sheets.

After the final mixed-layout change, the focused worksheet backend suite was rerun independently (**7 passed**) and the live 17-tab read was repeated. The 50-test combined Line Tracker regression run passed immediately before that layout-only change.

## Not completed / review gate

- A signed-in browser walkthrough of the sidebar and worksheet pages could not be performed: the available local browser was at the sign-in page. No password, auth state, or credentials were changed or requested. TypeScript, production build, API tests, and live backend reads passed, but visual and interactive navigation still need authenticated verification.
- The production bundle reports the existing large-chunk advisory (>500 kB); build succeeds.
- Phase 1 displays source grids only. Specialized, audited metrics and visualizations remain in later phases and must not be inferred from this generic view.

No spreadsheet writes, commits, pushes, or deployments were performed. Phase 2 has not started; review and approval are required before continuing.
