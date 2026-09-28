# Root Cause Diagnostic and Resolution Report: Localhost:5173 Blank White Screen

**Project:** Patil Manufacturing Analytics / Performance Dashboard  
**Date:** 2026-09-25  
**Status:** FULLY RESOLVED & VERIFIED  

---

## 1. Problem

When navigating to `http://localhost:5173` in a web browser, the browser connected with HTTP status 200, but the entire viewport was a blank white screen. No DOM elements were rendered inside `<div id="root"></div>` (HTML length was 0 bytes, child count 0).

---

## 2. Evidence

### 2.1 Process & Port Binding Inspection
Inspecting active TCP connections on port 5173 (`Get-NetTCPConnection -LocalPort 5173`) revealed **two distinct Node processes** concurrently listening on port 5173:
1. **PID 21384** (started at 10:03 AM): Bound to IPv6 loopback `[::1]:5173`. Command line:
   ```cmd
   "node" "frontend/node_modules/vite/bin/vite.js"
   ```
2. **PID 8136** (started at 10:19 AM): Bound strictly to IPv4 loopback `127.0.0.1:5173`. Command line:
   ```cmd
   "node" "frontend/node_modules/vite/bin/vite.js" --host 127.0.0.1 --port 5173
   ```

On Windows, `localhost` resolves by default to IPv6 `::1`. Any browser navigating to `http://localhost:5173` was directed to **PID 21384** (the stale instance), while scripts navigating explicitly to `http://127.0.0.1:5173` connected to **PID 8136**.

### 2.2 Terminal & Module Query Verification
Querying PID 21384 directly via IPv6 (`http://[::1]:5173/src/components/dashboard/LiveGoogleSheetsSection.tsx`) returned an empty file containing only:
```javascript
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkxpdmVHb29nbGVTaGVldHNTZWN0aW9uLnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyIiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IiJ9
```
By contrast, PID 8136 on `127.0.0.1:5173` served the complete, updated TypeScript module.

### 2.3 Browser Console and Page Errors
Running the automated browser diagnostic (`debug_blank_dashboard.cjs`) captured the following uncaught ES module error on all `localhost:5173` routes:
```text
[PAGE ERROR] The requested module '/src/components/dashboard/LiveGoogleSheetsSection.tsx?t=1790333743143' does not provide an export named 'LiveGoogleSheetsSection'
```
Because the stale Vite process served an empty file for `LiveGoogleSheetsSection.tsx`, native ES module evaluation failed at the top level when `main.tsx` imported `App.tsx` &rarr; `ManufacturingDashboard.tsx` &rarr; `LiveGoogleSheetsSection.tsx`.

As a consequence:
- Top-level script evaluation aborted immediately.
- `createRoot(document.getElementById("root")!).render(...)` was never reached.
- React never mounted, leaving `<div id="root"></div>` completely empty.

### 2.4 Route Diagnostic Matrix
| URL Tested | Initial Status | Root HTML | Cause |
|---|---|---|---|
| `http://localhost:5173/` | Blank (0 bytes) | Empty | Module import syntax error from PID 21384 |
| `http://localhost:5173/#/dashboard` | Blank (0 bytes) | Empty | Module import syntax error from PID 21384 |
| `http://localhost:5173/#/quality` | Blank (0 bytes) | Empty | Module import syntax error from PID 21384 |
| `http://127.0.0.1:5173/` | 1,279 bytes | Populated | Connected to active PID 8136 (rendered Sign-in) |
| `http://127.0.0.1:5173/#/dashboard` | 1,297 bytes | Populated | Connected to active PID 8136 (rendered Sign-in) |

---

## 3. Root Cause

1. **Dual Port Collision across IP Stacks**: A stale Vite server process (PID 21384) remained running on `[::1]:5173` from an earlier test session. When a newer instance was started with `--host 127.0.0.1`, Windows permitted both sockets because they were bound to different IP families (IPv6 vs IPv4).
2. **Corrupted Stale HMR Module Cache**: The stale Vite process held an empty in-memory cache of `LiveGoogleSheetsSection.tsx` from earlier transient file writes.
3. **IPv6 Resolution Priority**: Windows resolves `localhost` to `::1`, forcing all browser traffic to the stale process while direct `127.0.0.1` traffic hit the active server.
4. **Unhandled Module Resolution Failure**: The empty module prevented ES module linking, halting execution before `ReactDOM.createRoot` could execute.
5. **Absence of React Error Boundary**: Even after mounting, the application lacked a top-level React `ErrorBoundary` to gracefully catch and display runtime render failures.

---

## 4. Fix

1. **Terminated Rogue Process**: Terminated the zombie Node process (PID 21384) on port 5173. Port 5173 now exclusively routes all IPv4 and IPv6 traffic to the single active Vite dev server.
2. **Added React ErrorBoundary**: Created [`frontend/src/components/ErrorBoundary.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/ErrorBoundary.tsx) and wrapped `<App />` in [`frontend/src/main.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/main.tsx) to prevent any future component crash from blanking the screen.
3. **Hardened Target vs Actual Components**:
   - [`ExecutiveOverviewSlide.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/ExecutiveOverviewSlide.tsx): Added defensive array checks (`data ?? []`), safe accessors for `latestPoint`, safe reduce accumulators for modal tables, and optional chaining on `analytics?.monthlyTargetActual`.
   - [`TargetActualChart.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/TargetActualChart.tsx): Added `safeData = useMemo(() => (Array.isArray(data) ? data : []), [data])` and guarded empty/null series data.
4. **Enhanced Component Contracts**: Updated `ExecutiveOverviewSlide` `Props` to support `filterBar?: React.ReactNode` cleanly.
5. **Automated Verification Hardening**:
   - [`debug_blank_dashboard.cjs`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/debug_blank_dashboard.cjs): Automated Playwright startup test capturing errors, console logs, root length, and child counts.
   - [`frontend/scripts/verify_target_actual_redesign.cjs`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/scripts/verify_target_actual_redesign.cjs): Removed hardcoded test credentials; now reads `process.env.TEST_USER_PASSWORD` strictly, tests explicit hash routes (`#/dashboard`), and validates the `#/quality` route.

---

## 5. Verification

### URL & Routing Verification
- `http://localhost:5173/`: **PASS** (Renders Sign-in UI, Root HTML length: 1,279)
- `http://localhost:5173/#/dashboard`: **PASS** (Renders Sign-in / Dashboard, Root HTML length: 1,297)
- `http://localhost:5173/#/quality`: **PASS** (Renders Sign-in / Quality Dashboard, Root HTML length: 1,297)
- `http://127.0.0.1:5173/`: **PASS** (Renders Sign-in UI, Root HTML length: 1,279)
- `http://127.0.0.1:5173/#/dashboard`: **PASS** (Renders Sign-in / Dashboard, Root HTML length: 1,297)

### Target vs Actual 4-Horizon Verification
- **Monthly Performance**: **PASS** (Target: 4,297,920, Actual: 1,264,122, Gap: 3,033,798, Ach: 29.4%, ECharts canvas rendered)
- **Weekly Performance**: **PASS** (Target: 844,800, Actual: 350,633, Gap: 494,167, Ach: 41.5%, ECharts canvas rendered)
- **Quarterly Performance**: **PASS** (Target: 15,077,040, Actual: 4,285,288, Gap: 10,791,752, Ach: 28.4%, ECharts canvas rendered)
- **Yearly Performance**: **PASS** (Target: 34,426,787, Actual: 10,859,968, Gap: 23,566,819, Ach: 31.5%, ECharts canvas rendered)

---

## 6. Test Suite Results

- **TypeScript Compilation (`npx tsc -b`)**: **PASS** (0 errors)
- **Unit Tests (`npm test`)**: **PASS** (4 test files, 74 tests passed)
- **Production Build (`npm run build`)**: **PASS** (0 errors, 799ms)
- **Playwright Startup Diagnostic (`debug_blank_dashboard.cjs`)**: **PASS** (5/5 URLs successfully rendered)
- **Playwright Redesign Verification (`verify_target_actual_redesign.cjs`)**: **PASS** (All UI and modal checks passed)

---

## 7. Regression Checklist

- **Google Sheets Ingestion & Pipeline**: **PASS** (No changes to ingestion, normalization, or services)
- **Filters & Reactivity**: **PASS** (Verified all 4 horizons simultaneously update when selecting "Day (A)" shift filter and reset cleanly)
- **Machine Drill-Down & Hierarchy**: **PASS** (Hierarchy analysis, rankings, and modal triggers intact)
- **Target vs Actual Performance Section**: **PASS** (Unified 2x2 grid on desktop, single-column stack on tablet/mobile, [View Data Table] modal verified for Monthly and Weekly)
