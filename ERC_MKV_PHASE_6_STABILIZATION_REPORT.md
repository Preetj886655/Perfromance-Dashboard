# ERC Mk-V Dashboard — Phase 6 Stabilization Report

**Scope:** Phase 6 stabilization and verification only  
**Status:** **STABILIZED — automated checks pass; authenticated browser walkthrough remains blocked**

## Working tree and safety

At the start of this stabilization, `git status --short` showed existing modifications to eight tracked files and numerous untracked reports, Phase 1–6 implementation files, test files, and local artifacts. Those pre-existing changes were preserved. No reset, cleanup, credential access, production configuration change, Google Sheets write, commit, or deployment was performed.

The stabilization edits are limited to:

- `backend/tests/test_dpr_oee_ingestion.py` — seed the documented canonical A–J rejection catalog transactionally in the rollback-only test fixture.
- `backend/tests/test_final_clip_production.py` — use the existing deterministic chat source fixture instead of depending on live records for a fixed date window.
- `backend/app/services/line_tracker_dashboard_service.py` — expose periods where the Summary formula returns zero despite all dated duration values being missing.
- `backend/tests/test_line_tracker_dashboard_service.py` — cover missing, zero, and nonzero downtime and the Summary discrepancy warning data.
- `frontend/src/services/lineTrackerWorksheetsApi.ts` — type the new source-data-quality field.
- `frontend/src/components/lineTracker/DashboardAnalyticsPage.tsx` — display a clear discrepancy warning.
- `ERC_MKV_PHASE_6_STABILIZATION_REPORT.md` — this report.

The read-only worksheet integration continues to use the `spreadsheets.readonly` scope. Phase 6 endpoints remain behind the existing authenticated `dashboard:READ` access dependency and reference fixed server-side worksheet keys/IDs.

## Reproduction and classification of the 59 reported failures

The documented command was reproduced:

```powershell
$env:LINE_TRACKER_SOURCE='local_excel'
python -m pytest backend/tests -q --tb=short
```

The initial reproduced result was **477 passed, 59 failed, 7 skipped**. Inspection of each failure showed two distinct test-setup issues:

| Failure category | Count and affected tests | Root cause and resolution |
|---|---|---|
| Missing transactional catalog fixture | **58 failures**: `test_dpr_oee_api.py` (9), `test_dpr_oee_csv_api.py` (9), `test_dpr_oee_csv_ingestion.py` (10), `test_dpr_oee_ingestion.py` (8), `test_import_worker.py` (11), `test_oee_e2e_uat.py` (8), and `test_sse_integration.py` (3) | All stopped at `_ensure_rejection_reasons()` asserting that canonical rejection reasons A–J were already installed in the test database. The migration intentionally creates the schema without seed rows. The helper now adds only absent entries from the repository’s documented `EXCEL_REJECTION_REASONS` catalog in the test’s existing rollback-only transaction. No production seed or business logic was changed. |
| Fixed-window test depended on live production rows | **1 failure**: `test_final_clip_production.py::TestChatbotFinalClipProductionResponses::test_kpi_summary_response_uses_final_clip_production_label` | The test expected a production answer for October 1–15, but the selected local source had no matching records; the API correctly returned “No Matching Production Records.” Its client fixture did not install the deterministic source fixture already used by other chat tests. The test now installs `install_mock_chat_sources`, making the behavior deterministic without changing application logic. |

The 58 catalog failures and the date-dependent chat test were test initialization/data-fixture problems, not Phase 6 production regressions. The focused fixtures use documented canonical test data and roll back the database transaction.

During iteration, a new Phase 6 reconciliation test also initially expected two monthly mismatches where the implementation correctly counted only the two approximate-availability differences in the live case. The test expectation was corrected: source zero compared with unavailable downtime is not reported as a numeric mismatch, while source 100% approximate availability compared with unavailable input is a mismatch.

## Summary discrepancy investigation

The Summary source formula rows and their referenced ranges were fetched read-only with formula rendering enabled:

- **2024-12, Summary row 9:** downtime formula is `=SUMIFS('Downtime Log'!$J$2:$J$14870,'Downtime Log'!$A$2:$A$14870,">="&DATE(2024,12,1),'Downtime Log'!$A$2:$A$14870,"<="&DATE(2024,12,31))/60`. Approximate availability is `=IFERROR(1-(B9/(31*24*27)),"")`.
- **2025-08, Summary row 17:** downtime formula is `=SUMIFS('Downtime Log'!$J$2:$J$14870,'Downtime Log'!$A$2:$A$14870,">="&DATE(2025,8,1),'Downtime Log'!$A$2:$A$14870,"<="&DATE(2025,8,31))/60`. Approximate availability is `=IFERROR(1-(B17/(31*24*27)),"")`.

Both formulas use Downtime Log date column A and duration-minutes column J, over rows 2–14,870. `SUMIFS` returns zero when the dated records have no numeric duration values, and the source availability formula consequently returns 1 (100%). The live data has:

| Period | Dated Downtime Log records | Known durations | Missing durations | Recomputed downtime | Recomputed approximate availability |
|---|---:|---:|---:|---:|---:|
| 2024-12 | 262 | 0 | 262 | unavailable (`null`) | unavailable (`null`) |
| 2025-08 | 56 | 0 | 56 | unavailable (`null`) | unavailable (`null`) |

The parser converts duration values with `_number`; blanks remain `None`. `_known_total` returns `None` if there are no known durations, and approximate availability is only calculated when downtime is known. Thus a missing duration does not become zero, and unavailable input does not become 100% availability.

The Summary response now includes `data_quality.formula_zero_missing_downtime_periods`. The page displays a warning naming affected periods and explicitly says that downtime and Approx. Availability are unavailable, not zero or 100%. The metric remains labeled **Approx. Availability**, not OEE availability.

Automated coverage now distinguishes:

- Missing downtime: total and approximate availability remain `None`.
- Explicit zero downtime: total is `0`, approximate availability is `1`.
- Nonzero downtime: minutes convert to hours and approximate availability is calculated from the source definition.
- Source formula zero with all matching durations missing: warning period is surfaced, and no 100% availability is shown.

No source worksheet values or formulas were altered.

## Worksheet access and Phase 1–6 regression

A live read-only catalog refresh returned **17/17 allowlisted original worksheets** and their live IDs. The `/worksheets/{worksheet_key}` endpoint resolves only keys from the fixed `WORKSHEETS` catalog and returns 404 for unknown keys; the frontend does not submit arbitrary spreadsheet IDs. The existing Line Tracker regression tests cover worksheet routes and the Phase 1–5 analytics modules.

The Phase 6 service continues excluding the 300-row Downtime Log Entries mirror range (rows 14,569–14,868) from historical aggregates. Missing values remain distinct from zero; capacity remains labeled theoretical, and approximate availability is not called OEE.

## Validation commands and actual results

| Command/check | Result |
|---|---|
| Initial reproduction: `$env:LINE_TRACKER_SOURCE='local_excel'; python -m pytest backend/tests -q --tb=short` | **477 passed, 59 failed, 7 skipped** before fixture repairs; failures classified above. |
| `python -m pytest backend/tests/test_final_clip_production.py backend/tests/test_line_tracker_dashboard_service.py -q --tb=short` | **20 passed** after deterministic chat fixture and Phase 6 discrepancy test correction. |
| Phase 1–6 Line Tracker modules: `python -m pytest backend/tests/test_line_tracker_worksheets.py backend/tests/test_line_tracker_order_analytics.py backend/tests/test_line_tracker_rm_heat_service.py backend/tests/test_line_tracker_machine_assets_service.py backend/tests/test_line_tracker_shift_manpower_service.py backend/tests/test_line_tracker_dashboard_service.py -q` | **64 passed**. |
| Final full backend suite: `$env:LINE_TRACKER_SOURCE='local_excel'; python -m pytest backend/tests -q --tb=short` | **539 passed, 7 skipped**. |
| Frontend: `npm test -- --run` (from `frontend`) | **120 passed** across 9 test files. |
| Frontend: `npm run typecheck` | Passed. |
| Frontend: `npm run lint` | Passed with 6 warnings, all in pre-existing dashboard/script code (unused variables and hook dependency warnings). |
| Frontend: `npm run build` | Passed. Vite reports the existing large JavaScript chunk advisory (2,371.74 kB minified). |
| Ruff import check and format check on stabilization Python files | Passed. |
| `git diff --check` | Passed; only existing working-copy LF-to-CRLF notices were printed. |
| Live read-only Summary refresh | ID `311599185`; warnings list `2024-12` and `2025-08`; monthly reconciliation **143 values checked, 2 mismatches**. |
| Live read-only worksheet catalog refresh | **17 worksheets** returned, including all three Phase 6 sheets and their expected IDs. |

The full suite’s **7 skips** are reported, not counted as passes. No test is represented as successful unless it ran and passed.

## Browser verification

The shared development browser was read without interacting with sign-in. It showed the existing application’s **Sign in** page and two unauthorized resource responses. No credentials were requested or entered, and authentication was not bypassed. Consequently, no authenticated Phase 6 or Phase 1–5 UI walkthrough is claimed.

When an already-authorized development session is available, verify:

1. Existing dashboard and the ERC Mk-V Line Tracker sidebar group; open Production Dashboard, Dashboard, and Summary through their existing entries.
2. Production date range, Stage, and Machine filters; source refresh/freshness and missing-date display.
3. Capacity values and theoretical bottleneck labels; ensure theoretical outputs are not read as actual production.
4. Summary monthly/yearly switching and date filters; verify the 2024-12 and 2025-08 warnings and `—`/unavailable values for downtime and Approx. Availability.
5. Loading, empty, stale, and error presentation where safely reproducible.
6. Browser back/forward, direct hash-route loading, and unchanged Phase 1–5 pages including the original Line Tracker and Downtime Log.
7. Desktop and mobile responsive layouts.

## Remaining risks and recommendation

- **Browser/manual action required:** authenticated visual walkthrough remains unverified.
- **Known source semantics:** the two Summary formulas report zero/100% when duration inputs are all blank; the UI now flags those periods and preserves unavailable values.
- **Build advisory:** frontend bundle remains above Vite’s 500 kB advisory threshold.

**Recommendation:** Phase 6 stabilization is complete from the automated and read-only data-validation standpoint. Approve only after the authenticated manual browser checks above if visual sign-off is required. No Phase 7 work was started.
