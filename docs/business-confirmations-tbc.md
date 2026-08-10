# Business Confirmations — TBC

These items are **not permanently decided**. Proposed defaults are configurable placeholders only.

| ID | Topic | Status | Proposed default (configurable, not final) |
|---|---|---|---|
| Q1 | Midnight-crossing shift date attribution | TBC / Business Confirmation Required | Attribute production to shift **start date** |
| Q2 | Planned downtime categories | TBC / Business Confirmation Required | Excel: Tea/Lunch as planned; Mould Trial remains unplanned until confirmed |
| Q6 | OEE aggregation and Run-Time Performance rollup | TBC / Business Confirmation Required | Ratio-of-sums; Performance uses **Run Time** (not Available Time) |
| Q11 | Multi-plant requirement | TBC / Business Confirmation Required | Schema supports multi-plant; seed Medchal only |
| Q13 | Line-to-machine mapping | TBC / Business Confirmation Required | `line_id` nullable on machines until mapping confirmed |
| Q17 | Overall KPI weights | TBC / Business Confirmation Required | Admin-configurable weights; equal weights until set |
| Hosting | On-prem / private cloud / AWS / Azure | TBC / Business Confirmation Required | Docker Compose, cloud-agnostic images |

## OEE source of truth (APPROVED)

Excel `DPR_OEE` row formulas are the authoritative calculation for row-level Availability, Performance (AF), Machine Utilisation (AG), Quality, and OEE.
