# PHASE 3 — TIME-BASED MANUFACTURING ANALYTICS
**Patil Manufacturing Operations Analytics**  
*Document Version: 1.0.0 | Date: 2026-09-14 | Status: COMPLETE & VERIFIED*

---

## 1. Executive Summary

Phase 3 establishes a mathematically rigorous, unified **Time-Based Manufacturing Analytics Engine** for the Patil Group Operations Dashboard. Prior to this phase, date filtering was uncoordinated across slides, previous period comparisons were absent or hardcoded, and rate-versus-volume percentage metrics were conflated.

This implementation delivers:
1. **Shared Period Engine (`periodEngine.ts`)**: A single centralized calculation utility supporting 10 period configurations (Current/Previous Week, Current/Previous Month, Current/Previous Quarter, Current/Previous Year, All Data, and Custom Date Range) anchored to the **real clock time (`new Date()`)**, never artificially pinned to dataset maximum dates.
2. **Strict Metric Semantics**:
   - **Rate Metrics** (Achievement %, Rejection Rate %, Machine Utilization %, OEE %): Exclusively formatted as **Percentage Points (`p.p.`)** for deltas.
   - **Volume Metrics** (Production, Target, Loss NOS, Downtime min, Rejection pcs): Formatted as **Percentage Growth (`%`)** alongside absolute quantity deltas.
3. **Metric Polarity & Business Health**: Explicit `"higher-is-better"` vs. `"lower-is-better"` polarity handling ensuring downtime and rejection reductions are highlighted as positive (`good`), while production or achievement drops trigger warning or critical alerts.
4. **9 Key Performance Indicators**: Production, Target, Achievement, Production Loss, Downtime, Rejection, Rejection Rate, Machine Utilization, and OEE (strictly flagged as `"Not Available"` when underlying factory parameters are missing).
5. **Combined Dimension Filtering**: Seamless combination of temporal windows with multi-select plant dimensions (Line, Shift, Work Center, Material).
6. **Visual & Analytical Integration**: Clustered volume comparison charts, movement badges, and dynamic period-aware executive management commentary across all dashboard slides.
7. **Empirical Validation**: 100% verified against the real Medchal factory workbook (`Medchal_Downtime & Prod (2).xlsx`, 14,290 valid production records spanning 2024 to September 2026).

---

## 2. Shared Period Engine Architecture

The period engine is located at [`frontend/src/data/calculations/periodEngine.ts`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/data/calculations/periodEngine.ts).

### 2.1 Period Presets & Boundary Mathematics

| Preset | Current Window Formula | Previous Window Formula | Default Granularity |
| :--- | :--- | :--- | :--- |
| **Current Week** | Current Monday $\to$ Sunday (`addDays(ref, -(isoDay - 1))`) | Preceding Monday $\to$ Sunday (`addDays(currMonday, -7)`) | Daily |
| **Previous Week** | Preceding Monday $\to$ Sunday | Two weeks ago Monday $\to$ Sunday | Daily |
| **Current Month** | $1^{\text{st}}$ of current month $\to$ Last day of month | $1^{\text{st}}$ of previous month $\to$ Last day of previous month | Weekly |
| **Previous Month** | $1^{\text{st}}$ of previous month $\to$ Last day of previous month | $1^{\text{st}}$ of two months ago $\to$ Last day of two months ago | Weekly |
| **Current Quarter** | $1^{\text{st}}$ of quarter $\to$ Last day of quarter (`qStart = Math.floor(m / 3) * 3`) | Preceding quarter (handles Q1 $\to$ Q4 of prior year) | Monthly |
| **Previous Quarter** | Preceding quarter | Prior quarter | Monthly |
| **Current Year** | January 1 $\to$ December 31 of current calendar year | January 1 $\to$ December 31 of preceding calendar year | Monthly |
| **Previous Year** | January 1 $\to$ December 31 of previous calendar year | January 1 $\to$ December 31 of two years prior | Monthly |
| **Custom Range** | User-selected `start` $\to$ `end` | Symmetric preceding window: length $N$ days immediately prior | Dynamic (Daily $\le$ 14d, Weekly $\le$ 90d, Monthly > 90d) |
| **All Available** | Full dataset unbounded (`start = ""`, `end = ""`) | No comparison period (`hasPreviousData = false`) | Monthly |

### 2.2 Calendar Rules & Edge Case Guarantees

1. **Real Current Date Clock**: All period windows compute dynamically from `new Date()` (or an injected reference clock for deterministic testing). The current period is never anchored to `max(record.date)`.
2. **Local Date Math**: Avoids UTC conversion day-shifts (e.g. `2026-08-01 00:00:00 UTC` shifting to `2026-07-31` in negative UTC offsets). All ISO strings format via local year, month, and day components (`toIsoDateString`).
3. **ISO 8601 Week Standard**: Weeks start on Monday (`isoDay = 1`) and conclude on Sunday (`isoDay = 7`). ISO week numbering and year attribution are computed via `getIsoWeekInfo(date)` conforming to ISO 8601.
4. **Leap Year Verification**: Implements astronomical Gregorian leap year rules `(year % 4 === 0 && year % 100 !== 0) || year % 400 === 0`. Accurately resolves February 29 in leap years (e.g., 2024, 2000) and February 28 in non-leap years (e.g., 2025, 1900).
5. **Quarter Year-Crossover**: When resolving Q1 (January–March), the preceding quarter correctly rolls over to Q4 of the previous calendar year (October 1–December 31).
6. **Symmetric Custom Windows**: For an arbitrary custom range of $N$ days (e.g., Aug 11 to Aug 20 = 10 days), the preceding window is calculated as the exact preceding $N$ consecutive days (Aug 1 to Aug 10 = 10 days).

---

## 3. Metric Semantics & Delta Mathematics

### 3.1 Rate vs. Volume Distinction

Confusing percentage growth (`%`) with percentage points (`p.p.`) creates severe operational misinterpretations in manufacturing analytics. Phase 3 strictly segregates these two metric classes:

#### Rate Metrics
- **Metrics**: Production Achievement %, Rejection Rate %, Machine Utilization %, OEE %.
- **Delta Formula**:
  $$\Delta_{\text{abs}} = \text{Current Rate} - \text{Previous Rate}$$
- **Formatting Rule**: Always formatted as **Percentage Points (`p.p.`)**, e.g., `+2.4 p.p.` or `-11.3 p.p.`.
- **Constraint**: **Never** formatted with a `%` sign for deltas. An achievement moving from 20% to 25% is a `+5.0 p.p.` increase, NOT `+25%`.

#### Volume / Count Metrics
- **Metrics**: Production (units/NOS), Target (units/NOS), Production Loss (NOS), Downtime (minutes), Rejection (pcs).
- **Delta Percentage Formula**:
  $$\Delta_{\%} = \frac{\text{Current} - \text{Previous}}{|\text{Previous}|} \times 100 \quad (\text{if Previous} \neq 0)$$
- **Formatting Rule**: Formatted as **Percentage Growth (`%`)** alongside absolute quantity, e.g., `-36.2% (-666,894 units)`.

### 3.2 Polarity & Variance Health Status

Every metric delta is evaluated against its business polarity to assign health styling (`good`, `warning`, `critical`, `neutral`):

| Metric | Business Polarity | Good Condition | Warning Condition | Critical Condition |
| :--- | :--- | :--- | :--- | :--- |
| **Production** | Higher is better | $\Delta_{\%} \ge 0\%$ | $-15\% \le \Delta_{\%} < 0\%$ | $\Delta_{\%} < -15\%$ |
| **Target** | Higher is better | $\Delta_{\%} \ge 0\%$ | $-15\% \le \Delta_{\%} < 0\%$ | $\Delta_{\%} < -15\%$ |
| **Achievement** | Higher is better | $\Delta_{\text{abs}} \ge 0 \text{ p.p.}$ | $-5.0 \text{ p.p.} \le \Delta_{\text{abs}} < 0$ | $\Delta_{\text{abs}} < -5.0 \text{ p.p.}$ |
| **Machine Utilization** | Higher is better | $\Delta_{\text{abs}} \ge 0 \text{ p.p.}$ | $-5.0 \text{ p.p.} \le \Delta_{\text{abs}} < 0$ | $\Delta_{\text{abs}} < -5.0 \text{ p.p.}$ |
| **OEE** | Higher is better | $\Delta_{\text{abs}} \ge 0 \text{ p.p.}$ | $-5.0 \text{ p.p.} \le \Delta_{\text{abs}} < 0$ | $\Delta_{\text{abs}} < -5.0 \text{ p.p.}$ |
| **Downtime (min)** | Lower is better | $\Delta_{\%} \le 0\%$ | $0\% < \Delta_{\%} \le 15\%$ | $\Delta_{\%} > 15\%$ |
| **Production Loss (NOS)**| Lower is better | $\Delta_{\%} \le 0\%$ | $0\% < \Delta_{\%} \le 15\%$ | $\Delta_{\%} > 15\%$ |
| **Rejection (pcs)** | Lower is better | $\Delta_{\%} \le 0\%$ | $0\% < \Delta_{\%} \le 15\%$ | $\Delta_{\%} > 15\%$ |
| **Rejection Rate** | Lower is better | $\Delta_{\text{abs}} \le 0 \text{ p.p.}$ | $0 < \Delta_{\text{abs}} \le 0.5 \text{ p.p.}$ | $\Delta_{\text{abs}} > 0.5 \text{ p.p.}$ |

> **Operational Impact**: A 7.1% reduction in factory downtime is flagged as **`good`** (green), whereas a 36.2% reduction in production is flagged as **`critical`** (red).

---

## 4. Uncalculable Metric Policy (OEE on Medchal Dataset)

### Ground Truth Audit
- Real-world OEE requires three foundational factors:
  $$\text{OEE} = \text{Availability Ratio} \times \text{Performance Ratio} \times \text{Quality Ratio}$$
- The official Medchal spreadsheet (`Medchal_Downtime & Prod (2).xlsx`) provides:
  - Total Idle Time / Downtime minutes
  - Actual Production Quantity
  - Rejection Quantity
  - Target Quantity
- **Missing Parameters**: The spreadsheet lacks planned operating time baselines, ideal cycle time parameters per part/die, and logged Availability and Performance factor percentages.
- **Enforced Policy**:
  - In `periodEngine.comparePeriods`, if either current or previous period cannot compute a valid, non-null, finite OEE percentage, `comp.oee` evaluates strictly to `null`.
  - The UI explicitly renders `"Not Available (source lacks A & P factors)"` with an informational status rather than fabricating or displaying misleading numbers.

---

## 5. Combined Filtering Architecture

The analytics pipeline maintains full composability across time and operational hierarchy:

```
                      [ User Filter Controls in FilterBar ]
                                        │
           ┌────────────────────────────┴────────────────────────────┐
           ▼                                                         ▼
[ Period Preset / Custom Date Range ]             [ Plant Operational Dimensions ]
           │                                                         │
           ▼                                                         │
   PeriodWindow Resolution                                           │
  ┌───────────────────────────────┐                                  │
  │ Current:  [Start ... End]     │                                  │
  │ Previous: [PrevStart ... End] │                                  │
  └───────┬───────────────┬───────┘                                  │
          │               │                                          │
          ▼               ▼                                          │
   Date Slice:      Date Slice:                                      │
   Current Live     Previous Live                                    │
   Records          Records                                          │
          │               │                                          │
          └───────┬───────┘                                          │
                  ▼                                                  ▼
          [ Multi-Dimensional Filter Application ] ◄─────────────────┘
          • Line Name == selectedLine
          • Shift == selectedShift
          • Work Center == selectedWorkCenter
          • Material == selectedMaterial
                  │
                  ├───────────────────────────────┐
                  ▼                               ▼
       Filtered Current Records        Filtered Previous Records
                  │                               │
                  └───────────────┬───────────────┘
                                  ▼
                    [ useDashboardAnalytics Hook ]
                    • calculateProductionKpis
                    • calculateDowntimeAnalysis
                    • calculateQualityAnalysis
                    • comparePeriods(curr, prev)
                    • buildGranularTrendSeries(curr, granularity)
                                  │
                                  ▼
                    [ Slide Presentation Layer ]
                    • ExecutiveOverviewSlide (KPI Cards + PeriodComparisonChart)
                    • ProductionSlide (Granular Trend: Daily/Weekly/Monthly)
                    • Downtime, Loss, Quality Slides (Variance polarity indicators)
                    • ManagementInsightsSlide (Automated trend commentary)
```

---

## 6. Real Dataset Validation (`Medchal_Downtime & Prod (2).xlsx`)

The period engine was validated against the complete Medchal workbook comprising 14,290 valid normalized records.

### 6.1 Sample Audit 1: August 2026 vs. July 2026 (Full Month Comparison)
- **August 2026 Records**: 902 rows (`2026-08-01` to `2026-08-31`)
- **July 2026 Records**: 886 rows (`2026-07-01` to `2026-07-31`)

| Metric | July 2026 (Previous) | August 2026 (Current) | Delta Formatted | Delta Class | Variance Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Actual Production** | 1,844,030 units | 1,177,136 units | **-36.2%** (-666,894 units) | Volume | `critical` |
| **Production Target** | 5,497,800 units | 5,281,320 units | **-3.9%** (-216,480 units) | Volume | `warning` |
| **Production Achievement**| 33.5% | 22.3% | **-11.3 p.p.** | Rate | `critical` |
| **Production Loss (NOS)** | 1,127,364 NOS | 803,827 NOS | **-28.7%** (-323,537 NOS) | Volume | `good` |
| **Total Downtime** | 170,880.5 min | 158,789.9 min | **-7.1%** (-12,090.6 min) | Volume | `good` |
| **Total Rejection** | 10,172 pcs | 8,290 pcs | **-18.5%** (-1,882 pcs) | Volume | `good` |
| **Rejection Rate** | 0.6% | 0.7% | **+0.2 p.p.** | Rate | `warning` |
| **Machine Utilization** | 0.0% (unavail) | 0.0% (unavail) | **0.0 p.p.** | Rate | `neutral` |
| **OEE** | N/A | N/A | **Not Available** | Rate | `neutral` |

### 6.2 Sample Audit 2: August 2026 Weekly Aggregations (ISO Weeks)
When viewed under weekly granularity, August 2026 is partitioned into 6 ISO week buckets:

| ISO Week | Bucket Key | Actual Production | Production Target | Achievement % |
| :--- | :--- | :--- | :--- | :--- |
| **W31 (2026)** | `2026-W31` (Aug 1–2) | 40,598 | 300,960 | 13.5% |
| **W32 (2026)** | `2026-W32` (Aug 3–9) | 344,873 | 1,067,880 | 32.3% |
| **W33 (2026)** | `2026-W33` (Aug 10–16) | 239,225 | 1,061,280 | 22.5% |
| **W34 (2026)** | `2026-W34` (Aug 17–23) | 266,848 | 1,330,560 | 20.1% |
| **W35 (2026)** | `2026-W35` (Aug 24–30) | 265,127 | 1,330,560 | 19.9% |
| **W36 (2026)** | `2026-W36` (Aug 31) | 20,465 | 190,080 | 10.8% |
| **August Total** | **Full Month** | **1,177,136** | **5,281,320** | **22.3%** |

---

## 7. Edge-Case Test Suite Results

The verification script [`scratch/test_phase3_verification.ts`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/scratch/test_phase3_verification.ts) executed directly via Node/TSX against the codebase:

```text
==================================================
1. CALENDAR EDGE CASE TESTS
==================================================
[Test 1.1] Month Boundary:
  ✓ PASS: Aug 31 reference resolves to 2026-08-01 -> 2026-08-31
  ✓ PASS: Aug 31 previous month resolves to 2026-07-01 -> 2026-07-31
  ✓ PASS: Sep 1 reference resolves to 2026-09-01 -> 2026-09-30
  ✓ PASS: Sep 1 previous month resolves to 2026-08-01 -> 2026-08-31

[Test 1.2] Quarter Boundary:
  ✓ PASS: Q1 2026 resolves to 2026-01-01 -> 2026-03-31
  ✓ PASS: Q1 previous quarter crosses year boundary to Q4 2025 (2025-10-01 -> 2025-12-31)
  ✓ PASS: Previous quarter preset from Q1 2026 resolves to Q4 2025
  ✓ PASS: Prior quarter of Q4 2025 resolves to Q3 2025
  ✓ PASS: Q3 2026 resolves to 2026-07-01 -> 2026-09-30
  ✓ PASS: Q3 previous quarter resolves to Q2 2026 (2026-04-01 -> 2026-06-30)

[Test 1.3] Leap Year:
  ✓ PASS: 2024 is a leap year
  ✓ PASS: 2025 is not a leap year
  ✓ PASS: 2000 is a leap year (divisible by 400)
  ✓ PASS: 1900 is not a leap year (divisible by 100, not 400)
  ✓ PASS: Mar 1, 2024 prev month is Feb 2024 (2024-02-01 -> 2024-02-29 leap year)
  ✓ PASS: Mar 1, 2024 prior month is Jan 2024 (2024-01-01 -> 2024-01-31)
  ✓ PASS: Feb 2024 has 29 days (2024-02-01 -> 2024-02-29)
  ✓ PASS: Feb 2025 has 28 days (2025-02-01 -> 2025-02-28)

[Test 1.4] Partial Current Month:
  ✓ PASS: Current month is Sep 2026 (calendar window)
  ✓ PASS: Previous month is Aug 2026

[Test 1.5] Custom Date Range:
  ✓ PASS: Custom 10-day start and end preserved
  ✓ PASS: Preceding period is exact 10 days: 2026-08-01 -> 2026-08-10
  ✓ PASS: Custom 10-day has daily trend granularity
  ✓ PASS: Custom 60-day has weekly trend granularity

==================================================
2. RATE VS VOLUME DELTA SEMANTICS
==================================================
  ✓ PASS: Rate metric is marked as percentage point
  ✓ PASS: Rate delta is formatted in p.p.: -11.3 p.p.
  ✓ PASS: Rate delta does NOT contain % symbol
  ✓ PASS: Large drop in achievement is marked critical
  ✓ PASS: Volume metric is marked as percentage growth
  ✓ PASS: Volume delta is formatted in %: -36.2%
  ✓ PASS: Volume delta contains % symbol
  ✓ PASS: Drop in production > 15% is marked critical
  ✓ PASS: Downtime decreased
  ✓ PASS: Downtime reduction is marked GOOD
  ✓ PASS: Downtime drop formatted as -7.1%

==================================================
3. REAL DATASET VALIDATION (August 2026 vs July 2026)
==================================================
  ✓ PASS: August Actual Production is 1,177,136
  ✓ PASS: July Actual Production is 18,44,030
  ✓ PASS: Production delta formatted in %: -36.2%
  ✓ PASS: August Target is 5,281,320
  ✓ PASS: July Target is 5,497,800
  ✓ PASS: August Achievement is 22.29%
  ✓ PASS: July Achievement is 33.54%
  ✓ PASS: Achievement delta formatted in p.p.: -11.3 p.p.
  ✓ PASS: August Downtime is 1,58,789.9 minutes
  ✓ PASS: Downtime delta formatted in %: -7.1%
  ✓ PASS: August Prod Loss NOS is 8,03,827
  ✓ PASS: Prod Loss NOS delta formatted in %: -28.7%
  ✓ PASS: OEE is correctly null / Not Available for Medchal data
  ✓ PASS: August has at least 4 weekly buckets

==================================================
SUMMARY: 49 passed, 0 failed
==================================================
```

---

## 8. Frontend Quality & Build Verification

| Verification Check | Tool / Command | Result |
| :--- | :--- | :--- |
| **TypeScript Typecheck** | `npm run typecheck` (`tsc -b --pretty false`) | **0 Errors** (Clean compilation) |
| **Code Style & Linter** | `npm run lint` (`oxlint .`) | **0 Errors, 0 Warnings** across 77 files |
| **Production Build** | `npm run build` (`tsc -b && vite build`) | **Successful** (Client built in 484ms) |
| **Edge-Case Suite** | `npx tsx scratch/test_phase3_verification.ts` | **49 of 49 Tests Passed** |

---

## 9. File Manifest for Phase 3

### Core Analytics & Engine
- [`frontend/src/data/calculations/periodEngine.ts`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/data/calculations/periodEngine.ts): Centralized period resolution, ISO week math, metric delta formatting (`p.p.` vs `%`), polarity status assignment, granular trend series builder, and period comparison aggregator.
- [`frontend/src/components/dashboard/slides/useDashboardAnalytics.ts`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/useDashboardAnalytics.ts): Hook updated with `previousRecords` parameter, memoized `periodComparison`, and dynamic `granularTrendSeries`.

### UI & Visualization Components
- [`frontend/src/components/dashboard/slides/PeriodComparisonChart.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/PeriodComparisonChart.tsx): Clustered volume comparison chart and rate movement badges.
- [`frontend/src/components/dashboard/slides/KpiCard.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/KpiCard.tsx): Enhanced with `varianceType` property for polarity-driven badge styling (`good`, `warning`, `critical`, `neutral`).
- [`frontend/src/components/dashboard/slides/ExecutiveOverviewSlide.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/ExecutiveOverviewSlide.tsx): Integrated period comparison deltas on 8 KPI cards and view mode toggle between Trend/Root Cause and Period Comparison Chart.
- [`frontend/src/components/dashboard/slides/ProductionSlide.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/ProductionSlide.tsx): Integrated dynamic granular trend series (Daily/Weekly/Monthly) and comparison badges.
- [`frontend/src/components/dashboard/slides/ProductionLossSlide.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/ProductionLossSlide.tsx): Polarity-aware variance badges.
- [`frontend/src/components/dashboard/slides/DowntimeCommandCenterSlide.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/DowntimeCommandCenterSlide.tsx): Polarity-aware variance badges.
- [`frontend/src/components/dashboard/slides/QualitySlide.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/QualitySlide.tsx): Polarity-aware variance badges.
- [`frontend/src/components/dashboard/slides/ManagementInsightsSlide.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/ManagementInsightsSlide.tsx): Dynamically generated period movement narrative based on real comparison metrics.
- [`frontend/src/components/dashboard/slides/index.ts`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/slides/index.ts): Export for `PeriodComparisonChart`.
- [`frontend/src/styles/hud-theme-overrides.css`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/styles/hud-theme-overrides.css): Period badge and comparison chart layout styling.

### Filter & Orchestration Layer
- [`frontend/src/pages/ManufacturingDashboard.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/pages/ManufacturingDashboard.tsx): Added `period: PeriodPreset` to `FilterState`, period dropdown selector in `FilterBar`, and live records date slicing for current and preceding windows.
- [`frontend/src/components/dashboard/LiveGoogleSheetsSection.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/components/dashboard/LiveGoogleSheetsSection.tsx): Passed `previousRecords` and `periodWindow` to carousel slide views.

### Audit & Verification Scripts
- [`scratch/test_phase3_verification.ts`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/scratch/test_phase3_verification.ts): 49-assertion automated verification test.
- [`scratch/verify_medchal2.py`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/scratch/verify_medchal2.py): Python data extraction script for auditing raw Excel row counts and totals.

---

## 10. Boundaries & Phase Completion Sign-Off

Phase 3 is **100% complete and fully verified**.

> [!IMPORTANT]
> **Phase 4 Boundary Enforcement**:
> In accordance with the user instructions, execution **STOPS HERE**. No Phase 4 development, deployment, or unauthorized alterations to the production sheet or repository will proceed without explicit user instruction.

