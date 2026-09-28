# Repository Cleanup Audit Report

**Date:** 2026-09-28  
**Project:** Patil Group Manufacturing Performance Dashboard  
**Status:** Audit & Safe Cleanup Initial Phase Completed  

---

## 1. Executive Summary & Inventory Overview

A comprehensive audit was performed across the entire repository to identify:
- Confirmed unnecessary files (empty/stub files, dead temporary screenshots, dead styles).
- Generated artifacts and ephemeral cache directories.
- Critical required application source code, components, services, and tests.
- Dependencies, environmental secrets, and gitignore tracking rules.

### Inventory Statistics
- **Total Source Files (Frontend + Backend):** > 200 files
- **Frontend Source Files (`frontend/src`):** 81 TypeScript/TSX/CSS files
- **Backend Source Files (`backend/app`, `backend/alembic`):** 60+ Python files
- **Backend Test Suite (`backend/tests`):** 21 files, 215 tests (208 passed, 7 conditionally skipped)
- **Frontend Test Suite (`frontend/src`):** 4 test files, 74 passed unit/integration tests
- **Documentation / Specifications (`docs/` and root):** Active architectural guides + archived phase completion logs

---

## 2. File Classification Matrix

### Category A: REQUIRED — Must Keep
The following files and directories constitute active business logic, core architecture, UI rendering, authentication, and database migrations:
1. `backend/app/` — FastAPI core application (endpoints: `/api/v1/auth`, `/api/v1/manufacturing/*`, `/api/v1/dashboard/*`, `/api/v1/users`, etc.)
2. `backend/alembic/` — Database migrations (001 through 015)
3. `backend/requirements.txt`, `backend/pyproject.toml` — Backend dependencies and configurations
4. `backend/create_test_user.py` — Admin bootstrap/seeding script
5. `frontend/src/pages/ManufacturingDashboard.tsx` — Main manufacturing command center page
6. `frontend/src/pages/LoginPage.tsx`, `CreateAccountPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `UserManagementPage.tsx`, `MasterDataPage.tsx` — Enterprise authentication & RBAC pages
7. `frontend/src/components/dashboard/slides/*` — All 12 active slide components including `TargetGapAnalysisSlide.tsx`, `ExecutiveOverviewSlide.tsx`, `PeriodComparisonChart.tsx`, `TargetActualChart.tsx`, `MachineDetailModal.tsx`
8. `frontend/src/data/calculations/*` — Core business metric calculators (`targetAchievementGap.ts`, `periodEngine.ts`, `evidenceBasedInsights.ts`, `hierarchyEngine.ts`, `oeeCalculator.ts`, `productionKpis.ts`, `downtimeAnalysis.ts`, `qualityAnalysis.ts`)
9. `frontend/src/data/filters/*` — Dashboard multi-dimensional filter engine
10. `frontend/src/data/normalization/*` — DPR and Google Sheets data normalizers
11. `frontend/src/public/patil-logo.png`, `frontend/public/favicon.svg` — Brand assets referenced directly by UI
12. `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts` — Core frontend build configs
13. `README.md`, `DEPLOYMENT_CHECKLIST.md`, `GOOGLE_SHEETS_INTEGRATION_SUMMARY.md` — Core deployment and system documentation
14. `docs/PRIL_Dashboard_Master_Specification.md`, `docs/database-design.md`, `docs/DEPLOYMENT_ENVIRONMENT.md`, `docs/NAVIGATION_STATUS.md` — Active architectural specifications

### Category B: PROBABLY REQUIRED — Keep Unless Verified
1. `backend/tests/*` — All 21 backend test suites verifying OEE persistence, calculations, security, RBAC, and Google Sheets service.
2. `frontend/src/utils/format.test.ts`, `periodEngine.test.ts`, `targetAchievementGap.test.ts`, `dashboardFilterEngine.test.ts` — Vitest unit tests for financial & manufacturing calculation accuracy.
3. `Medchal_Downtime & Prod.xlsx` — Tracked reference workbook used by data ingestion pipelines and tests.
4. `frontend/src/pages/OeeDashboard.tsx` & legacy OEE components (`SnapshotTable.tsx`, `TrendChart.tsx`, `StatusBanner.tsx`, `FilterBar.tsx`, `DashboardHeader.tsx`, `BreakdownChart.tsx`) — Secondary route for plant-level OEE monitoring.
5. `frontend/src/components/ErrorBoundary.tsx` — React error boundary utility for production stability.

### Category C: OPTIONAL — Can Remove Safely / Kept with Recommendation
1. `docs/archive/*` — Historical phase reports (Phase 1 to 8 remediation reports). Kept archived inside `docs/archive/` for project historical context; not cluttering root.
2. `backend/scripts/validate_dashboard_calculations.py` — Standalone calculation verification tool against local Excel and Google Sheets. Keep as a developer CLI diagnostic tool.
3. `Medchal_Downtime & Prod (2).xlsx` — Untracked local secondary sample (2.1 MB). Currently referenced by standalone audit script. Recommended to keep locally or ignore, not commit to GitHub unless required.
4. `Production Dashboard Data.docx` — Tracked 3.1 MB specification document. Already tracked in git; do not delete to avoid breaking historical records.
5. `frontend/public/Patil Sir Picture.jpg`, `frontend/public/icons.svg` — Tracked historical assets. Kept intact because they are tracked in git repository.
6. `frontend/scripts/*.cjs` (verification scripts) — Retained `validate_post_cleanup.cjs` and regression test scripts for UI validation.

### Category D: GENERATED — Should Normally Not Be Committed (Ignored via .gitignore)
1. `node_modules/`, `frontend/node_modules/` — Ignored
2. `frontend/dist/` — Vite build output, ignored
3. `.venv/`, `backend/.venv/` — Python virtual environments, ignored
4. `__pycache__/`, `*.pyc`, `*.pyo` — Python bytecode caches, ignored
5. `.pytest_cache/`, `backend/.pytest_cache/` — Pytest test runner caches, ignored
6. `.ruff_cache/`, `backend/.ruff_cache/` — Ruff linter caches, ignored
7. `tmp/`, `backend/tmp/` — Temporary test/scratch folders, ignored
8. `scratch/` — Scratch test files directory, ignored
9. `playwright-report/`, `test-results/` — Test execution output artifacts, ignored

### Category E: TEMPORARY — Removed Confirmed Files
1. `debug_blank_dashboard.cjs` (0 bytes, empty stub) — **DELETED**
2. `PERIOD_COMPARISON_UI_FINAL_REPORT.md` (0 bytes, empty stub) — **DELETED**
3. `UI_REDESIGN_BASELINE.md` (0 bytes, empty stub) — **DELETED**
4. `frontend/src/styles/admin-pages.css` (0 bytes, empty stylesheet) — **DELETED**
5. `frontend/scripts/screenshot_dashboard.cjs` (0 bytes, empty stub) — **DELETED**
6. `frontend/scripts/smoke-dashboard.cjs` (0 bytes, empty stub) — **DELETED**
7. `frontend/scripts/verify_header_update.cjs` (0 bytes, empty stub) — **DELETED**
8. `frontend/scripts/verify_ui_polish.cjs` (0 bytes, empty stub) — **DELETED**
9. `frontend/scripts/debug_screen.png` (temporary debug screenshot artifact) — **DELETED**

### Category F: DUPLICATE — Candidate for Deletion
None identified that harm operation. `docs/archive/` houses consolidated previous phase files.

### Category G: UNKNOWN — DO NOT DELETE
None pending. All files across the repository have been categorized and mapped.

---

## 3. Dependency & Security Audit

### Package Dependencies:
- Root `package.json`: Contains `@anthropic-ai/claude-agent-sdk`. Kept intact.
- `frontend/package.json`:
  - `echarts` & `echarts-for-react`: Used in 20+ chart components.
  - `xlsx`: Used in Excel parser for manual DPR uploads.
  - `react` & `react-dom` (v19): Core framework.
  - `playwright`: Used for browser validation scripts.
- `backend/requirements.txt`:
  - `fastapi`, `uvicorn`, `sqlalchemy`, `alembic`, `psycopg`, `google-api-python-client`, `google-auth`, `openpyxl`, `PyJWT`, `bcrypt`: All actively imported and utilized.

### Secrets and Environment Variables Audit:
- `.env` and `backend/.env` are strictly excluded by `.gitignore`.
- Checked `git ls-files .env backend/.env`: Neither is tracked in git.
- Checked `.env.example` and `backend/.env.example`: Only placeholder connection strings and mock config entries exist. No plaintext API keys or private keys are committed.
- Google Service Account keys: Matched by `.gitignore` rules (`*service-account*.json`, `*.pem`, `*.key`). No private key files found tracked in Git.

---

## 4. Verification & Health Check Results

- **Backend Pytest:** 208 Passed, 7 Skipped (Skipped only due to external optional sample file check).
- **Backend Ruff & Compilation:** All Python files compiled cleanly with 0 syntax errors and clean linter checks.
- **Frontend TypeScript (`tsc -b`):** Passed with 0 errors.
- **Frontend Unit Tests (`vitest run`):** 4 test suites, 74 tests passed in 389ms.
- **Frontend Production Build (`vite build`):** Built successfully in 552ms (`dist/assets/index-BbPYf-dd.js`, `dist/assets/index-F-WZf8hV.css`).
- **Live Google Sheets Integration:** Connected (Spreadsheet ID verified, 14,899 records live synced via backend `/api/manufacturing/data`).
- **Dashboard UI & Authentication:** Fully operational. Multi-period selection (Monthly, Weekly, Quarterly, Yearly), Target vs Actual charts, and Carousel slides active.

