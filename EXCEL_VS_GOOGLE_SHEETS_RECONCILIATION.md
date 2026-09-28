# Excel vs. Google Sheets Source Reconciliation Report

**Audit Date**: 2026-09-24  
**Datasets Evaluated**:
1. `Medchal_Downtime & Prod (2).xlsx` (Workspace file)
2. `Medchal_Downtime & Prod (3).xlsx` (Latest downloaded file in Downloads)
3. Google Sheets Live (`Spreadsheet ID: 1BRNzO8Qhp40x8fYBhdGNS5hb3WORA7bUjzFpg1fZL4c`, Worksheet `Sheet1`)

---

## 1. High-Level Comparison & Identification of Dataset Vintage

> [!IMPORTANT]
> `Medchal_Downtime & Prod (2).xlsx` is a snapshot taken on **12-09-2026**, containing data up to **2026-09-10** (14,293 data rows).  
> The live Google Sheets dataset and `Medchal_Downtime & Prod (3).xlsx` are **up to date as of 2026-09-23** (14,766 data rows).  
> When comparing the latest Google Sheets with the latest snapshot `(3).xlsx`, they are **100% identical row-for-row, metric-for-metric**.

---

## 2. Quantitative Metric Reconciliation

| Metric | Workspace P2 (`(2).xlsx`) | Latest Snapshot P3 (`(3).xlsx`) | Google Sheets Live | P3 vs Google Sheets Variance | Status |
|---|---:|---:|---:|---:|:---:|
| **Total Rows in Sheet** | 15,020 | 16,067 | 14,767 | — | PASS |
| **Non-Empty Data Rows** | 14,293 | 14,766 | 14,766 | **0** | **IDENTICAL** |
| **Earliest Date** | 2024-08-31 | 2024-08-31 | 2024-08-31 | **0 days** | **IDENTICAL** |
| **Latest Date** | 2026-09-10 | 2026-09-23 | 2026-09-23 | **0 days** | **IDENTICAL** |
| **Total Downtime (min)** | 2,168,916.5 | 2,240,593.5 | 2,240,593.5 | **0.0** | **IDENTICAL** |
| **Total Production Loss (NOS)** | 11,481,250 | 11,814,456 | 11,814,456 | **0** | **IDENTICAL** |
| **Total Production Target (NOS)** | 40,665,962 | 42,777,962 | 42,777,962 | **0** | **IDENTICAL** |
| **Total Actual Production (NOS)** | 22,219,806 | 22,971,346 | 22,971,346 | **0** | **IDENTICAL** |
| **Total Rejection (NOS)** | 89,788 | 92,376 | 92,376 | **0** | **IDENTICAL** |
| **Production Gap (NOS)** | 18,446,156 | 19,806,616 | 19,806,616 | **0** | **IDENTICAL** |
| **Overall Achievement %** | 54.64% | 53.70% | 53.70% | **0.00%** | **IDENTICAL** |

---

## 3. Dimensional Comparison

### Line Breakdown
| Line Value | P2 Records | P3 Records | Google Sheets Records |
|---|---:|---:|---:|
| `ERC` | 14,289 | 14,762 | 14,762 |
| `[Blank]` | 4 | 4 | 4 |
| **Total** | **14,293** | **14,766** | **14,766** |

### Shift Breakdown
| Shift Value | P2 Records | P3 Records | Google Sheets Records |
|---|---:|---:|---:|
| `A` (Day Shift) | 7,424 | 7,665 | 7,665 |
| `B` (Night Shift) | 6,866 | 7,098 | 7,098 |
| `[Blank]` | 3 | 3 | 3 |
| **Total** | **14,293** | **14,766** | **14,766** |

### Part / Material Breakdown
| Part | P2 Records | P3 Records | Google Sheets Records |
|---|---:|---:|---:|
| `MK5` | 13,443 | 13,916 | 13,916 |
| `MK3` | 847 | 847 | 847 |
| `[Blank]` | 3 | 3 | 3 |
| **Total** | **14,293** | **14,766** | **14,766** |

### Key Machine Counts (Top Machines)
| Machine | P2 Records | P3 Records | Google Sheets Records |
|---|---:|---:|---:|
| `SBL` | 1,133 | 1,173 | 1,173 |
| `Autocopying-6` | 1,069 | 1,102 | 1,102 |
| `Autocopying-4` | 1,062 | 1,095 | 1,095 |
| `Autocopying-1` | 1,048 | 1,081 | 1,081 |
| `Autocopying-5` | 1,047 | 1,080 | 1,080 |
| `SBR` | 1,040 | 1,076 | 1,076 |
| `Autocopying-3` | 1,035 | 1,068 | 1,068 |
| `Autocopying-2` | 1,024 | 1,057 | 1,057 |
| `Bar corpper 1` | 981 | 1,013 | 1,013 |
| `Manual grinding M/C ` | 778 | 805 | 805 |
| **`Line 1`** | **386** | **398** | **398** |
| **`Line 2`** | **380** | **392** | **392** |

---

## 4. Ingestion & Column Mapping Consistency

All 17 source columns in Excel map directly to Google Sheets columns:
1. `SL No` -> `slNo`
2. `Date` -> `date`
3. `Line` -> `line`
4. `Shift` -> `shift`
5. `Part` -> `part`
6. `Stage` -> `stage`
7. `Machine` -> `machine`
8. `Downtime Type` -> `downtimeType`
9. `Downtime\n Mints` -> `downtimeMinutes`
10. `Prod Loss\n NOS` -> `productionLoss`
11. `Prod Target\n NOS` -> `productionTarget`
12. `Total PROD\n NOS` -> `totalProduction`
13. `Rejection` -> `rejection`
14. `Description` -> `description`
15. `Month ` -> `month`
16. `week Nr` -> `weekNr`
17. `Heat No.` -> `heatNo`

**Conclusion**: Google Sheets is the authoritative live upstream source, containing 14,766 records through 23-09-2026. `Medchal_Downtime & Prod (3).xlsx` is an exact export of this dataset.

