# Patil Group Manufacturing Dashboard — Calculation Data Lineage

**Audit Date**: 2026-09-24  
**Scope**: Complete end-to-end trace from source columns to backend ingestion, API response, frontend filtering, calculation engines, and final UI display.

---

## 1. Architectural Lineage Overview

```
Google Sheets (Sheet1) / Excel Workbook
   │
   ▼
[Column Extraction & Ingestion]
   │  Backend: google_sheets_service.py (_fetch_sheet_values, _build_clean_record)
   │  Raw Column Mapping: Col G → machine, Col K → productionTarget, etc.
   ▼
[Backend Canonical Dataset & Fast API Route]
   │  Route: GET /api/v1/manufacturing/data
   │  Payload: { recordCount, minDate, maxDate, data: [...] }
   ▼
[Frontend Service & DPR Normalization]
   │  Service: manufacturingApi.ts (fetchManufacturingDataset)
   │  Normalization: normalizeDprData.ts (maps to DprRecord: lineName, machineName, etc.)
   ▼
[Dashboard Filter Engine]
   │  Engine: dashboardFilterEngine.ts (applyFilters)
   │  Pipeline: Date Range → Line → Shift → Stage → Machine → Material
   ▼
[Calculation Engines]
   │  targetAchievementGap.ts (Target, Achievement, Gap, Rates)
   │  productionKpis.ts (Production, Losses, Efficiency)
   │  downtimeAnalysis.ts (Total minutes, Pareto, categories)
   │  qualityAnalysis.ts (Rejection, Defect breakdown)
   ▼
[Dashboard UI Components & Formatting]
   │  Slides (ExecutiveOverviewSlide, ProductionSlide, TargetGapAnalysisSlide, etc.)
   │  Dual Number Formatter: formatDualQuantity (Approximate + Exact)
```

---

## 2. Lineage of Major KPIs

### 1. Production Target (NOS)
1. **Source**: Google Sheets Column K (`Prod Target NOS`) / Excel cell in range `K2:K14767`.
2. **Backend Parsing**: Ingested via `google_sheets_service.py`, normalized to numeric float via `_coerce_int_or_float`.
3. **Backend API**: Emitted in `/api/v1/manufacturing/data` record array under `productionTarget` (and `prodTargetNOS`).
4. **Frontend Normalization**: `normalizeDprData.ts` reads field into `DprRecord.targetProduction`.
5. **Filter Pipeline**: `applyFilters` in `dashboardFilterEngine.ts` filters records matching user selections (Date, Line, Shift, Stage, Machine, Material).
6. **Calculation Engine**: `targetAchievementGap.ts`:
   $$\text{Production Target} = \sum \text{targetProduction}$$
7. **Display**: Formatted in KPI cards using dual format, e.g., `42.78M (42,777,962)` (all-time) or `34.22M (34,215,587)` (2026 YTD).

---

### 2. Total Production / Achievement (NOS)
1. **Source**: Google Sheets Column L (`Total PROD NOS`) / Excel cell in range `L2:L14767`.
2. **Backend Parsing**: Ingested via `google_sheets_service.py`, normalized to numeric float via `_coerce_int_or_float`.
3. **Backend API**: Emitted in `/api/v1/manufacturing/data` under `totalProduction` (and `totalPRODNOS`).
4. **Frontend Normalization**: `normalizeDprData.ts` reads field into `DprRecord.actualProductionQty`.
5. **Filter Pipeline**: Filtered through `applyFilters`.
6. **Calculation Engine**: `targetAchievementGap.ts` & `productionKpis.ts`:
   $$\text{Total Production} = \sum \text{actualProductionQty}$$
7. **Display**: Formatted in KPI cards and bar charts, e.g., `22.97M (22,971,346)`.

---

### 3. Production Loss (NOS)
1. **Source**: Google Sheets Column J (`Prod Loss NOS`) / Excel cell in range `J2:J14767`.
2. **Backend Parsing**: Normalized via `google_sheets_service.py` to `record["productionLoss"]`.
3. **Backend API**: Emitted in `/api/v1/manufacturing/data` under `productionLoss`.
4. **Frontend Normalization**: `normalizeDprData.ts` maps to `DprRecord.productionLoss`.
5. **Filter Pipeline**: Filtered through active filter criteria.
6. **Calculation Engine**: `productionKpis.ts`:
   $$\text{Production Loss} = \sum \text{productionLoss}$$
7. **Display**: Displayed on Executive Overview, Production Loss Slide, etc., e.g., `11.81M (11,814,456)`.

---

### 4. Downtime Minutes
1. **Source**: Google Sheets Column I (`Downtime Mints`) / Excel cell in range `I2:I14767`.
2. **Backend Parsing**: Normalized via `google_sheets_service.py` to `record["downtimeMinutes"]`.
3. **Backend API**: Emitted in `/api/v1/manufacturing/data` under `downtimeMinutes`.
4. **Frontend Normalization**: `normalizeDprData.ts` maps to `DprRecord.totalIdleTimeMinutes`.
5. **Filter Pipeline**: Filtered through active filter criteria.
6. **Calculation Engine**: `downtimeAnalysis.ts`:
   $$\text{Total Downtime Minutes} = \sum \text{totalIdleTimeMinutes}$$
7. **Display**: Displayed on Downtime Command Center, Downtime Root Cause slides, e.g., `2.24M (2,240,593.5 min)`.

---

### 5. Rejection (NOS)
1. **Source**: Google Sheets Column M (`Rejection`) / Excel cell in range `M2:M14767`.
2. **Backend Parsing**: Normalized via `google_sheets_service.py` to `record["rejection"]`.
3. **Backend API**: Emitted in `/api/v1/manufacturing/data` under `rejection`.
4. **Frontend Normalization**: `normalizeDprData.ts` maps to `DprRecord.totalRejectionQty`.
5. **Filter Pipeline**: Filtered through active filter criteria.
6. **Calculation Engine**: `qualityAnalysis.ts`:
   $$\text{Total Rejection} = \sum \text{totalRejectionQty}$$
7. **Display**: Displayed on Quality Slide, KPI cards, e.g., `92.4K (92,376)`.

---

### 6. Production Gap (NOS)
1. **Source Lineage**: Computed from Production Target and Actual Production.
2. **Calculation Formula**:
   $$\text{Production Gap} = \text{Production Target} - \text{Total Production}$$
3. **Calculation Engine**: `targetAchievementGap.ts` (`metrics.gap`).
4. **Display**: Displayed on Target / Achievement / Gap Analysis slide, e.g., `19.81M (19,806,616)`.

---

### 7. Achievement %
1. **Source Lineage**: Ratio of Total Production to Production Target.
2. **Calculation Formula**:
   $$\text{Achievement \%} = \begin{cases} \left(\frac{\text{Total Production}}{\text{Production Target}}\right) \times 100 & \text{if Production Target} > 0 \\ 0 & \text{otherwise} \end{cases}$$
3. **Calculation Engine**: `targetAchievementGap.ts` (`metrics.achievementRate`).
4. **Display**: Formatted with 2 decimal places and progress bars, e.g., `53.70%`.

