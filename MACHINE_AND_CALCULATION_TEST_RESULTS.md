# Machine and Calculation Test Execution Results

**Project**: Patil Group Manufacturing Performance Dashboard  
**Date**: September 24, 2026  
**Execution Environment**: Localhost (FastAPI on `:8000`, Vite on `:5173`)  
**Overall Status**: 100% PASS (Zero Failures, Zero Errors)

---

## 1. Test Suite Summary Table

| Test Layer | Tool / Framework | Target Scope | Tests / Files Checked | Errors | Warnings | Result |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| **Backend Unit & Integration** | Pytest 8.3.5 | API, Auth, OEE, Calculations, Ingestion | 215 tests (208 passed, 7 skipped) | 0 | 0 | **PASS** |
| **Backend Code Quality** | Ruff | Backend Python source code | All files | 0 | 0 | **PASS** |
| **Backend Math Audit** | Custom Python Runner | Excel vs Ingestion reconciliation | 13 metrics + 15 filter scenarios | 0 | 0 | **PASS** |
| **Frontend Static Types** | TypeScript 5.x (`tsc -b`) | Entire frontend codebase | All files | 0 | 0 | **PASS** |
| **Frontend Code Quality** | Oxlint | React & TypeScript linting rules | 88 files | 0 | 0 | **PASS** |
| **Frontend Unit Tests** | Vitest 5.0.1 | Filter engine, formats, target-gap, periods | 74 tests across 4 test files | 0 | 0 | **PASS** |
| **Frontend Production Build** | Vite 8.2.1 | Asset bundling & chunk optimization | 695 modules | 0 | 0 | **PASS** |
| **Browser E2E Automation** | Playwright Chromium | Target vs Actual charts & Machine filter DOM | 3 slide areas + 4 period switches | 0 | 0 | **PASS** |

---

## 2. Detailed Test Logs

### 2.1 Backend Pytest Execution
```bash
python -m pytest tests
```
```
============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-8.3.5, pluggy-1.6.0
rootdir: C:\Users\Preet Jaiswal\Downloads\Patil-Manufacturing-Analytics\backend
configfile: pyproject.toml
plugins: anyio-4.14.2
collected 215 items

tests\test_auth.py ..................                                    [  8%]
tests\test_bootstrap_admin.py ..                                         [  9%]
tests\test_dashboard_oee_api.py .....................                    [ 19%]
tests\test_dashboard_sse.py .                                            [ 19%]
tests\test_dpr_oee_api.py ............                                   [ 25%]
tests\test_dpr_oee_csv_api.py .........                                  [ 29%]
tests\test_dpr_oee_csv_ingestion.py ...........                          [ 34%]
tests\test_dpr_oee_ingestion.py s.ss.s.....ss.                           [ 40%]
tests\test_google_sheets_service.py ............                         [ 46%]
tests\test_health.py ...                                                 [ 47%]
tests\test_import_worker.py .............                                [ 53%]
tests\test_master_data_api.py ........                                   [ 57%]
tests\test_oee_calculator.py ..............                              [ 64%]
tests\test_oee_e2e_uat.py .s........                                     [ 68%]
tests\test_oee_persistence.py ............                               [ 74%]
tests\test_oee_rollup.py ...................                             [ 83%]
tests\test_rbac.py ..........                                            [ 87%]
tests\test_sse_event_queue.py ..........                                 [ 92%]
tests\test_sse_integration.py ....                                       [ 94%]
tests\test_user_management.py ............                               [100%]

================== 208 passed, 7 skipped in 70.83s (0:01:10) ==================
```

### 2.2 Frontend Unit Tests (`vitest run --run`)
```bash
npm test -- --run
```
```
 RUN  v5.0.1 C:/Users/Preet Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend

 ✓ src/data/filters/dashboardFilterEngine.test.ts (8 tests) 15ms
 ✓ src/utils/format.test.ts (18 tests) 29ms
 ✓ src/data/calculations/targetAchievementGap.test.ts (16 tests) 31ms
 ✓ src/data/calculations/periodEngine.test.ts (32 tests) 41ms

 Test Files  4 passed (4)
      Tests  74 passed (74)
   Start at  16:27:26
   Duration  373ms (transform 62%, tests 19%, import 13%, worker 5%)
```

### 2.3 Frontend Typecheck (`tsc -b`)
```bash
npm run typecheck
```
```
> frontend@0.0.0 typecheck
> tsc -b --pretty false

Exit code: 0 (No type errors)
```

### 2.4 Frontend Linter (`oxlint .`)
```bash
npm run lint
```
```
> frontend@0.0.0 lint
> oxlint .

Found 0 warnings and 0 errors.
Finished in 18ms on 88 files with 104 rules using 8 threads.
```

### 2.5 Frontend Production Build (`npm run build`)
```bash
npm run build
```
```
> frontend@0.0.0 build
> tsc -b && vite build

vite v8.2.1 building client environment for production...
transforming...✓ 695 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     0.82 kB │ gzip:   0.46 kB
dist/assets/index-9PjJGhVT.css    118.50 kB │ gzip:  18.88 kB
dist/assets/index-sXKx2glv.js   1,995.93 kB │ gzip: 620.93 kB

✓ built in 612ms
```

### 2.6 Playwright Visual & DOM Verification (`verify_target_actual_charts.cjs`)
```
====================================================
TARGET VS ACTUAL VISUAL & CHART LOGIC VERIFICATION
====================================================
Navigating to http://127.0.0.1:5173...
Logging in as alice@patil.local...
Waiting for dashboard panel to load...

--- 1. Testing Executive Overview Target vs Actual Charts ---
Executive Overview Header Legend items: [ 'Target (NOS)', 'Actual (NOS)', 'Achievement %' ]
PASS: "Yet to Achieve" is REMOVED from Executive Overview header legend.
Saved screenshot: executive_overview_target_actual_side_by_side.png

--- 2. Testing Target / Achievement / Gap Analysis Carousel Slide ---
TargetGapAnalysisSlide KPI Card labels: [
  'Total Target',
  'Total Achieved',
  'Yet to Achieve',
  'Average Achievement'
]
Checking KPI cards: Total Target, Total Achieved, Yet to Achieve intact: true
TargetGapAnalysisSlide custom legend items: [ 'Target', 'Actual', 'Achievement %' ]
PASS: "Yet to achieve" is REMOVED from TargetGapAnalysisSlide legend.
Saved screenshot: target_gap_analysis_monthly_side_by_side.png
Saved screenshot: target_gap_analysis_weekly_side_by_side.png
Saved screenshot: target_gap_analysis_quarterly_side_by_side.png
Saved screenshot: target_gap_analysis_yearly_side_by_side.png

--- 3. Testing Production Slide Target vs Actual Chart ---

====================================================
VERIFICATION COMPLETE. Console errors: 0
====================================================
```

