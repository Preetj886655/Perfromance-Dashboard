# ERC Mk-V Worksheet Relationship Map

## Evidence standard

Relationships below are based on inspected workbook formulas, actual live headers/values, exact-key coverage checks, or explicit source descriptions. Similar column labels by themselves are not treated as proof of a join. No worksheet was modified.

## Verified data relationships

| Source | Target | Key / mechanism | Evidence and safe use |
|---|---|---|---|
| `Production Order` | `Copy of Production Order` | Full cell region comparison | The supplied workbook's 204-by-11 regions are exactly equal; live tabs have the same headers and row extent. Treat the second tab as a duplicate copy, never an additive order source. Recheck values before Phase 2 determines whether to expose it as a comparison page. |
| `RM Heat Plan vs Actual` | `Heat & Lot Number Reference` | Composite key `(Heat No., Lot No.)` | Live/workbook rows have 33 unique plan pairs and 68 unique reference pairs; all 33 plan pairs match. Reference-only pairs are not automatically missing/invalid. Preserve the composite key and validate customer, supplier, quantity, and batch attributes before using reference values to fill plan fields. |
| `Machine Consumables` | `Machine Master` | Exact `(Work Center, Machine)` pair | 31 unique consumables pairs all match the 31 machine-master pairs. This is suitable for a reference lookup. Do not join on `Machine` alone if work-center context can distinguish machines. |
| `Entries` | `Machine Master` | Exact `(Work Center, Machine)` pair | The live data has 10 distinct Entries pairs and all 10 match Machine Master. The local workbook stores formula-backed array results in some Entries fields, so live calculated values are required for this check. |
| `Manpower Summary` | `Entries` | Formula dependencies on Entries columns V-X | The workbook uses `AVERAGEIFS`/`SUMIFS` over planned manpower, actual manpower, and shortfall. Validate actual range bounds and aggregation grain before reproducing the summary. |
| `OEE & Reliability` | `Entries` | Formula dependencies on Entries columns R-U | The workbook uses `AVERAGEIFS` on Availability, Performance, Quality, and OEE grouped by work center. These are unweighted averages; they are not evidence for a weighted aggregate. |
| `Downtime Log` | `Entries` | Formula-mirrored lower section references Entries rows | The workbook has a lower formula block referencing Entries. Existing parser/tests explicitly detect and skip mirrored downtime rows to avoid double counting. Keep the history and mirror sections distinguishable and do not append both to a combined event count. |
| `Production Dashboard` | `Downtime Log` | Workbook formulas and source labels | Latest-date, downtime, production, and date-range dashboard formulas reference Downtime Log. Recalculate from source rows for the web page; do not treat the dashboard output as an independent fact source. |
| `Summary` | `Downtime Log` | Workbook `SUMIFS` formulas | Monthly downtime minutes/hours, breakdown hours, target and actual production, fill, and approximate availability derive from Downtime Log. Preserve the source's explicit approximation caveat for availability. |
| `Downtime Analysis` | `Downtime Log` | Workbook `SUMIFS`/`COUNTIFS` formulas | Category totals, hour conversion, occurrences, and share derive from Downtime Log. The sheet identifies a November 2024 history gap. |
| `Dashboard` | `Machine Master` | Workbook formulas including `COUNTIF` and rated CT calculation | Machine counts and effective rated cycle-time/bottleneck output are derived from the master. Formula ranges need coverage review: an observed range ends at row 28 while the master extends beyond that. |

## Candidate relationships requiring validation before use

| Source | Target | Candidate key | Unresolved validation |
|---|---|---|---|
| `Production Order` | `Order Plan (Monthly)` | `Order Nr` / `PO No` | Five of six monthly-plan PO values overlap the eight Production Order identifiers in the live data. Do not silently drop unmatched identifiers or assume statuses/quantities are the same grain. Validate all identifier formats, duplicate order behavior, and the meaning of monthly plan `Type`. |
| `Production Order` | `RM Heat Plan vs Actual` / `Heat & Lot Number Reference` | Assigned RM Heat Nr and Subsequent Lot Nr versus Heat No. and Lot No. | Fields appear semantically related, but some order fields contain multiple identifiers or explanatory text. Normalize only after exact value-level mapping is verified. |
| `Entries` | `Heat & Lot Number Reference` / `RM Heat Plan vs Actual` | RM Heat Nr, Bundle Nr, Lot Number | Names suggest traceability, but the relationship between bundle, lot, and heat is not defined by a workbook formula. Do not equate Bundle Nr and Lot Number. Match only exact source identifiers; surface unmatched values. |
| `Capacity Change Log` | `Machine Master` | Work Center + Machine + effective date | The only populated change row is explicitly an example. Do not use it to overwrite current rated CT or infer an actual capacity history. |
| `Planned Shutdowns` | `Entries` | Date range + Scope / Scope Detail | The schedule contains sample/example entries and scope rules are not joined by formula. Matching requires confirmed event status, machine/work-center scope, timezone/date boundaries, and conversion between hours/day and minutes. |
| `Machine Consumables` | `Entries` | Work Center + Machine | Machine identity is verified, but consumable frequency/due dates do not establish that an actual machine event occurred. Do not derive usage, inventory balance, or downtime from this sheet. |

## Dependency graph

```text
Production Order --------- candidate PO No -------- Order Plan (Monthly)
        |                                               |
        | assigned heat / subsequent lot                | (not a proven quantity join)
        v                                               v
RM Heat Plan vs Actual ---- (Heat No., Lot No.) ---- Heat & Lot Number Reference

Machine Master ---- exact (Work Center, Machine) ---- Machine Consumables
       |                         |
       |                         +------------------- Entries (live exact matches)
       +---- Dashboard                                |
                                                     +---- Manpower Summary
                                                     +---- OEE & Reliability
                                                     +---- formula-mirrored rows in Downtime Log

Historical Downtime Log ---- Production Dashboard
          |                 Summary
          +---------------- Downtime Analysis
          +---------------- existing Line Tracker historical downtime parser

Planned Shutdowns and Capacity Change Log are not safe operational facts
until their explicit example rows are replaced or confirmed.
```

## Aggregation and double-counting controls

- `Production Order` and `Copy of Production Order` must not be unioned or summed; the supplied workbook regions are exact duplicates.
- Historical rows in Downtime Log and formula-mirrored Entries rows are different representations of source activity. Preserve the existing parser's duplicate-prevention behavior.
- Dashboard, Summary, Downtime Analysis, Manpower Summary, and OEE & Reliability are formula summaries over raw tabs, not independent source records.
- Aggregate OEE components using validated definitions and denominators; do not average sheet-level percentages blindly.
- Downtime duration is in minutes in the raw log; convert to hours only at an explicitly labelled display/calculation boundary.
- Do not compute MTTR/MTBF from the present headers alone. Breakdown Type, actual repair duration, exposure/operating time, and event boundaries need explicit validation.
- Avoid treating blank values as numeric zero. In particular, the historical Downtime Log has missing duration values and Entries formula outputs can be blank.
