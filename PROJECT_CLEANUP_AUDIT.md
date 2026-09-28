# Patil Group Manufacturing Analytics — Project Cleanup Audit

**Audit Date**: 2026-09-23  
**Status**: Pre-Deletion Dependency & Reference Verification Complete  
**Guiding Principle**: SAFE PRODUCTION CLEANUP — WHEN IN DOUBT, KEEP THE FILE.

---

## 1. Executive Summary

This document establishes the verified inventory and dependency classification of files across the **Patil Group Manufacturing Performance Dashboard** repository. Every deletion candidate has undergone exhaustive repository-wide search across:
1. TypeScript/JavaScript source code imports & dynamic imports
2. CSS stylesheets & HTML references
3. Router definitions & component mounts
4. Backend FastAPI service and model registries
5. Alembic migrations and database tables
6. Test suites (Vitest, Pytest, Playwright)
7. Package configurations (`package.json`, `pyproject.toml`)
8. CI/CD and deployment configs (`render.yaml`, `vercel.json`, `docker-compose.yml`)

Files classified under **A through H** are strictly preserved. Only files classified as **I (Duplicate)**, **J (Unused)**, **K (Temporary)**, or **L (Generated Artifact)** with **0 active code references** are designated for deletion. All historical reports are archived to `docs/archive/`.

---

## 2. File Classification & Cleanup Audit Table

| File | Category | Used By | References Found | Decision | Reason |
|---|---|---|---|---|---|
| `frontend/src/components/dashboard/slides/DowntimeSlide.tsx` | I. DUPLICATE / J. UNUSED | None | 0 code imports, 0 CSS, 0 router refs | **DELETE** | Superseded by `DowntimeCommandCenterSlide.tsx` (Slide 5). Not imported in `index.ts` or any carousel. |
| `frontend/src/components/dashboard/slides/InsightsSlide.tsx` | I. DUPLICATE / J. UNUSED | None | 0 code imports (mentioned in 4 historical phase docs) | **DELETE** | Superseded by `ManagementInsightsSlide.tsx` (Slide 15). Not mounted anywhere in the application. |
| `frontend/src/components/dashboard/slides/PerformanceSlide.tsx` | I. DUPLICATE / J. UNUSED | None | 0 code imports (mentioned in 2 historical phase docs) | **DELETE** | Superseded by `LinePerformanceSlide.tsx` (Slide 8) and `ShiftPerformanceSlide.tsx` (Slide 9). |
| `frontend/src/components/dashboard/slides/StageMaterialSlide.tsx` | I. DUPLICATE / J. UNUSED | None | 0 code imports, 0 CSS, 0 router refs | **DELETE** | Superseded by `StageAnalyticsSlide.tsx` (Slide 11) and `MaterialPartSlide.tsx` (Slide 10). |
| `frontend/src/components/dashboard/slides/WorkCenterSlide.tsx` | I. DUPLICATE / J. UNUSED | None | 0 code imports, 0 CSS, 0 router refs | **DELETE** | Superseded by `WorkCenterAnalyticsSlide.tsx` (Slide 12) and `MachineAnalyticsSlide.tsx` (Slide 13). |
| `frontend/src/data/analysis/dataClassification.ts` | J. UNUSED | None | 0 code imports (mentioned in 1 audit doc) | **DELETE** | 533-line early prototype for mode detection. `businessDataQuality.ts` is the single active quality engine. |
| `frontend/src/data/dashboardData.ts` | J. UNUSED | None | 0 code imports, 0 type imports | **DELETE** | Phase 0 type definitions. Production record typing is centralized in `normalizeDprData.ts` and `types/dashboard.ts`. |
| `frontend/src/styles/hud-theme-overrides.css` | J. UNUSED | None | 0 imports in `App.tsx`, `index.css`, `main.tsx`, or `index.html` | **DELETE** | Experimental HUD theme overrides never imported or applied in production. |
| `frontend/public/scifi-dashboard.html` | J. UNUSED | None | 0 references in frontend or backend | **DELETE** | Standalone HTML mockup file from early UI exploration. |
| `frontend/src/assets/hero.png` | J. UNUSED | None | 0 references in any TSX, CSS, or HTML | **DELETE** | 2.4 MB unused starter template hero image asset. |
| `frontend/src/assets/react.svg` | J. UNUSED | None | 0 references in any TSX, CSS, or HTML | **DELETE** | Default Vite starter asset with zero references. |
| `frontend/src/assets/vite.svg` | J. UNUSED | None | 0 references in any TSX, CSS, or HTML | **DELETE** | Default Vite starter asset with zero references. |
| `test_flexible_import.py` | K. TEMPORARY | None | 0 imports, 0 package scripts, 0 CI workflows, 0 test runners | **DELETE** | One-off test script outside `backend/tests/`. Pytest test suite does not use it. |
| `tmp_state.txt` | K. TEMPORARY | None | 0 references | **DELETE** | Temporary text dump from 2026-09-16. |
| `tmp_val.txt` | K. TEMPORARY | None | 0 references | **DELETE** | Temporary text dump from 2026-09-16. |
| `frontend/tmp/` (entire directory) | K. TEMPORARY / L. GENERATED ARTIFACT | None | 10 temporary debug logs/scripts (`body_dump.txt`, `val_full.mjs`, etc.) | **DELETE** | Temporary debugging logs, dumps, and one-off scripts created during past UI verification. |
| `backend/tmp/backend_err.log` | K. TEMPORARY | None | 0 code references | **DELETE** | Server error log dump. |
| `backend/tmp/backend_out.log` | K. TEMPORARY | None | 0 code references | **DELETE** | Server stdout log dump. |
| `tmp/node_modules/` | L. GENERATED ARTIFACT | None | 2,439 stray dependency files inside `tmp/` | **DELETE** | Stray node_modules directory created during past script runs. |
| `tmp/*.log` & `tmp/*.txt` (dumps) | K. TEMPORARY | None | Temporary runtime logs (`backend.log`, `be_final.log`, `_alice.txt`, `_probe.txt`) | **DELETE** | Runtime test dumps and server logs. |
| `tmp/shots_.../`, `tmp/visual_qa/` | L. GENERATED ARTIFACT | None | Screenshots from past phase validation runs | **DELETE** | Outdated browser screenshots from earlier weeks. |
| `tmp/check_login.mjs` | M. UNKNOWN / USER ACTIVE | User Editor | Currently open in user's VS Code / editor | **KEEP** | **PROTECTED USER FILE**: Explicitly designated in safety conditions. |
| `tmp/flexible_import_real_test.py` | M. UNKNOWN / USER ACTIVE | User Editor | Currently open in user's VS Code / editor | **KEEP** | **PROTECTED USER FILE**: Explicitly designated in safety conditions. |
| `tmp/inspect_sheet1.py` | M. UNKNOWN / USER ACTIVE | User Editor | Currently open in user's VS Code / editor | **KEEP** | **PROTECTED USER FILE**: Explicitly designated in safety conditions. |
| `backend/tmp/inspect_medchal.py` | M. UNKNOWN / USER ACTIVE | User Editor | Open in user's editor buffer | **KEEP** | **PROTECTED USER FILE**: Explicitly designated in safety conditions. |
| `Medchal_Downtime & Prod.xlsx` | M. UNKNOWN / DEV DATASET | Local dev | Reference workbook for Medchal plant data | **KEEP** | **PROTECTED REFERENCE DATASET**: Required to remain available for offline inspection. |
| `Medchal_Downtime & Prod (2).xlsx` | M. UNKNOWN / DEV DATASET | Local dev | Reference workbook for Medchal plant data | **KEEP** | **PROTECTED REFERENCE DATASET**: Required to remain available for offline inspection. |
| `Production Dashboard Data.docx` | M. UNKNOWN / DEV SPEC | Local dev | Reference specification document | **KEEP** | **PROTECTED REFERENCE SPECIFICATION**: Development reference. |
| `frontend/src/pages/OeeDashboard.tsx` | H. LEGACY BUT REFERENCED | Backward Compat | Linked to backend OEE API endpoints (`/api/v1/dashboard/oee/...`) | **KEEP** | **PRESERVED FOR BACKWARD COMPATIBILITY**: Tested by 21 backend pytest cases. |
| `frontend/src/components/dashboard/BreakdownChart.tsx` | H. LEGACY BUT REFERENCED | `OeeDashboard.tsx` | Imported by `OeeDashboard.tsx` | **KEEP** | Preserved to maintain `OeeDashboard.tsx` integrity. |
| `frontend/src/components/dashboard/DashboardHeader.tsx` | H. LEGACY BUT REFERENCED | `OeeDashboard.tsx` | Imported by `OeeDashboard.tsx` | **KEEP** | Preserved to maintain `OeeDashboard.tsx` integrity. |
| `frontend/src/components/dashboard/FilterBar.tsx` | H. LEGACY BUT REFERENCED | `OeeDashboard.tsx` | Imported by `OeeDashboard.tsx` | **KEEP** | Preserved to maintain `OeeDashboard.tsx` integrity. |
| `frontend/src/components/dashboard/KpiCards.tsx` | H. LEGACY BUT REFERENCED | `OeeDashboard.tsx` | Imported by `OeeDashboard.tsx` | **KEEP** | Preserved to maintain `OeeDashboard.tsx` integrity. |
| `frontend/src/components/dashboard/SnapshotTable.tsx` | H. LEGACY BUT REFERENCED | `OeeDashboard.tsx` | Imported by `OeeDashboard.tsx` | **KEEP** | Preserved to maintain `OeeDashboard.tsx` integrity. |
| `frontend/src/components/dashboard/TrendChart.tsx` | H. LEGACY BUT REFERENCED | `OeeDashboard.tsx` | Imported by `OeeDashboard.tsx` | **KEEP** | Preserved to maintain `OeeDashboard.tsx` integrity. |
| `frontend/src/types/dashboard.ts` | H. LEGACY BUT REFERENCED | `OeeDashboard.tsx`, API | Types for OEE snapshots, breakdowns, plant options | **KEEP** | Required for type safety of OEE API and legacy dashboard view. |
| `frontend/src/api/dashboard.ts` | H. LEGACY BUT REFERENCED | `OeeDashboard.tsx` | Client for `/api/v1/dashboard/...` | **KEEP** | Backend endpoints are actively tested by pytest. |
| `frontend/src/data/calculations/*` (all 11 files) | A. REQUIRED PRODUCTION FILE / B. TEST | Core Engine | Imported by `ManufacturingDashboard.tsx` and all slides | **KEEP** | **CRITICAL PRODUCTION CALCULATION ENGINE**: Single source of truth for math & KPIs. |
| `frontend/src/components/dashboard/LiveGoogleSheetsSection.tsx` | A. REQUIRED PRODUCTION FILE | Dashboard UI | Renders live Google Sheets status banner & refresh button | **KEEP** | **CRITICAL LIVE GOOGLE SHEETS INTEGRATION FILE**. |
| `backend/app/services/google_sheets_service.py` | A. REQUIRED PRODUCTION FILE | Backend Service | Google Sheets API v4 client, live cache, date sync | **KEEP** | **CRITICAL LIVE GOOGLE SHEETS BACKEND SERVICE**. |
| `backend/app/api/routes/manufacturing.py` | A. REQUIRED PRODUCTION FILE | API Router | `/api/v1/manufacturing/data` and `/status` endpoints | **KEEP** | **CRITICAL LIVE GOOGLE SHEETS FASTAPI ROUTE**. |
| `backend/alembic/versions/*.py` (all 15 files) | E. REQUIRED MIGRATION FILE | Alembic | Complete migration history 001 through 015 | **KEEP** | **CRITICAL DATABASE MIGRATION INTEGRITY**: Must never be modified or deleted. |
| 21 Historical Phase Reports (in root) | G. HISTORICAL DOCUMENTATION | Development | Phase 0–8 reports, UX fixes, UI reports | **ARCHIVE** | Safely moved to `docs/archive/` per STEP 10. None are deleted. |

---

## 3. Strict Safety Compliance Confirmation
- **Migrations Intact**: 100% of Alembic migrations preserved.
- **Live Google Sheets Pipeline**: 100% preserved and active.
- **Protected Files**: `tmp/check_login.mjs`, `tmp/flexible_import_real_test.py`, `tmp/inspect_sheet1.py`, and `backend/tmp/inspect_medchal.py` are strictly protected.
- **Datasets**: `Medchal_Downtime & Prod.xlsx`, `Medchal_Downtime & Prod (2).xlsx`, `Production Dashboard Data.docx` are strictly protected.
- **No Git / Deploy**: No git commit, push, or deployment commands will be run.

