# Testing Guide: Live Dashboard with Modern Design System

## Quick Start (Local Development)

### Prerequisites
- Python 3.10+ (Backend)
- Node.js 18+ (Frontend)
- PostgreSQL running on 127.0.0.1:5433 (via docker-compose or installed)
- Google Sheets API credentials (optional - can test with Excel/CSV)

### Step 1: Start Backend

```bash
cd backend

# Install dependencies (if not already done)
pip install -r requirements.txt

# Start development server
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete
```

### Step 2: Start Frontend

```bash
cd frontend

# Install dependencies (if not already done)
npm install

# Start development server
npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in 123 ms

  ➜  Local:   http://localhost:5173/
```

### Step 3: Open Dashboard

Open http://localhost:5173 in your browser.

You should see:
- Left sidebar with navigation menu
- Top bar with title, status, and user info
- Data source indicator showing current dataset
- Main content area with dashboard

## Feature Testing

### A. Test Responsive Design

1. **Open DevTools** (F12)
2. **Toggle Device Toolbar** (Ctrl+Shift+M)
3. **Test Breakpoints**:
   - Desktop (1920x1080): Full sidebar, all controls visible
   - Laptop (1280x720): Sidebar still 260px, good spacing
   - Tablet (1024x768): Sidebar becomes overlay/drawer
   - Small Tablet (768x1024): Icons-only sidebar mode
   - Mobile (375x667): Stacked layout, minimal padding

**Expected Results**:
- ✓ No horizontal scrollbar at any width
- ✓ No clipped content or controls
- ✓ Sidebar smoothly transforms/collapses
- ✓ Top bar stays fixed and readable
- ✓ Cards stack properly on small screens
- ✓ Buttons and inputs remain clickable

### B. Test Excel/CSV Import (Existing Feature - Preserved)

1. **Click "Data Import"** in sidebar
2. **Select "Local Excel / CSV"**
3. **Choose source type**: Excel or CSV
4. **Upload file**: Drag-and-drop or click to select
5. **Preview**: Click "Preview File"
6. **Submit**: Click "Submit & Generate Dashboard"

**Expected Results**:
- ✓ File processes successfully
- ✓ Preview shows detected data
- ✓ Dashboard generates without errors
- ✓ All charts and KPIs populate
- ✓ Filters work correctly

### C. Test Google Sheets Connection (New Feature)

#### Setup (requires Google Sheets credentials):

1. Set environment variable:
   ```bash
   export GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
   ```
   Or create `.env` file in backend:
   ```
   GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
   ```

2. **Click "Data Import"** in sidebar
3. **Select "Google Sheets"** from dropdown
4. **Enter spreadsheet URL or ID**:
   - Full URL: `https://docs.google.com/spreadsheets/d/1abc123XYZ.../edit`
   - Or just ID: `1abc123XYZ...`
5. **Click "Connect to Google Sheet"**

**Expected Results**:
- ✓ Connection established (green status badge)
- ✓ Record count displayed
- ✓ Last sync timestamp shown
- ✓ Data Import Center updates with status
- ✓ Dashboard transitions to analytics views

### D. Test Live Polling (Auto-Refresh)

1. **Connect to a Google Sheet** (see section C above)
2. **Enable Auto Refresh**: Toggle in Data Import Center
3. **Status Indicator**: Should show "Connected" or "Syncing"
4. **Wait 60 seconds**: Polling checks for updates (configurable)

**In a separate browser/device**:
- Edit the Google Sheet (add/modify rows)
- Save changes

**In dashboard browser**:
- ✓ Status indicator shows "Updating"
- ✓ Dashboard data refreshes automatically
- ✓ Charts update with new data
- ✓ No page reload occurs
- ✓ User is not interrupted

### E. Test Manual Refresh

1. **Connected to Google Sheet** with Auto Refresh enabled
2. **Click refresh button** next to status indicator
3. **Button shows loading animation** (rotating icon)
4. **Data fetches immediately** (no waiting for 60s interval)

**Expected Results**:
- ✓ Refresh completes in <2 seconds
- ✓ Data updates if changes exist
- ✓ Status shows "Updated" or current time
- ✓ No errors in console

### F. Test Offline Handling

1. **Connect to Google Sheet** (see section C)
2. **Disable network** (DevTools → Network → Offline)
3. **Wait for next polling interval** (60s)

**Expected Results**:
- ✓ Status indicator turns yellow/orange (⚠ Offline)
- ✓ Last known data remains visible
- ✓ Dashboard still usable
- ✓ No error messages to user
- ✓ Auto-retry when network resumes

**Re-enable network**:
- ✓ Status returns to "Connected"
- ✓ Polling resumes automatically
- ✓ Fresh data fetched

### G. Test Animations (Accessibility)

1. **Open DevTools** (F12)
2. **Go to Rendering tab** (or search "Rendering")
3. **Check "Emulate CSS media feature prefers-reduced-motion"**

**Expected Results**:
- ✓ Animations all disable (0.01ms duration)
- ✓ Page is still fully functional
- ✓ No jumping or unexpected behavior
- ✓ All content remains visible
- ✓ Transitions are instant

### H. Test Dark Mode

1. **Open System Settings** and set to Dark Mode
   - Or use DevTools: DevTools settings → Appearance → Dark

**Expected Results**:
- ✓ Dashboard colors invert properly
- ✓ All text remains readable
- ✓ Contrast ratios maintained
- ✓ Status indicators clearly visible
- ✓ Charts remain visible with good contrast

## API Endpoint Testing

### Test Backend Health

```bash
curl http://127.0.0.1:8000/api/v1/health
```

Expected response:
```json
{"status": "ok"}
```

### Test Manufacturing Status

```bash
curl "http://127.0.0.1:8000/api/manufacturing/status?spreadsheet_id=YOUR_ID&worksheet=Sheet1"
```

Expected response:
```json
{
  "connectionStatus": "connected",
  "spreadsheetId": "YOUR_ID",
  "worksheet": "Sheet1",
  "recordCount": 42,
  "lastUpdated": "2026-09-01T14:30:00Z",
  "error": null
}
```

### Test Manufacturing Data

```bash
curl "http://127.0.0.1:8000/api/manufacturing/data?spreadsheet_id=YOUR_ID&worksheet=Sheet1"
```

Expected response:
```json
{
  "connectionStatus": "connected",
  "spreadsheetId": "YOUR_ID",
  "worksheet": "Sheet1",
  "recordCount": 42,
  "lastUpdated": "2026-09-01T14:30:00Z",
  "data": [
    {
      "date": "2026-08-14",
      "shift": "A",
      "machineNo": "M001",
      ...
    }
  ]
}
```

## Performance Checks

### 1. Build Performance
```bash
cd frontend
npm run build
```

**Expected**:
- ✓ Build completes in <1 second
- ✓ 658 modules transformed
- ✓ CSS: ~60KB, JS: ~1.8MB (before gzip)

### 2. TypeScript Compilation
```bash
cd frontend
npm run typecheck
```

**Expected**:
- ✓ No errors
- ✓ No warnings
- ✓ Completes in <5 seconds

### 3. Bundle Size
```bash
cd frontend
npm run build
# Check dist/assets/
```

**Expected**:
- CSS: 59.71 kB → 11.26 kB (gzipped)
- JS: 1,796 kB → 581 kB (gzipped)

### 4. Polling Performance
1. Open Chrome DevTools → Network tab
2. Connect to Google Sheet with Auto Refresh enabled
3. Watch for polling requests every 60s

**Expected**:
- ✓ Network requests use `/api/manufacturing/data`
- ✓ Response < 1 second
- ✓ No repeated requests
- ✓ Proper cache headers

## Debugging Tips

### View Console Logs
- DevTools → Console
- Check for any errors (red) or warnings (yellow)
- Live polling logs should show: "Polling status...", "Data changed..."

### Inspect Network Requests
- DevTools → Network tab
- Filter to "manufacturing" endpoint
- Check request headers and response payload
- Verify polling interval (~60 seconds)

### Check CSS Variables
- DevTools → Elements → Select any element
- In Styles panel, scroll to bottom
- See all CSS variables from `tokens.css` applied

### Monitor State Changes
- DevTools → React Developer Tools extension
- Select ManufacturingDashboard component
- Watch state updates as data changes
- Check `liveStatus`, `currentSpreadsheetId`, `autoRefreshEnabled`

## Known Limitations & Notes

1. **Google Sheets Authentication**:
   - Requires service account JSON key
   - Never expose credentials to frontend
   - Server-side only, secured by backend

2. **Polling Frequency**:
   - Minimum 10 seconds (to avoid API quota)
   - Maximum 10 minutes
   - Default 60 seconds
   - Configurable via `pollingInterval` parameter

3. **Offline Handling**:
   - Dashboard works with cached data
   - Automatic retry when network returns
   - Last sync timestamp shown

4. **Excel/CSV**:
   - Still works exactly as before
   - No Google Sheets required
   - Data persisted in localStorage

## Troubleshooting

### Frontend won't start
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Backend connection refused
```bash
# Check if backend is running
curl http://127.0.0.1:8000/api/v1/health

# If not running:
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Database connection error
```bash
# Check PostgreSQL
# Via Docker: docker-compose up -d
# Via installed: ensure service running on port 5433
```

### Google Sheets connection fails
- Verify service account JSON is valid
- Check spreadsheet ID is correct
- Ensure service account has read access to sheet
- Check GOOGLE_SHEETS_SPREADSHEET_ID env variable

### Styles not loading
- Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
- Check browser cache: DevTools → Application → Cache Storage → Clear
- Verify CSS files in dist/ folder after build

## Success Criteria Checklist

- [ ] Frontend builds without errors
- [ ] Backend starts without errors
- [ ] Dashboard loads in browser
- [ ] Responsive design works at all breakpoints
- [ ] Excel/CSV import still works
- [ ] Google Sheets connection works
- [ ] Live polling detects changes
- [ ] Manual refresh works
- [ ] Auto-refresh toggle enables/disables polling
- [ ] Status indicators show correct state
- [ ] Offline handling works gracefully
- [ ] Animations work (and disable with prefers-reduced-motion)
- [ ] Dark mode looks good
- [ ] Console has no errors
- [ ] All charts populate with data

---

**Questions?** Check the IMPLEMENTATION_SUMMARY.md for architecture details.
