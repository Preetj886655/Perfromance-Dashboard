# ERC Mk-V Phase 1 Acceptance Review

**Review date:** 2026-10-17  
**Recommendation:** **ACCEPT WITH LIMITATIONS**

## Summary

The Phase 1 worksheet foundation is present and its backend/frontend checks pass. The live read-only catalog and page reads were repeated during this review and all 17 live Google `sheetId` values match the audited inventory. The existing worksheet service is restricted to the configured spreadsheet and an allowlisted worksheet key; its Google Sheets credentials use the read-only scope.

One small navigation gap was found during review: the worksheet section had a static heading, although the requested walkthrough calls for expanding it. The heading is now an accessible expand/collapse button; the section starts expanded. Frontend typecheck, build, lint, and focused tests were rerun after this adjustment.

The shared local browser remains signed out. No credentials were requested, entered, changed, or bypassed. Therefore visual and interactive browser acceptance—including all 17 pages, direct URLs, browser history, and mobile layout—remains pending. The implementation is suitable for acceptance with that limitation, subject to the manual checks below.

## Verified items

### Worktree and scope

- Inspected `git status --short`, the tracked diff/stat, and `git diff --check` before making the review fix. The worktree contains numerous pre-existing modified and untracked files; they were preserved.
- The only review-time code change was to make the existing ERC Mk-V worksheet sidebar section collapsible. No Phase 2 functionality was added.
- No commits, pushes, merges, deployments, production configuration changes, or Google Sheets writes were performed.

### Backend, access control, and source safety

- `GET /api/v1/line-tracker/worksheets` and `GET /api/v1/line-tracker/worksheets/{worksheet_key}` are registered under the existing Line Tracker router and use its `dashboard:READ` dependency.
- Unknown worksheet keys return 404; invalid query parameters are bounded/validated; upstream read failures return an explicit 502. Worksheet data is paginated (page size maximum 200) and search is bounded to 120 characters.
- Data is cached per configured spreadsheet and worksheet. Failed refreshes use the last successful data only when available, keep its original `fetched_at`, and explicitly mark the result stale with a refresh error.
- The frontend sends only a worksheet key and paging/search/refresh parameters. The spreadsheet ID is selected server-side from configuration; clients cannot submit an arbitrary spreadsheet ID to these worksheet endpoints.
- The Google Sheets metadata and value requests inspected in `google_sheets_service.py` use `https://www.googleapis.com/auth/spreadsheets.readonly`. The new service returns structural metadata and sheet values, not service-account credentials.
- Authentication/RBAC is covered by tests for authenticated success and unauthenticated rejection. The route dependency is shared by both new endpoints.

### Worksheet coverage and live IDs

During this review, the live catalog was fetched and each worksheet was individually read with page size 1. The live `sheetId` was compared with the ID in `ERC_MKV_WORKSHEET_INVENTORY.md`; all 17 matched:

| Worksheet | Live `sheetId` | Result |
|---|---:|---|
| Production Order | 1832059257 | Match; read succeeded |
| Copy of Production Order | 827106177 | Match; read succeeded |
| Order Plan (Monthly) | 443868223 | Match; read succeeded |
| RM Heat Plan vs Actual | 217356585 | Match; read succeeded |
| Heat & Lot Number Reference | 1881319427 | Match; read succeeded |
| Machine Consumables | 1208025434 | Match; read succeeded |
| Machine Master | 1022871279 | Match; read succeeded |
| Capacity Change Log | 1408359762 | Match; read succeeded |
| Entries | 1019432778 | Match; read succeeded |
| Planned Shutdowns | 1171824600 | Match; read succeeded |
| Manpower Summary | 1841059416 | Match; read succeeded |
| Production Dashboard | 1905823832 | Match; read succeeded |
| Dashboard | 1047718776 | Match; read succeeded |
| Summary | 311599185 | Match; read succeeded |
| Downtime Log | 1490231673 | Match; read succeeded |
| Downtime Analysis | 1296123007 | Match; read succeeded |
| OEE & Reliability | 1752221202 | Match; read succeeded |

Tabular worksheets use the audited table-header row. Multi-section worksheets use the raw-grid layout so their separate title, note, and metric blocks are not presented as one normalized data table.

### Frontend and existing routes

- The sidebar lists all 17 expected keys under the ERC Mk-V Worksheets group, now with an accessible expand/collapse control.
- Hash route parsing supports `#/line-tracker/worksheet/{key}` and the hash-change listeners update the active page and worksheet key. The existing `#/line-tracker` route still renders the original `LineTrackerView`.
- Worksheet pages include search, pagination, explicit refresh, source worksheet ID, cache/read-only label, last successful read time, loading/empty/error states, and stale-cache/error details.
- Existing Line Tracker regression tests pass. They include existing Line Tracker endpoint behavior; a signed-in visual check of its Downtime Log UI is still pending.
- No automated React component/browser test was found for sidebar interaction or table rendering; the frontend tests exercise the API client.

## Exact validation executed

| Command/check | Result |
|---|---|
| `$env:LINE_TRACKER_SOURCE='local_excel'; .\backend\.venv\Scripts\python.exe -m pytest backend/tests/test_line_tracker_worksheets.py backend/tests/test_line_tracker_service.py -q` | **50 passed in 90.24s** |
| `.\backend\.venv\Scripts\python.exe -m pytest backend/tests/test_line_tracker_worksheets.py -q` after the final layout change | **7 passed in 31.66s** |
| `Set-Location frontend; npm run test -- src/services/lineTrackerWorksheetsApi.test.ts src/services/lineTrackerApi.test.ts` | **18 passed** |
| `Set-Location frontend; npm run typecheck` | **Passed** |
| `Set-Location frontend; npm run build` after the collapsible-navigation adjustment | **Passed**; Vite reports the existing >500 kB bundle-size advisory |
| `Set-Location frontend; npm run lint` after the collapsible-navigation adjustment | **Passed with warnings** listed below |
| Live Python service check: fresh catalog, compare all IDs against the inventory, individually fetch page 1 for all allowlisted tabs | **17/17 IDs match; 17/17 reads succeeded** |
| `git diff --check` after the review adjustment | **Passed**; Git printed line-ending notices for pre-existing `backend/.env.example` and `frontend/src/App.tsx` |

The backend regression run used the process-local `LINE_TRACKER_SOURCE=local_excel` override because the legacy tests assert that source. This did not modify `.env` or application configuration.

Lint warnings remain in pre-existing portions of `ManufacturingDashboard.tsx` and `TargetActualChart.tsx`, plus `scripts/debug_test.cjs` and `scripts/track_load.cjs`. The reviewed worksheet component/client files introduced no reported lint errors. The production build succeeds despite the chunk-size advisory.

## Unverified browser checks

The only shared browser page (`http://localhost:5173/`) currently displays the **Sign in** screen and recent 401 responses. No authorized signed-in browser session was available, so the following checks were not performed:

- Rendered appearance and interaction across all 17 worksheet pages.
- Sidebar expand/collapse interaction in desktop and mobile layouts.
- Browser back/forward and direct nested-route loading while authenticated.
- Search and pagination in the rendered table.
- Clicking refresh and verifying displayed refresh metadata.
- Browser-visible stale/error recovery.
- Visual confirmation that the existing Line Tracker and Downtime Log remain usable.

Backend tests cover stale-cache fallback, API errors, pagination, and RBAC. They do not substitute for the unperformed visual browser walkthrough.

## Manual browser verification steps

Using the existing authorized development account/session, without sharing credentials:

1. Start the local frontend and backend using the project’s normal development commands. Open `http://localhost:5173/#/dashboard` and sign in through the normal app flow if required.
2. In the desktop sidebar, find **ERC MK-V WORKSHEETS**. Collapse it using its heading button, verify its entries disappear and `aria-expanded` changes to false, then expand it and verify its worksheet links return.
3. Open each link and verify its heading, source status, sheet ID, source timestamp, and data:
   - Production Order — `#/line-tracker/worksheet/production-order`
   - Copy of Production Order — `#/line-tracker/worksheet/copy-of-production-order`
   - Order Plan (Monthly) — `#/line-tracker/worksheet/order-plan-monthly`
   - RM Heat Plan vs Actual — `#/line-tracker/worksheet/rm-heat-plan-vs-actual`
   - Heat & Lot Number Reference — `#/line-tracker/worksheet/heat-lot-number-reference`
   - Machine Consumables — `#/line-tracker/worksheet/machine-consumables`
   - Machine Master — `#/line-tracker/worksheet/machine-master`
   - Capacity Change Log — `#/line-tracker/worksheet/capacity-change-log`
   - Entries — `#/line-tracker/worksheet/entries`
   - Planned Shutdowns — `#/line-tracker/worksheet/planned-shutdowns`
   - Manpower Summary — `#/line-tracker/worksheet/manpower-summary`
   - Production Dashboard — `#/line-tracker/worksheet/production-dashboard`
   - Dashboard — `#/line-tracker/worksheet/dashboard`
   - Summary — `#/line-tracker/worksheet/summary`
   - Downtime Log — `#/line-tracker/worksheet/downtime-log`
   - Downtime Analysis — `#/line-tracker/worksheet/downtime-analysis`
   - OEE & Reliability — `#/line-tracker/worksheet/oee-reliability`
4. On Production Order, search for a visible PO value and confirm the results/count update. On Downtime Log, use Next and Previous to verify page rows change and the page count remains consistent.
5. On any worksheet, click **Refresh** and confirm the control shows its loading state and a successful read time is displayed afterward.
6. For a safe local-only error display check, first leave a worksheet loaded. In browser DevTools, temporarily block that worksheet’s `/api/v1/line-tracker/worksheets/{key}` request and click Refresh. Verify the old rows remain visible with a stale/error indication; then remove the block and retry. Do not interfere with production traffic or Google credentials.
7. Navigate from a worksheet to another route, use browser Back and Forward, and directly load the nested route URL. Verify the correct worksheet is selected each time.
8. Open `http://localhost:5173/#/line-tracker`; verify the existing Line Tracker renders and its Downtime Log tab/records/refresh behavior are still present.
9. Repeat checks 2–8 at desktop width and a narrow mobile viewport. Confirm the sidebar drawer can scroll to the worksheet group, the group can be toggled, and the worksheet table scrolls horizontally without covering the page controls.

## Defects and recommendation

- **Corrected during review:** The worksheet section heading was not interactive. It is now a keyboard-accessible expand/collapse button; the frontend build, typecheck, lint, and API tests passed after the fix.
- **No other code defect confirmed** by inspection or the executed service/API checks.
- **Remaining limitation:** Browser-level acceptance is pending an authorized signed-in session.

**Final recommendation: ACCEPT WITH LIMITATIONS.** The backend, live read-only data path, route wiring, and automated checks are verified. Complete the manual browser walkthrough above before treating the UI as fully accepted. Phase 2 remains out of scope and has not started.
