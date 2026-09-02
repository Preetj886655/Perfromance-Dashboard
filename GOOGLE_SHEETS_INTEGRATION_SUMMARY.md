# Google Sheets Integration for Patil Manufacturing Analytics

**Status**: Architecture implemented and verified. Backend service complete. Frontend import UI extended. All code compiles and type-checks cleanly. Live connection requires Google Cloud credentials (Service Account).

---

## 1. Architecture Overview

The Google Sheets integration is designed as a **server-side data source layer** that fits into the existing manufacturing analytics pipeline:

```
Google Sheets → Google Sheets API (server-side)
  ↓
Backend Service (google_sheets_service.py)
  ↓
Manufacturing API Endpoints (/api/manufacturing/*)
  ↓
Frontend Fetch Service (manufacturingApi.ts)
  ↓
Existing DprRecord Normalization (normalizeDprData.ts)
  ↓
Existing Analytics Engine (KPI / OEE / Downtime / Quality)
  ↓
Dashboard
```

### Key Principles

1. **No credentials in React**: Google Sheets API calls are server-side only.
2. **No analytics duplication**: Google Sheet rows are normalized into the same `DprRecord` shape as Excel/CSV imports, reusing all existing calculation logic.
3. **Backward compatible**: Excel/CSV import remains unchanged and functional.
4. **Graceful offline mode**: Dashboard continues to work with cached or offline data even when Google Sheets is unavailable.
5. **Flexible source selection**: The import UI lets users switch between Excel/CSV uploads and Google Sheets via a dropdown.

---

## 2. Files Changed

### Backend

#### **New Files**
- **`backend/app/services/google_sheets_service.py`** — Server-side Google Sheets integration layer
  - Reads Google Sheets via authenticated service account
  - Normalizes column headers and data types
  - Handles dates, numbers, empty cells, and custom fields
  - Implements in-memory cache to reduce API calls
  - Reports connection status and column mismatches

- **`backend/app/api/routes/manufacturing.py`** — HTTP endpoints exposing Google Sheets data
  - `GET /api/manufacturing/status` — connection status, record count, last sync
  - `GET /api/manufacturing/data` — normalized dataset (used by frontend)
  - `GET /api/v1/manufacturing/status` — compatibility layer
  - `GET /api/v1/manufacturing/data` — compatibility layer

- **`backend/tests/test_google_sheets_service.py`** — unit tests for normalization and status

#### **Modified Files**
- **`backend/app/core/config.py`**
  - Added: `google_sheets_spreadsheet_id`, `google_sheets_default_worksheet`, `google_sheets_cache_ttl_seconds`
  - These can be configured via environment variables

- **`backend/app/main.py`**
  - Added: `app.include_router(manufacturing.router)` to register the new manufacturing endpoints

- **`backend/.env.example`**
  - Added placeholders and guidance for:
    - `GOOGLE_SHEETS_SPREADSHEET_ID`
    - `GOOGLE_SHEETS_DEFAULT_WORKSHEET`
    - `GOOGLE_SERVICE_ACCOUNT_JSON`

- **`backend/requirements.txt`**
  - Already includes `google-api-python-client==2.174.0` and `google-auth==2.40.3` (added in previous session)

### Frontend

#### **New Files**
- **`frontend/src/services/manufacturingApi.ts`** — Frontend service for Google Sheets data
  - Exports: `fetchManufacturingStatus()`, `fetchManufacturingDataset()`, `normalizeGoogleSheetRecords()`
  - Normalizes Google Sheet column names to the same field aliases as Excel/CSV parser
  - Uses existing `normalizeDprRows()` to convert to `DprRecord[]`

#### **Modified Files**
- **`frontend/src/pages/ManufacturingDashboard.tsx`**
  - Added state: `dataSourceMode` ("excel-csv" | "google-sheets")
  - Added state: `googleSheetUrl` (string)
  - Added state: `googleSheetsStatus` (connection metadata)
  - Added state: `googleSheetsLoading` (boolean)
  - Added handler: `handleGoogleSheetsConnect()` → calls backend and loads data
  - Updated import UI: Added "Data Source" dropdown to toggle between local file and Google Sheets
  - When "Google Sheets" is selected: URL/ID input field + Connect button replaces file upload
  - Shows connection status, record count, and any column mismatches
  - Reuses existing preview/submit flow: once connected, Google data is saved to the same dashboard state

---

## 3. Google Cloud Setup Required

### Create a Google Service Account

1. **Go to Google Cloud Console**
   - https://console.cloud.google.com/

2. **Create a new project or select existing**
   - Project name: e.g., "Patil Manufacturing"

3. **Enable the Google Sheets API**
   - Search: "Google Sheets API"
   - Click "Enable"

4. **Create a Service Account**
   - In left menu: "IAM & Admin" → "Service Accounts"
   - Click "Create Service Account"
   - Name: e.g., "patil-analytics"
   - Grant role: `roles/editor` (or minimal: `spreadsheets.readonly` if custom role available)
   - Create a JSON key for the service account:
     - On the service account detail page, "Keys" tab
     - "Add Key" → "Create new key" → JSON
     - Download the JSON file — keep it secure

### Share the Google Sheet

1. **Copy the spreadsheet ID** from the Google Sheets URL
   - URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`

2. **Share the sheet with the service account email**
   - The email is in the JSON key file: `client_email`
   - Share → Paste email → Reader access (read-only is sufficient)

3. **Verify the worksheet structure**
   - Required columns (case-insensitive, flexible naming):
     - `Date`, `Line`, `Machine`, `Part`
   - Optional columns:
     - `Shift`, `Stage`, `Downtime`, `Downtime Reason`, `Production`, `Target`, `Rejection`, `Quality`, `Availability`, `Performance`, `OEE`, `Good Qty`, `Remarks/Description`, custom fields
   - The service auto-detects and maps columns

---

## 4. Environment Variables Required

### For Local Development

Create or update `backend/.env`:

```ini
# Google Sheets configuration
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id-here
GOOGLE_SHEETS_DEFAULT_WORKSHEET=Sheet1
GOOGLE_SHEETS_CACHE_TTL_SECONDS=45

# Google service account — choose ONE of:
# Option A: Inline JSON (keep in a secret manager, not .env)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"..."}

# Option B: File path to service account JSON (recommended for local dev)
GOOGLE_SERVICE_ACCOUNT_JSON=/absolute/path/to/service-account.json

# Example with forward slashes (Windows path):
GOOGLE_SERVICE_ACCOUNT_JSON=c:/Users/YourName/Downloads/service-account.json
```

### For Production / Render

Set these as **secret environment variables** (never commit to git):

```
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}  # full JSON blob
GOOGLE_SHEETS_CACHE_TTL_SECONDS=45
```

Or store the service account JSON in Render Secrets, then load it at runtime:

```bash
# In Render build or start commands:
export GOOGLE_SERVICE_ACCOUNT_JSON=$(cat /run/secrets/google-service-account.json)
```

---

## 5. How to Run Locally

### Backend

1. **Activate the virtual environment**
   ```bash
   cd backend
   .\.venv\Scripts\activate  # Windows
   # or: source .venv/bin/activate  # macOS/Linux
   ```

2. **Copy `.env.example` to `.env` and populate**
   ```bash
   cp .env.example .env
   # Edit .env with:
   # - Google Sheets spreadsheet ID
   # - Path to service account JSON
   ```

3. **Run migrations** (if needed)
   ```bash
   python -m alembic upgrade head
   ```

4. **Start the FastAPI server**
   ```bash
   python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

   Server runs at: `http://127.0.0.1:8000/docs`

### Frontend

1. **Install dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Start dev server**
   ```bash
   npm run dev
   ```

   Dashboard runs at: `http://localhost:5173/`

### Test Google Sheets Connection

1. **Open the dashboard** at `http://localhost:5173/`

2. **Navigate to "Data Import Center"**

3. **Select "Data Source" → "Google Sheets"**

4. **Paste a Google Sheets URL or ID**
   - Example: `https://docs.google.com/spreadsheets/d/1abc123xyz/edit`
   - Or just: `1abc123xyz`

5. **Click "Connect to Google Sheet"**

6. **Expected result**:
   - If credentials are valid and the sheet is shared: "Connected to [Sheet1] • [N] records • last sync [timestamp]"
   - If credentials are missing or sheet is not shared: error message explaining the issue

7. **Once connected**: Click "Submit & Generate Dashboard" to load the data into the main analytics view

---

## 6. How to Deploy

### Prerequisites

- GitHub repo with the updated code pushed
- Render.com account (or similar hosting)
- Google Cloud project with service account created

### Deployment Steps

#### 1. **Deploy Backend to Render**

1. Create a new "Web Service" on Render pointing to your GitHub repo
2. Runtime: `Python 3.12`
3. Build command:
   ```bash
   cd backend && pip install -r requirements.txt && python -m alembic upgrade head
   ```
4. Start command:
   ```bash
   cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
5. Add environment variables (Render dashboard → Service → Environment):
   - `GOOGLE_SHEETS_SPREADSHEET_ID=your-id`
   - `GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}` (the full JSON)
   - Any other backend env vars (POSTGRES_*, etc.)

#### 2. **Deploy Frontend to Vercel / Netlify / GitHub Pages**

1. Build locally to ensure no errors:
   ```bash
   cd frontend
   npm run build
   ```
2. Deploy `frontend/dist/` folder to your hosting
3. Update `frontend/src/api/client.ts` if the backend API URL changes (e.g., from `localhost:8000` to Render URL)

#### 3. **Verify Deployment**

- Open the deployed dashboard
- Navigate to "Data Import Center"
- Test "Google Sheets" source connection
- Confirm data loads and dashboard updates

---

## 7. How to Test Live Synchronization

### Unit Tests (Backend)

```bash
cd backend
python -m pytest tests/test_google_sheets_service.py -v
```

Expected output:
```
test_normalizes_google_sheet_rows_and_keeps_custom_columns PASSED
test_status_reports_offline_when_google_credentials_are_missing PASSED
```

### Integration Tests (Backend → Google Sheets API)

1. Set up `.env` with real Google credentials
2. Run:
   ```bash
   python -m pytest tests/test_google_sheets_service.py::test_live_connection -v --tb=short
   ```
   (Note: This test does not yet exist; the backend module has been designed to support it.)

### E2E Tests (Frontend → Backend → Google Sheets)

1. Start both backend and frontend (see "How to Run Locally")
2. Open dashboard at `http://localhost:5173/`
3. Go to "Data Import Center" → "Google Sheets"
4. Enter a valid spreadsheet ID
5. Click "Connect to Google Sheet"
6. Verify:
   - ✓ Connection status shows "Connected"
   - ✓ Record count matches expected data
   - ✓ Click "Submit & Generate Dashboard"
   - ✓ Dashboard slides load with Google Sheets data
   - ✓ All KPIs, charts, and analytics reflect the Google Sheet rows

### Offline Resilience Test

1. With dashboard loaded and Google Sheets data showing:
2. Unplug network or stop backend server
3. Refresh the dashboard
4. Expected: Dashboard continues to show cached data (from localStorage)
5. "Data Import Center" will show offline status but Excel/CSV uploads still work

---

## 8. Architecture Decisions & Limitations

### Decisions Made

1. **Server-side Google Sheets API calls**
   - Keeps credentials secure; React never sees Google API keys
   - Allows for fine-grained access control and audit logging
   - Enables caching to reduce quota usage

2. **Column auto-mapping**
   - Normalizes header names (case-insensitive, whitespace-insensitive)
   - Preserves custom columns as-is (e.g., "extra_field" → "extraField")
   - Reports mismatches if required fields are missing

3. **In-memory cache (45 seconds default)**
   - Reduces redundant API calls during active sessions
   - Configurable via `GOOGLE_SHEETS_CACHE_TTL_SECONDS`
   - Does NOT persist across server restarts

4. **Reuse of existing analytics**
   - Google Sheet rows are normalized into the same `DprRecord` model as Excel/CSV
   - No new KPI/OEE calculation logic required
   - Same dashboard features and filters work for all data sources

### Limitations & Workarounds

| Limitation | Reason | Workaround |
|---|---|---|
| **No real-time sync** | Google Sheets API is request-based, not push-based | Frontend can poll `/api/manufacturing/status` on a timer, or user manually refreshes |
| **45-second cache** | Balances API quota usage with data freshness | Reduce `GOOGLE_SHEETS_CACHE_TTL_SECONDS` to 10 for more frequent updates (uses more quota) |
| **Service account read-only** | Spreadsheet is never written to by the service | Intentional; preserves data integrity; users manually edit the Google Sheet |
| **No offline mode for Google Sheets** | Google Sheets data is not cached to localStorage | Only Excel/CSV imports are cached; once loaded, dashboard continues offline |
| **gid=0 hardcoded in _resolve_worksheet_title** | The default worksheet title ("Sheet1") is determined from the first sheet with gid=0 | If gid=0 is not the sheet users want, they can pass `worksheet` parameter or rename the sheet |

### Future Enhancements

- [ ] Periodic polling from React to refresh Google Sheets data
- [ ] Webhook-based sync (Google Sheets → Render via Cloud Tasks)
- [ ] Cache to Redis or PostgreSQL for persistent offline mode
- [ ] Multi-sheet support (fetch from multiple Google Sheets simultaneously)
- [ ] Write-back capability (e.g., auto-reject rows that fail validation)

---

## 9. Remaining Verification Tasks

### Before Declaring Production-Ready

1. **✓ Code compiles**
   - Frontend TypeScript: `npm run typecheck` — PASSED
   - Frontend build: `npm run build` — PASSED
   - Backend Python: `compileall` — PASSED

2. **⚠ Live Google Sheets connection** (requires Google credentials)
   - Set `GOOGLE_SHEETS_SPREADSHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_JSON` in `.env`
   - Run: `curl http://127.0.0.1:8000/api/manufacturing/status?spreadsheet_id=YOUR_ID`
   - Expected: `{"connectionStatus":"connected","recordCount":N,...}`

3. **⚠ Frontend → Backend → Google Sheets e2e test** (requires Google credentials)
   - Start backend and frontend locally
   - Manually test the Data Import UI with a real Google Sheet
   - Verify data loads and dashboard updates

4. **⚠ Deployment test** (requires Render / hosting setup)
   - Push changes to GitHub
   - Deploy backend to Render (or similar)
   - Deploy frontend to Vercel / Netlify
   - Test live connection from deployed frontend

---

## 10. Summary of Implementation

### What Has Been Built

✓ **Backend Google Sheets service** — Reads, normalizes, caches, and serves manufacturing data  
✓ **Manufacturing API endpoints** — `/api/manufacturing/status` and `/api/manufacturing/data`  
✓ **Frontend data service** — Wraps API calls and normalizes to existing `DprRecord` type  
✓ **Import UI extension** — Toggles between Excel/CSV and Google Sheets data sources  
✓ **Configuration layer** — Environment-driven, no hardcoded secrets  
✓ **Backward compatibility** — Excel/CSV imports unchanged; both sources coexist  
✓ **Unit tests** — Basic normalization and status tests in place  
✓ **Documentation** — Complete setup and deployment guide (this file)  

### What Has NOT Been Built

✗ Real-time push sync (would require webhooks or client-side polling)  
✗ Multi-sheet selection UI (gid=0 assumed; can be extended)  
✗ Live credential validation before deployment (requires actual Google setup)  
✗ Full e2e test suite (requires fixture Google Sheet and service account)  
✗ Write-back capability (intentionally omitted for data safety)  

---

## 11. Next Steps for You

1. **Create Google Service Account** (section 3)
2. **Populate `.env`** with Google credentials (section 4)
3. **Test locally** (section 5)
4. **Run unit tests** to confirm normalization works
5. **Test e2e** with the actual import UI
6. **Deploy to production** (section 6)
7. **Verify live connection** from production dashboard

For any issues, check the error message in the "Data Import Center" — it will tell you if credentials are missing, the sheet is not shared, or columns are mismatched.

---

**Integration complete. Happy manufacturing analytics! 🏭📊**
