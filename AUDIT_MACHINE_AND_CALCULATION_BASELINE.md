# Patil Group Manufacturing Dashboard — Machine & Calculation Baseline Audit

**Audit Date**: 2026-09-24  
**Primary Reference Files**:
- `Medchal_Downtime & Prod (2).xlsx` (Workspace reference file, 14,293 data rows, date range 2024-08-31 to 2026-09-10)
- `Medchal_Downtime & Prod (3).xlsx` (Latest downloaded snapshot, 14,766 data rows, date range 2024-08-31 to 2026-09-23)
- Live Google Sheets source (`Spreadsheet ID: 1BRNzO8Qhp40x8fYBhdGNS5hb3WORA7bUjzFpg1fZL4c`, Worksheet: `Sheet1`, 14,766 records)

---

## 1. Executive Summary & Core Findings

1. **Machine is an Authenticated Source Column**:
   - In both Excel workbooks and Google Sheets, **Column G** is `Machine`.
   - The dataset contains 46 distinct non-blank machine identifiers.
   - Crucially, when `Stage` is `Clip`, `Machine` contains `Line 1` (398 rows) and `Line 2` (392 rows).
   - `Line` (Column C, e.g. `ERC`) and `Machine` (Column G, e.g. `Line 1`, `Line 2`) are completely distinct dimensions that must never be conflated.
   - The dashboard previously omitted a dedicated `MACHINE` filter in Operations Control; this must be added.

2. **Resolution of Excel Formula `=SUM(K7610:K14767)` = `34,166,847`**:
   - In the user's Excel screenshot (`media_1790228476699.png`), cell `K15109` showed `=SUM(K7610:K14767)` resulting in `34,166,847`.
   - Independent Python summation of Column K (`Prod Target NOS`) across rows 7610 to 14767 yields **exactly `34,166,847.0`** (0 difference).
   - Row 7610 represents the first major batch of records for Calendar Year 2026.
   - Rows 7588–7609 are 22 earlier records on 2026-01-01 and 2026-01-02 whose target sum is `48,740`.
   - Full calendar year 2026 target (`2026-01-01` to `2026-09-23`) across all rows is **`34,215,587`** (`34,166,847 + 48,740`).

3. **Resolution of Excel Filter Status `4252 of 15106 records found`**:
   - The user's screenshot displayed Excel's status bar indicating `4252 of 15106 records found`.
   - Comprehensive multi-column scanning revealed that filtering by **`Stage == 'Clip'`** yields **exactly 4,252 records** in `Medchal_Downtime & Prod (3).xlsx`.
   - All visible rows in the screenshot have `Stage = Clip`.
   - Because Excel's standard `SUM()` function includes hidden rows, `=SUM(K7610:K14767)` evaluated to `34,166,847` despite the active `Clip` filter.

4. **Critical Backend Ingestion Discrepancy Identified**:
   - In `backend/app/services/google_sheets_service.py`, `_ALIAS_MAP` mapped `"productiontarget"` and `"target"`, but **omitted `"prodtargetnos"`** and **`"totalprodnos"`**.
   - As a result, the backend stored them in untyped strings `prodTargetNOS` and `totalPRODNOS` instead of the canonical `productionTarget` and `totalProduction` fields.
   - This caused `productionTarget` and `totalProduction` to be `None` in the backend service canonical dictionary. This fix is documented and addressed.

---

## 2. Workbook Structure Audit

### Sheets Present
| Sheet Name | Dimensions | Max Row | Max Column | Data Purpose |
|---|---|---|---|---|
| `Sheet1` | `A1:AB15020` (P2) / `A1:AB16067` (P3) | 15,020 (P2) / 16,067 (P3) | 28 | **Primary manufacturing DPR dataset** |
| `Form responses 2` | `A1:B1` | 1 | 2 | Empty template / placeholder |
| `Form responses 1` | `A1:B1` | 1 | 2 | Empty template / placeholder |
| `Sheet6` | `A1:A1` | 1 | 1 | Blank sheet |
| `Pivot Table 4` | `A1:A1` | 1 | 1 | Blank sheet |
| `Master ` | `B2:D7` | 7 | 4 | Small reference table |
| `Sheet3` | `A1:A1` | 1 | 1 | Blank sheet |
| `Sheet5` | `A1:Z1010` | 1,010 | 26 | Historical extract |
| `Pivot Table 3` | `A1:A1` | 1 | 1 | Blank sheet |

### Column Inventory (`Sheet1`)
| Col # | Letter | Source Header | Inferred Data Type | Mapped Canonical Key | Notes |
|---:|:---:|---|---|---|---|
| 1 | A | `SL No` | Integer | `slNo` | Serial number (1 to 11,305) |
| 2 | B | `Date` | Date (`DD-MM-YYYY` / ISO) | `date` | `2024-08-31` to `2026-09-23` |
| 3 | C | `Line` | String | `line` | Manufacturing Line (`ERC`) |
| 4 | D | `Shift` | String | `shift` | Shift (`A`, `B`) |
| 5 | E | `Part` | String | `part` | Part model (`MK3`, `MK5`) |
| 6 | F | `Stage` | String | `stage` | Manufacturing Stage (`Cut Bar`, `Clip`, etc.) |
| 7 | G | `Machine` | String | `machine` | Machine name (`Line 1`, `Line 2`, `SBL`, etc.) |
| 8 | H | `Downtime Type` | String | `downtimeType` | Reason / Category of downtime |
| 9 | I | `Downtime Mints` | Numeric (Float) | `downtimeMinutes` | Downtime in minutes |
| 10 | J | `Prod Loss NOS` | Numeric (Integer/Float) | `productionLoss` | Production loss in pieces |
| 11 | K | `Prod Target NOS` | Numeric (Integer/Float) | `productionTarget` | Target production in pieces |
| 12 | L | `Total PROD NOS` | Numeric (Integer/Float) | `totalProduction` | Actual produced pieces |
| 13 | M | `Rejection` | Numeric (Integer/Float) | `rejection` | Rejected pieces |
| 14 | N | `Description` | String | `description` | Operator / Supervisor remarks |
| 15 | O | `Month ` | Numeric | `month` | Calendar month (1–12) |
| 16 | P | `week Nr` | Numeric | `weekNr` | Calendar week number (1–53) |
| 17 | Q | `Heat No.` | String | `heatNo` | Raw material heat tracking |
| 18–28 | R–AB | *(Empty)* | None | None | Unused trailing blank columns |

---

## 3. Dataset Baseline Numbers

| Metric | Workspace P2 (`(2).xlsx`) | Latest Snapshot P3 (`(3).xlsx`) | Google Sheets Live | Notes |
|---|---:|---:|---:|---|
| **Data Rows** | 14,293 | 14,766 | 14,766 | P3 matches Google Sheets exactly |
| **Header Row** | Row 1 | Row 1 | Row 1 | Standard header |
| **First Data Row** | Row 2 | Row 2 | Row 2 | Date: 2024-08-31 |
| **Last Data Row** | Row 14,294 | Row 14,767 | Row 14,767 | Date: 2026-09-23 |
| **Earliest Date** | 2024-08-31 | 2024-08-31 | 2024-08-31 | Exact match |
| **Latest Date** | 2026-09-10 | 2026-09-23 | 2026-09-23 | P3 & Google Sheets include 23-09-2026 |
| **Downtime Minutes** | 2,168,916.5 | 2,240,593.5 | 2,240,593.5 | Exact match |
| **Production Loss NOS** | 11,481,250 | 11,814,456 | 11,814,456 | Exact match |
| **Production Target NOS** | 40,665,962 | 42,777,962 | 42,777,962 | Exact match |
| **Total Production NOS** | 22,219,806 | 22,971,346 | 22,971,346 | Exact match |
| **Rejection NOS** | 89,788 | 92,376 | 92,376 | Exact match |
| **Overall Gap NOS** | 18,446,156 | 19,806,616 | 19,806,616 | Target − Production |
| **Achievement %** | 54.64% | 53.70% | 53.70% | (Production / Target) × 100 |

---

## 4. Machine Dimension Audit

Unique Machine values in the dataset (46 unique machines):
- `150 Ton Mechanical press`: 105 rows
- `3rd Forming`: 6 rows
- `3rd Press SBL`: 5 rows
- `Autocopying-1`: 1,081 rows
- `Autocopying-2`: 1,057 rows
- `Autocopying-3`: 1,068 rows
- `Autocopying-4`: 1,095 rows
- `Autocopying-5`: 1,080 rows
- `Autocopying-6`: 1,102 rows
- `Autocopying-7`: 82 rows
- `Autocopying-8`: 87 rows
- `Autocopying-9`: 88 rows
- `Bar Corpper - 3`: 273 rows
- `Bar corpper 1`: 1,013 rows
- `Bar corpper 2`: 303 rows
- `Cooling Tower`: 4 rows
- `IBH`: 127 rows
- `LINE 1&2`: 6 rows
- **`Line 1`**: **398 rows** (Clip stage machine)
- **`Line 2`**: **392 rows** (Clip stage machine)
- `Linerless`: 2 rows
- `Loading conveyor IBH`: 2 rows
- `MPI`: 372 rows
- `MPI  1`: 146 rows
- `MPI 2`: 160 rows
- `Manual grinding M/C `: 805 rows
- `Manupulator`: 14 rows
- `Others`: 114 rows
- `Power Failure`: 143 rows
- `Quenching`: 44 rows
- `SBL`: 1,173 rows
- `SBL & SBR`: 628 rows
- `SBR`: 1,076 rows
- `Sikka1`: 194 rows
- `Tampering`: 8 rows
- `Tampering Furnace`: 48 rows
- `W-CNC 1`: 56 rows
- `W-CNC 2`: 56 rows
- `W-CNC 3`: 54 rows
- `W-CNC 4`: 53 rows
- `W-CNC 5`: 51 rows
- `W-CNC 6`: 48 rows
- `sikka-1`: 2 rows
- `[Blank/Null]`: 145 rows

### Machine Breakdown for Line 1 vs Line 2 vs All
| Machine | Records | Downtime (min) | Prod Loss | Target | Production | Rejection | Ach % | Gap |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **Line 1** | 398 | 97,149 | 932,137 | 1,561,900 | 520,099 | 3,833 | 33.30% | 1,041,801 |
| **Line 2** | 392 | 115,237 | 1,112,611 | 1,627,900 | 469,430 | 4,003 | 28.84% | 1,158,470 |
| **Subtotal (Line 1 + Line 2)** | 790 | 212,386 | 2,044,748 | 3,189,800 | 989,529 | 7,836 | 31.02% | 2,200,271 |
| **All Other Machines** | 13,831 | 2,026,163 | 9,766,134 | 39,588,162 | 21,981,817 | 84,540 | 55.53% | 17,606,345 |
| **Blank / Unassigned** | 145 | 2,045 | 3,574 | 0 | 0 | 0 | 0.00% | 0 |
| **Total (All Machines)** | **14,766** | **2,240,593.5** | **11,814,456** | **42,777,962** | **22,971,346** | **92,376** | **53.70%** | **19,806,616** |

---

## 5. Other Key Dimensions

- **Line**:
  - `ERC`: 14,762 records (99.97%)
  - Blank: 4 records
- **Shift**:
  - `A` (Day): 7,665 records (51.9%)
  - `B` (Night): 7,098 records (48.1%)
  - Blank: 3 records
- **Part**:
  - `MK5`: 13,916 records
  - `MK3`: 847 records
  - Blank: 3 records
- **Stage**:
  - `Clip`: 4,252 records
  - `Turned Bar`: 7,163 records
  - `SBL`: 1,173 records
  - `SBR`: 1,076 records
  - `Cut Bar`: 1,013 records
  - `Deburring`: 805 records
  - `MPI`: 372 records
  - `Others`: 114 records
  - Blank: 3 records

