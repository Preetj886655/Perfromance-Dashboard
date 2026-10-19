# Downtime Log Google Sheets Integration Report

**Integration status: PASS**  
**Verified:** 2026-10-17

## Verified source

- Spreadsheet ID: 1axzlqa-0nga1nnLSOZ1HQpjFZzx1kUlQ-KrqJgblw-s
- Worksheet: Downtime Log
- Worksheet ID: 1490231673 (verified from Sheets metadata)
- API-reported used range: A1:O14870
- Data rows: **14,568** non-empty rows after the header. The count is based on returned worksheet values, excluding the header and empty rows.
- Date coverage: 2024-08-31 to 2026-09-18

The live worksheet was read with the existing configured service-account authentication and the Sheets API read-only scope. The sheet ID, title, and headers were verified in the API response. No Google write request was made.

## Headers and sanitized row shape

Live headers, in source order:

Date, Line, Shift, Part, Stage, Machine, Downtime Type (raw), Downtime Category, Breakdown Type, Downtime Mins, Prod Loss NOS, Prod Target NOS, Total PROD NOS, Rejection, Description

Sanitized example structure (no operational values):

    {
      "Date": "<date string>",
      "Line": "<string>",
      "Shift": "<string>",
      "Part": "<string>",
      "Stage": "<string>",
      "Machine": "<string>",
      "Downtime Type (raw)": "<string>",
      "Downtime Category": "<string>",
      "Breakdown Type": "<string or blank>",
      "Downtime Mins": "<number or blank>",
      "Prod Loss NOS": "<number or blank>",
      "Prod Target NOS": "<number or blank>",
      "Total PROD NOS": "<number or blank>",
      "Rejection": "<number or blank>",
      "Description": "<string, number, or blank>"
    }

The API returned date values as strings: 14,567 used YYYY-MM-DD; one other parseable text format was present. Numeric production and duration columns returned integer or floating-point values. Description contained both strings and integers.

The sheet contains 300 formula rows (rows 14,569–14,868) and 4,500 formula cells. All 300 formula rows returned blank evaluated values; they did not add records. In total, 301 blank rows were skipped. The actual non-empty source rows were retained.

## Backend and API

- Reused google_sheets_service credential resolution and its Sheets API client path; no credentials were added or logged.
- Added metadata-aware worksheet reading while preserving the existing _fetch_sheet_values return contract.
- Added a cached, read-only parser for the Downtime Log tab. It preserves original source columns in each record and adds normalized fields for the existing reliability calculations.
- Reused the existing authorized Line Tracker reliability endpoints:
  - GET /api/v1/line-tracker/reliability/pareto?source=google_sheets
  - GET /api/v1/line-tracker/reliability/records?source=google_sheets&page=1&page_size=25
- Both endpoints returned HTTP 200 against the live worksheet. The records response was paginated and reported 14,568 total records.
- A failed live read returns a sanitized 503 response. It does not substitute local workbook rows.

The source parameter defaults to the existing local_excel behavior, preserving current API callers.

## Frontend

The existing **Reliability & Downtime Log** subtab now requests the explicit Google Sheets source. It displays the worksheet name, source headers, refresh time, actual records, reliability metrics, and data-quality messages. Loading, empty-sheet, and unavailable-source states are present. Existing category, machine, stage, shift, search, and pagination controls continue to pass their selected filters.

A local browser smoke check used the live API response. It confirmed the worksheet source label, 14,568 record count, source headers, and the verified duration total rendered, with no API failures.

## Source selection and fallback

- The Line Tracker's configured default remains local_excel; no source flag or environment setting was changed.
- Only the downtime subtab requests source=google_sheets. The other Line Tracker tabs and other dashboard modules retain their existing source behavior.
- The live downtime request uses the existing Google Sheets cache and supports refresh=true.
- The live downtime path reports an error when unavailable. It does not present the local snapshot as live data.

The local workbook and live worksheet are not combined. The existing local snapshot reports 14,567 historical records and 2,192,536.1 downtime minutes; the live tab reports 14,568 records and 2,193,605.1 minutes. Those figures remain separate.

## Calculations and data quality

- The source header Downtime Mins establishes the duration unit. Backend totals convert those values to hours only for display.
- The live worksheet has **9,658** valid numeric durations, **4,905** blank durations, and **5** invalid or negative duration values. Blank and invalid values are excluded from duration sums and shown as missing; they are not counted as zero.
- The total from the backend was **2,193,605.1 minutes**. An independent calculation from the raw worksheet values matched it exactly.
- Independent machine and category totals matched backend groupings. The grouped data contained 44 machine labels and 20 category labels.
- A live date-range filter from 2026-09-01 through 2026-09-18 matched an independent calculation from the same worksheet.
- Planned classification is available from recognized category values; the existing recognized-category rules are retained. No separate explicit planned flag column was present.
- Calendar-time MTBF is an approximation based on the selected date coverage because machine run hours are not in this worksheet.
- Ten exact duplicate rows were found and retained. The worksheet has no unique event key that would establish whether identical rows are accidental duplicates or separate events; the API reports this data-quality issue.
- No records are joined with the Entries worksheet. Formula rows that currently evaluate to blanks are excluded as empty rows.

## Tests and checks

- Backend Downtime Log, Google Sheets, and Line Tracker regression tests: **61 passed**.
- Frontend tests: **101 passed**.
- Frontend production build and TypeScript check: **passed**. Vite emitted its existing large-chunk advisory.
- Frontend lint: completed with six warnings in TargetActualChart.tsx, ManufacturingDashboard.tsx, and two scripts; no warning was in the changed Line Tracker view.
- Backend Ruff syntax-critical rules (E4, E7, E9): **passed**; the new backend test file passed Ruff. A full Ruff check reported 88 style and modernization findings across the Line Tracker service and route files, mainly line-length findings.
- Live Sheets read, live API response, independent totals, and browser rendering were verified separately from mocked tests.

## Files changed for this integration

- backend/app/services/google_sheets_service.py — shared metadata-aware read-only worksheet fetch.
- backend/app/services/line_tracker_service.py — isolated Downtime Log cache, dynamic row parsing, source metadata, and missing-value-aware analytics.
- backend/app/api/routes/line_tracker.py — explicit Google Sheets source selection for the existing reliability endpoints.
- backend/tests/test_downtime_log_google_sheets.py — mocked parsing, caching, filtering, API response, and failure tests.
- frontend/src/components/lineTracker/LineTrackerView.tsx — live source wiring and loading, empty, error, and data-quality presentation.
- frontend/src/services/lineTrackerApi.ts — source query parameter and nullable metrics.
- frontend/src/services/lineTrackerApi.test.ts — source-selection request tests.
- DOWNTIME_LOG_GOOGLE_SHEETS_INTEGRATION_REPORT.md — this report.

The repository already contained other modified and untracked files before this work. They were preserved. No .env values were changed.

## Manual configuration and local verification

No additional configuration is required; the existing backend spreadsheet setting matches the requested ID, and existing service-account credentials successfully read the sheet.

1. In a terminal, run the backend from backend with python -m uvicorn app.main:app --reload.
2. In a second terminal, run the frontend from frontend with npm.cmd run dev.
3. Sign in as a user with dashboard read access, open the ERC Mk-V Line Tracker, then select **Reliability & Downtime Log**.
4. Use **Refresh Downtime Log** to bypass the cache. The subtab should show Google Sheets / Downtime Log and the current returned rows.
5. To check the API directly with an authenticated session, request the two endpoints listed above.

## Completion controls

No spreadsheet writes, commits, pushes, merges, deployments, publications, or production configuration changes were made.
