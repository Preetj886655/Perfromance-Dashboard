# FRONTEND ↔ BACKEND LIVE GOOGLE SHEETS CONNECTION FIX REPORT

**Project:** Patil Group Manufacturing Performance Dashboard
**Scope:** Frontend ↔ Backend live Google Sheets connection (backend → frontend path)
**Stack verified:** Backend `http://127.0.0.1:8000`, Frontend `http://localhost:5173`, Postgres `pril-postgres:16-alpine` (healthy) on `0.0.0.0:5433→5432`
**Result:** 64/64 browser assertions PASS after the fix
**Status before fix:** "No Live Google Sheets Connection" + "No Data" while the backend health endpoint proved Google Sheets connected with 14,004 rows.

---

## 1. Backend health result

`GET http://127.0.0.1:8000/api/v1/health` → **200**

```
status: ok
database.connected: true
googleSheets.connectionStatus: connected
googleSheets.status: connected
googleSheets.spreadsheetId: ...3Ky95o
googleSheets.worksheet: Sheet1
googleSheets.recordCount: 14004
googleSheets.lastSuccessfulSync: 2026-09-21T05:03:07...
googleSheets.error: null
```

Backend health proves the backend itself is healthy and Google Sheets is connected. The fix was never in Google credentials, the spreadsheet, service account, or permissions — those were left untouched, as required.

## 2. Backend data endpoint result

All three manufacturing endpoints respond correctly when called with a valid session token (handled by the app; never printed):

- `GET /api/manufacturing/status` → **200** (`connectionStatus: connected`, `recordCount: 14004`)
- `GET /api/manufacturing/data` → **200** (14,004 records, `min=2024-08-31`, `max=2026-09-03`)
- `GET /api/manufacturing/data?refresh=true` → **200** (fresh payload, cache bypassed)

The manufacturing data endpoint *does* work — the problem was purely how the frontend consumed it on initial load.

## 3. Frontend API URL

Frontend base URL is **empty** in `frontend/.env.example` (the current active config inherits this):

```
# Leave empty to use Vite proxy (/api -> http://127.0.0.1:8000).
VITE_API_BASE_URL=
```

So the browser sends requests to **relative `/api/...` paths**, and Vite's dev server proxies them to `http://127.0.0.1:8000`. Architecture confirmed correct — no hardcoded external origin in the browser, no Google credentials anywhere near the frontend.
## 4. Actual browser request URL

Through the Vite proxy, the dashboard makes these requests (shown by `page.route` plus browser Network observation):

```
GET  /api/v1/health
POST /api/v1/auth/login            (creates session; locally documented credential, token handled by the app)
GET  /api/v1/auth/me               (post-login session probe)
GET  /api/manufacturing/status     <-- the failing bootstrap step, pre-fix
GET  /api/manufacturing/data?spreadsheet_id=...&worksheet=Sheet1
GET  /api/manufacturing/status     (polling refresh)
GET  /api/manufacturing/data?...   (polling refresh)
```

All of them go through `http://localhost:5173` → Vite proxy → `http://127.0.0.1:8000`. No direct browser→backend cross-origin call, so CORS is not the failure path here.

## 5. HTTP status

Pre-fix: the initial `/api/manufacturing/status` bootstrap call had **no retry** and **silently ate failures**. In a transient-failure-at-mount scenario it left the dashboard permanently disconnected with no recovery path.

Post-fix: the frontend now performs its own retries (see §6). The browser shows 200 on all underlying calls once the backend is reachable; in the simulated transient-failure case the UI *heals itself* and in the sustained-failure case the UI renders an explicit error state and recovers when the Retry button is pressed and the backend is reachable.

## 6. Response shape

The manufacturing endpoints return:

```json
{
  "data": [ ... up to 14004 records ... ],
  "connectionStatus": "connected",
  "spreadsheetId": "...3Ky95o",
  "worksheet": "Sheet1",
  "recordCount": 14004,
  "lastUpdated": "...",
  "error": null
}
```

The frontend's `manufacturingApi.ts` + `ManufacturingConnectionStatus` / `ManufacturingApiResponse` types match this shape. The dashboard correctly extracts `response.data`, `response.connectionStatus`, `response.recordCount`, etc. No shape mismatch — the bug was not a parsing error.

## 7. Authentication result

Auth works. Login via `POST /api/v1/auth/login` with the valid local credential succeeds and stores the session in the browser. Subsequent `/api/manufacturing/status` and `/api/manufacturing/data` calls are made with the `Authorization: Bearer <token>` header automatically by `apiGet()` in `client.ts`. The token is read from and written to `localStorage` by the app's own auth layer — **it is never printed, logged, or exposed**.

## 8. CORS result

Not the issue. The frontend doesn't make cross-origin requests to the backend; it routes through the Vite dev proxy. All dashboard API calls resolve within the same browser origin. CORS headers are irrelevant for the reported failure.

## 9. Root cause
