# Google Sheets Live Source — Local Activation & Validation Report

**Scope:** Prove the ERC Mk-V Line Tracker backend serves data from the live Google Sheet (not a silent local-Excel fallback) in the local development environment, and that it fails safely. Read-only w.r.t. Google Sheets, production data, permissions, and deployed configuration. No commit/push/merge/branch-switch/deploy performed.

## 1. Source of truth — verified
- **Spreadsheet ID (config):** `1axzlqa-0nga1nnLSOZ1HQpjFZzx1kUlQ-KrqJgblw-s` (lowercase **l** in `kUlQ`; this is the real sheet — the previous `kUIQ`/capital-I id returned 404 and was a copy typo, since corrected in `config.py`).
- **Spreadsheet title (returned by Google):** `ERC_MkV_Line_Tracker R0_10102026`
- **Worksheets accessible:** **17** (all expected tabs, in order — see §6).
- **Service account (client_email, no secrets):** `manufacturing-dashboard@patil-manufacturing-dashboard.iam.gserviceaccount.com` (matches expected).

## 2. Method note (important)
The service account has **Google Sheets read access but NOT Google Drive export access** — the initial Drive `files().export`/`get` returned **403**, while the Sheets API `spreadsheets().get`/`values().batchGet` succeeds with the granted `spreadsheets.readonly` scope. The integration therefore reads the sheet with the **Sheets `values()` API**, reconstructs an in-memory `openpyxl` workbook (dates via `dateTimeRenderOption=FORMATTED_STRING`, numbers via `valueRenderOption=UNFORMATTED_VALUE`), and feeds the **unchanged existing parser** — so live values are identical to the parsed Excel.

## 3. Code changes (local only; not committed/deployed)
- `backend/app/core/config.py` — corrected `line_tracker_spreadsheet_id` to the real id; added `line_tracker_source: str = "local_excel"` (options: `local_excel` | `google_sheets`).
- `backend/app/services/line_tracker_service.py` — added `fetch_google_sheets_workbook()` (Sheets values API → in-memory workbook); refactored `parse_line_tracker_workbook(file_path=None, workbook=None, source_meta=None)` to accept an in-memory workbook; rewired `get_line_tracker_dataset()` to select the source, re-parsing from the live sheet when `LINE_TRACKER_SOURCE=google_sheets`, and to fall back to the local Excel with a clear warning otherwise. Removed the earlier Drive-export helper (403 here).
- **Activation is local-env only.** Validation ran with the process env var `LINE_TRACKER_SOURCE=google_sheets`. The **default remains `local_excel`**, production `.env`/deployment were not changed, and the local `.xlsx` fallback is preserved.

## 4. Endpoints tested (real routes from `backend/app/api/routes/line_tracker.py`)
Called via the project's FastAPI `TestClient(app)` harness (auth dependency overridden as the existing tests do), with `LINE_TRACKER_SOURCE=google_sheets`:

| Method | Endpoint | Result |
|---|---|---|
| GET | `/api/v1/line-tracker/status?refresh=true` | 200, `source_type = google_sheets` |
| GET | `/api/v1/line-tracker/summary?refresh=true` | 200, `source_type = google_sheets`, notice "Live Google Sheets source (read-only service account)." |
| GET | `/api/v1/line-tracker/reliability/pareto?refresh=true` | 200, records = 14,567 (live) |
| GET | `/api/v1/line-tracker/orders?refresh=true` | 200, 6 orders, PO-2026-001 present |
| GET | `/api/v1/line-tracker/oee/breakdown?refresh=true` | 200, OEE overall computed |

**Actual source type returned by the backend: `google_sheets`** (verified at `/status` and `/summary`; notice confirms live Google Sheets, read-only service account).

## 5. Sample data comparison (live sheet ⇄ backend endpoint)
A direct read-only Sheets read (Section A of the probe) was compared to the values returned through the backend (which reconstructs the workbook from the same sheet):

| Field | Direct Sheets read | Backend endpoint | Match |
|---|---|---|---|
| Spo title | `ERC_MkV_Line_Tracker R0_10102026` | same title via `source_notice`/meta | ✔ |
| Worksheet count | 17 | 17 parsed | ✔ |
| PO-2026-001 `Order Qty` | `607785` | `607785.0` (`/orders`) | ✔ |
| PO-2026-001 `Customer` | `WR` | `WR` | ✔ |
| PO-2026-001 `DP Date` | (serial `46315`) | `2026-10-20` (parsed) | ✔ |
| Production Order headers | `PO Date, Order Nr, Customer, Order Qty, Part, DP Date, Assigned RM Heat Nr, Subsequent Lot Nr, Status, Notes, RM Requirement in MT` | parsed into order records incl. `assigned_heat`, `rm_requirement_mt` | ✔ |
| Downtime Log header | `Date, Line, Shift, Part, Stage, Machine, Downtime Type (raw), Downtime Category, Breakdown Type, Downtime Mins, …` | full column mapping | ✔ |

Date serials returned by raw `values()` (e.g., `46282`, `45535`) are converted correctly because the backend requests `FORMATTED_STRING` dates; parsing of dates/minutes is confirmed by the exact aggregates in §7.

## 6. Worksheet mapping / required columns
All **17** expected worksheets are present **and in order** in the live source and survive reconstruction: Production Order, Copy of Production Order, Order Plan (Monthly), RM Heat Plan vs Actual, Heat & Lot Number Reference, Machine Consumables, Machine Master, Capacity Change Log, Entries, Planned Shutdowns, Manpower Summary, Production Dashboard, Dashboard, Summary, Downtime Log, Downtime Analysis, OEE & Reliability. No Excel substitution occurred — backing data came from the Google-reconstructed workbook (approx. 166,046 cells across 17 tabs).

## 7. Historical downtime reconciliation (from the live Google Sheet)
Values computed by the backend from the live sheet match the independently reconciled source figures exactly:

| Metric | Live-sheet (backend) | Verified target | Status |
|---|---|---|---|
| Historical records | 14,567 | 14,567 | PASS |
| Total downtime hours | 36,542.3 | 36,542.3 | PASS |
| Planned hours / % | 3,413.4 / 9.34% | 3,413.4 / 9.34% | PASS |
| Unplanned hours / % | 33,128.9 / 90.66% | 33,128.9 / 90.66% | PASS |
| Breakdown events | 1,482 | 1,482 | PASS |
| Breakdown hours | 5,644.8 | 5,644.8 | PASS |
| Overall MTTR (h) | 3.81 | 3.81 | PASS |
| Overall calendar MTBF (h) | 12.1 | ≈12.1 | PASS |
| Mirrored rows excluded | 302 | 302 | PASS |
| Live shift entries | 10 (2026-09-19/20), downtime 0 | 10 | PASS |
| Live OEE | 37.96% (Perf 38.17 / Qual 99.45 / Avail 100) | 37.96% | PASS |

Result: **13/13 checks PASS.**

## 8. Cache / refresh behavior
- `?refresh=true` re-fetches from Google Sheets and re-parses (verified `source_type=google_sheets` + correct aggregates).
- Without `refresh`, a repeat `/status` call returned **cached** data with `source_type=google_sheets` — confirming the in-memory TTL cache serves the Google-sourced dataset rather than re-reading stale Excel.
- Cache TTL defaults to `line_tracker_cache_ttl_seconds` (300s).

## 9. Fallback / error handling (no stale-as-live misrepresentation)
With the Google fetch forced to raise (simulated 403), the backend returned `source_type = local_excel` and surfaced a **`GOOGLE_SHEETS_UNAVAILABLE`** warning describing that the live sheet could not be read and the last downloaded Excel snapshot is shown. It never claims `google_sheets` on failure and never presents Excel data as live. **PASS.**

## 10. Test commands and results
```
# Live-source end-to-end (process-local activation; reads live Google Sheet)
LINE_TRACKER_SOURCE=google_sheets python tmp/gs_live_validate.py
#   -> 13/13 checks PASSED  (source_type google_sheets; aggregates; PO sample; tabs; cache; fallback)

# Backend unit tests (default local Excel source preserved)
cd backend && python -m pytest tests/test_line_tracker_service.py -q
#   -> 40 passed in ~4.6s   (no regressions; local-Excel path unchanged)

# Frontend
cd frontend && npm run typecheck                 # tsc -b  -> clean
cd frontend && npx vitest run src/services/lineTrackerApi.test.ts src/services/chatApi.test.ts
#   -> 2 test files, 14 tests passed
```

## 11. Errors and unresolved issues
- **Google Drive API 403 on export** — resolved by using the Sheets `values()` API instead (Drive scope not granted to this SA). Recorded as a method constraint, not a defect.
- Raw `values()` (no `dateTimeRenderOption`) returns date cells as serial numbers (e.g., `46282`); the backend requests `FORMATTED_STRING` so dates parse correctly. Any future reader using raw `values()` must handle serials.
- `file_size_bytes`/`last_modified` for the Google source are synthesized (in-memory; no file on disk) since the sheet isn't a file — cosmetic only.
- The earlier `kUIQ` (capital I) id returned 404 and was a copy typo; config now uses the verified `kUlQ` id. If that id is ever changed again, re-verify via `spreadsheets.get`.

## 12. Safety / compliance
- Read-only w.r.t. Google Sheets (Sheets read scope only), production database, credentials, permissions, and deployment configuration.
- `LINE_TRACKER_SOURCE=google_sheets` used **only** as a local process env var for validation; production `.env`/deployment untouched. Default remains `local_excel`, preserving the local-Excel fallback (40 backend tests still green).
- No commit / push / merge / branch-switch / deploy.

## 13. Conclusion
**Local validation PASSED.** With `LINE_TRACKER_SOURCE=google_sheets`, the ERC Mk-V backend reads the live Google Sheet (`ERC_MkV_Line_Tracker R0_10102026`, id `1axzlqa-…kUlQ-…`), returns `source_type = google_sheets` from the real endpoints, serves worksheet data identical to the source, reconciles all historical downtime aggregates, honors cache/refresh, and falls back to local Excel with an explicit `GOOGLE_SHEETS_UNAVAILABLE` warning on failure. Activation of the **production** environment is intentionally left to a separate, explicitly approved step.
