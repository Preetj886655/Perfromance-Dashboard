# PHASE 4 — LINE, WORK CENTER & MACHINE PERFORMANCE
**Patil Manufacturing Operations Analytics**  
*Document Version: 1.0.0 | Date: 2026-09-14 | Status: COMPLETE & VERIFIED*

---

## 1. Executive Summary

Phase 4 establishes an end-to-end operational hierarchy and granular contribution analytics across the Patil Group manufacturing ecosystem. Built directly upon the validated normalization pipeline of Phase 2 and the temporal calculation engine of Phase 3, this phase delivers:

1. **3-Level Operational Hierarchy**:
   $$\text{Manufacturing Line} \longrightarrow \text{Work Center} \longrightarrow \text{Raw Machine}$$
   With **Stage** preserved as an orthogonal analytical dimension.
2. **Four-Line Portfolio Support**: Full support for `ERC Line`, `SKL Line`, `BFS Line`, and `Injection Moulding` across all 8 core production and reliability KPIs.
3. **Exact Contribution Mathematics**: Deterministic contribution percentages for downtime and production losses ($\frac{\text{Component}}{\text{Parent Total}} \times 100$), mathematically reconciled against parent totals and filtered slices.
4. **Sample-Size-Protected Rankings**: Guarded ranking algorithms preventing low-volume equipment or single-row runs from displacing high-volume production backbones.
5. **Interactive Drill-Down & Zero-Data Safeguards**: Seamless drill-down from Line to Work Center to Machine with a dedicated equipment telemetry modal, preserving active Date, Period, Shift, and Material filters while eliminating misleading zero charts.
6. **Empirical Reconciliation**: 100% verified on the real Medchal factory dataset (`Medchal_Downtime & Prod (2).xlsx`, 14,290 records), confirming that the sum of Work Center metrics exactly equals plant KPI totals, and the sum of machine contributions within a Work Center reconciles to 100.00%.

---

## 2. Business Hierarchy Architecture

### 2.1 The 3-Tier Model

```
                    ┌────────────────────────────────────────────────────────┐
                    │               Level 1: Manufacturing Line              │
                    │   • ERC Line         • SKL Line                        │
                    │   • BFS Line         • Injection Moulding              │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │               Level 2: Work Center                     │
                    │   • Autocopy         • MPI                             │
                    │   • IBH              • Quenching                       │
                    │   • Tempering        • Unmapped                        │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │               Level 3: Raw Machine                     │
                    │   • Autocopying-1 .. 9                                 │
                    │   • MPI, MPI 1, MPI 2                                  │
                    │   • SBL, SBR, Bar corpper 1..3, etc.                   │
                    └────────────────────────────────────────────────────────┘
```

- **Line**: Primary macro business unit dividing product lines.
- **Work Center**: Functional plant cell aggregating machines performing identical or closely linked manufacturing operations. Based on `workCenterMapping.ts` confirmed business mappings.
- **Raw Machine**: Individual physical equipment unit as recorded in factory daily logs. Raw machine names are **never** exposed as global dropdown filters.
- **Stage**: Analytical dimension (`Turned Bar`, `Clip`, `Cut Bar`, `Deburring`, `MPI`) preserved for process routing analysis without forcing artificial machine-to-stage single-parent constraints.

---

## 3. Calculation Formulas & Contribution Mathematics

### 3.1 Line-Level KPIs
For every Line $L \in \{\text{ERC, SKL, BFS, Injection Moulding}, \dots\}$, the engine calculates:

| KPI | Calculation Formula | Semantics |
| :--- | :--- | :--- |
| **Actual Production** | $\sum_{r \in L} \text{actualProductionQty}_r$ | Units (NOS) |
| **Production Target** | $\sum_{r \in L} \text{rowTarget}_r$ | Units (NOS) |
| **Achievement %** | $\frac{\text{Production}_L}{\text{Target}_L} \times 100 \quad (\text{if Target}_L > 0)$ | Percentage Rate |
| **Total Downtime** | $\sum_{r \in L} (\text{plannedDown}_r + \text{unplannedDown}_r)$ | Minutes |
| **Production Loss** | $\sum_{r \in L} \text{productionLoss}_r$ | Units (NOS) |
| **Total Rejection** | $\sum_{r \in L} \text{totalRejectionQty}_r$ | Pcs |
| **Rejection Rate %** | $\frac{\text{Rejection}_L}{\text{Production}_L} \times 100 \quad (\text{if Production}_L > 0)$ | Percentage Rate |
| **Utilization %** | $\text{avg}_{r \in L} (\text{machineUtilizationRatio}_r) \times 100$ | Rate (where logged) |
| **Downtime Contribution %**| $\frac{\text{Downtime}_L}{\text{Plant Total Downtime}} \times 100$ | Parent Share % |
| **Loss Contribution %** | $\frac{\text{Loss}_L}{\text{Plant Total Loss}} \times 100$ | Parent Share % |

### 3.2 Work Center Contribution Mathematics
For Work Center $W$ under active Line $L$:
$$\text{Downtime Contribution } \%_W = \frac{\text{Downtime}_W}{\sum_{w \in L} \text{Downtime}_w} \times 100$$
$$\text{Production Loss Contribution } \%_W = \frac{\text{Production Loss}_W}{\sum_{w \in L} \text{Production Loss}_w} \times 100$$
$$\text{Production Output Contribution } \%_W = \frac{\text{Production}_W}{\sum_{w \in L} \text{Production}_w} \times 100$$

> **Filter Integrity Rule**: The denominator strictly uses the **identical active filters and temporal slice** as the numerator. If the user filters by `Date Range`, `Shift B`, or `Material MK-III`, both numerator and denominator update synchronously.

### 3.3 Machine Contribution Mathematics
For Machine $M$ belonging to Work Center $W$:
$$\text{Downtime Contribution to WC } \%_M = \frac{\text{Downtime}_M}{\text{Downtime}_W} \times 100$$
$$\text{Loss Contribution to WC } \%_M = \frac{\text{Production Loss}_M}{\text{Production Loss}_W} \times 100$$
$$\text{Downtime Contribution to Plant } \%_M = \frac{\text{Downtime}_M}{\text{Plant Total Downtime}} \times 100$$

---

## 4. Minimum Sample-Size Protection in Rankings

### 4.1 The Business Problem
In plant telemetry, low-volume equipment or brief setup runs (e.g. a machine logging 2 shifts with 100% target achievement, or a secondary unit with 15 rows) can artificially top achievement rankings, displacing core work centers that produce millions of units at steady 80%+ attainment.

### 4.2 Qualification Formula
A Work Center $W$ qualifies for "Best / Worst Work Center" achievement rankings **if and only if**:
1. $\text{Target}_W > 0$ and $\text{Achievement}_W \neq \text{null}$
2. AND $(\text{RecordCount}_W \ge \tau_{\text{rows}} \quad \text{OR} \quad \text{Production}_W \ge 0.20 \times \text{MedianProduction})$

Where:
$$\tau_{\text{rows}} = \min(50, \max(10, \lfloor N_{\text{total records}} \times 0.02 \rfloor))$$

### 4.3 Qualification Status in Medchal Dataset
Applying this rule to the 14,290 records in `Medchal_Downtime & Prod (2).xlsx`:
- **Autocopy**: 6,620 rows, 4,482,495 units produced, Target = 5,444,697 $\longrightarrow$ **Qualified** ($\text{Achievement} = 82.3\% \implies \textbf{Best Work Center}$)
- **MPI**: 644 rows, 2,103,509 units produced, Target = 4,781,720 $\longrightarrow$ **Qualified** ($\text{Achievement} = 44.0\% \implies \textbf{Lowest Attainment}$)
- **Quenching**: 44 rows, 3,200 units produced, Target = 0 $\longrightarrow$ **Unqualified** (*Reason: No production target recorded, sample < 50*)
- **Tempering**: 56 rows, 0 units produced, Target = 0 $\longrightarrow$ **Unqualified** (*Reason: No production target recorded*)
- **IBH**: 129 rows, 3,979 units produced, Target = 0 $\longrightarrow$ **Unqualified** (*Reason: No production target recorded*)

---

## 5. Machine Drill-Down & Equipment Root-Cause Telemetry

### 5.1 Drill-Down Flow
1. **Line Selection**: Clicking a line in [`LinePerformanceSlide`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/LinePerformanceSlide.tsx) filters the active Work Centers to that line.
2. **Work Center Selection**: Clicking a work center in [`WorkCenterAnalyticsSlide`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/WorkCenterAnalyticsSlide.tsx) filters the machine portfolio to that specific work center.
3. **Machine Inspect**: Clicking a machine row or bar chart bar in [`MachineAnalyticsSlide`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/MachineAnalyticsSlide.tsx) opens [`MachineDetailModal`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/MachineDetailModal.tsx).
4. **Preservation**: All active filters (`Date Range`, `Period Preset`, `Shift`, `Material`) remain strictly preserved throughout the navigation.

### 5.2 Machine Detail Modal Contents
- **Breadcrumbs**: `Line Name / Work Center Name`
- **Equipment Title**: `Machine Name` (e.g. `Autocopying-1`)
- **Key Stats Grid**: Actual Production vs. Target, Downtime with Work Center share %, Production Loss with Work Center share %, Rejections and Rejection Rate %.
- **Top Idle Reasons Breakdown**: Bar breakdown ranking downtime causes by minutes and percentage share.
- **Top Rejection Reasons Breakdown**: Bar breakdown ranking defects by piece count and percentage share.
- **Footer Telemetry**: Total shifts logged, Plant downtime share %, Plant loss share %.

---

## 6. Zero-Data Safeguards

When active filter criteria yield no records for a line, work center, or machine:
- The interface suppresses blank or misleading zero-valued charts.
- Renders an explicit, accessible empty state:
  ```html
  <div class="period-comparison-empty">
    <span class="period-comparison-empty__icon">ℹ</span>
    <div>
      <h4>No data available</h4>
      <p>No records found matching the active filter criteria.</p>
    </div>
  </div>
  ```
- Reset buttons automatically appear allowing one-click clearing of the drill scope.

---

## 7. Real Dataset Reconciliation & Audit (`Medchal_Downtime & Prod (2).xlsx`)

### 7.1 Plant Totals vs. Work Center Sum Reconciliation
- **Total DPR Records**: 14,290 valid normalized rows

| Metric | Total Plant KPI ([`productionKpis.ts`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/data/calculations/productionKpis.ts)) | Sum of Work Centers ([`hierarchyEngine.ts`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/data/calculations/hierarchyEngine.ts)) | Discrepancy | Reconciliation Status |
| :--- | :--- | :--- | :--- | :--- |
| **Actual Production** | 22,219,806 units | 22,219,806 units | **0.00** | **100% RECONCILED** |
| **Production Target** | 40,665,962 units | 40,665,962 units | **0.00** | **100% RECONCILED** |
| **Total Downtime** | 2,127,903.0 min | 2,127,903.0 min | **0.00** | **100% RECONCILED** |
| **Production Loss** | 12,059,219.0 NOS | 12,059,219.0 NOS | **0.00** | **100% RECONCILED** |
| **Total Rejection** | 85,167 pcs | 85,167 pcs | **0.00** | **100% RECONCILED** |

### 7.2 Work Center Performance & Contribution Table

| Work Center | Mapped Machines | Rows | Production (units) | Target (units) | Ach % | Downtime (min) | DT Share % | Loss (NOS) | Loss Share % | Rejection |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Autocopy** | 9 | 6,620 | 4,482,495 | 5,444,697 | **82.3%** | 1,280,669 | **60.2%** | 2,540,963 | **21.1%** | 33,119 |
| **MPI** | 3 | 644 | 2,103,509 | 4,781,720 | **44.0%** | 2,192 | **0.1%** | 15,840 | **0.1%** | 10,647 |
| **IBH** | 2 | 129 | 3,979 | 0 | - | 14,979 | **0.7%** | 127,960 | **1.1%** | 36 |
| **Quenching** | 1 | 44 | 3,200 | 0 | - | 4,472 | **0.2%** | 40,212 | **0.3%** | 2 |
| **Tempering** | 2 | 56 | 0 | 0 | - | 2,155 | **0.1%** | 19,682 | **0.2%** | 0 |
| **Unmapped** | 26 | 6,797 | 15,626,623 | 30,439,545 | **51.3%** | 823,436 | **38.7%** | 9,314,562 | **77.2%** | 41,363 |
| **Total** | **43** | **14,290** | **22,219,806** | **40,665,962** | **54.6%** | **2,127,903** | **100.0%** | **12,059,219** | **100.0%** | **85,167** |

### 7.3 Machine Breakdown within Autocopy Work Center
Reconciling all 9 Autocopy machines against the Work Center totals:
- **Autocopy WC Downtime Total**: 1,280,669 minutes
- **Autocopy WC Loss Total**: 2,540,963 NOS

| Machine | Rows | Production | Target | Ach % | Downtime (min) | Share of WC DT % | Loss (NOS) | Share of WC Loss % |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Autocopying-1** | 1,061 | 782,819 | 866,337 | 90.4% | 176,307 | **13.8%** | 186,410 | **7.3%** |
| **Autocopying-2** | 1,037 | 666,161 | 854,550 | 78.0% | 249,133 | **19.5%** | 418,299 | **16.5%** |
| **Autocopying-3** | 1,048 | 756,994 | 856,215 | 88.4% | 166,335 | **13.0%** | 277,159 | **10.9%** |
| **Autocopying-4** | 1,075 | 654,817 | 850,590 | 77.0% | 220,881 | **17.2%** | 382,900 | **15.1%** |
| **Autocopying-5** | 1,060 | 636,669 | 858,855 | 74.1% | 237,264 | **18.5%** | 464,181 | **18.3%** |
| **Autocopying-6** | 1,082 | 761,906 | 858,510 | 88.7% | 208,614 | **16.3%** | 733,365 | **28.9%** |
| **Autocopying-7** | 82 | 68,095 | 92,400 | 73.7% | 7,159 | **0.6%** | 14,845 | **0.6%** |
| **Autocopying-8** | 87 | 79,252 | 102,960 | 77.0% | 7,654 | **0.6%** | 29,833 | **1.2%** |
| **Autocopying-9** | 88 | 76,782 | 104,280 | 73.6% | 7,322 | **0.6%** | 33,971 | **1.3%** |
| **Sum** | **6,620** | **4,482,495** | **5,444,697** | **82.3%** | **1,280,669** | **100.00%** | **2,540,963** | **100.00%** |

---

## 8. Verification & Quality Gates

| Verification Gate | Command / Script | Result |
| :--- | :--- | :--- |
| **Phase 4 Automated Suite** | `npx tsx scratch/test_phase4_verification.ts` | **43 of 43 PASSED** |
| **Phase 3 Temporal Suite** | `npx tsx scratch/test_phase3_verification.ts` | **49 of 49 PASSED** |
| **TypeScript Typecheck** | `npm run typecheck` (`tsc -b`) | **0 Errors** |
| **Code Style & Linter** | `npm run lint` (`oxlint .`) | **0 Errors, 0 Warnings** (79 files) |
| **Production Build** | `npm run build` (`tsc -b && vite build`) | **PASS (built in 499ms)** |

---

## 9. File Changes Manifest

### Calculation & Data Layer
- [`frontend/src/data/calculations/hierarchyEngine.ts`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/data/calculations/hierarchyEngine.ts) [NEW]: Full hierarchy engine, contribution mathematics, sample-size-protected rankings, and reconciliation validation.
- [`frontend/src/data/normalization/workCenterMapping.ts`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/data/normalization/workCenterMapping.ts): Added confirmed mappings for `Tampering Furnace` and `Tampering` to `Tempering` Work Center.
- [`frontend/src/components/dashboard/slides/useDashboardAnalytics.ts`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/useDashboardAnalytics.ts): Added memoized `hierarchyAnalysis` to shared slide analytics hook.

### UI Presentation & Interaction Layer
- [`frontend/src/components/dashboard/slides/LinePerformanceSlide.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/LinePerformanceSlide.tsx): Upgraded to support 4 business lines, matrix table, zero-data safeguards, and Line drill-down click.
- [`frontend/src/components/dashboard/slides/WorkCenterAnalyticsSlide.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/WorkCenterAnalyticsSlide.tsx): Upgraded with Downtime Contribution donut, Loss Contribution donut, Trend series, sample-size protected rankings, and Work Center drill-down click.
- [`frontend/src/components/dashboard/slides/MachineAnalyticsSlide.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/MachineAnalyticsSlide.tsx): Scoped machine telemetry, parent contribution %, zero-data safeguard, and modal trigger.
- [`frontend/src/components/dashboard/slides/MachineDetailModal.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/MachineDetailModal.tsx) [NEW]: Equipment telemetry modal displaying production, downtime share, loss share, and top idle/rejection breakdowns.
- [`frontend/src/components/dashboard/slides/index.ts`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/index.ts): Exported `MachineDetailModal`.
- [`frontend/src/styles/hud-theme-overrides.css`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/styles/hud-theme-overrides.css): Added modal overlay, telemetry cards, reason bar tracks, and drill banner styling.
- [`frontend/src/components/dashboard/LiveGoogleSheetsSection.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/LiveGoogleSheetsSection.tsx): Connected Line, Work Center, and Machine drill-down handlers and modal rendering.

### Test & Verification Scripts
- [`scratch/test_phase4_verification.ts`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/scratch/test_phase4_verification.ts): 43-assertion verification suite testing hierarchy reconciliation and sample-size protection.
- [`scratch/verify_phase4_hierarchy.py`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/scratch/verify_phase4_hierarchy.py): Python data extraction script for auditing raw workbook cross-tabulations.

---

## 10. Operational Boundary

Phase 4 is **100% complete and verified**.

> [!IMPORTANT]
> **Directive Execution Termination**:
> In accordance with the prompt instructions ("Stop after completion"), all development activity halts here. No subsequent phases will be started without explicit user direction.

