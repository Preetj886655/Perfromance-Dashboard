# Patil Rail Infrastructure Pvt. Ltd. (PRIL) — Real-Time Manufacturing Analytics & Performance Dashboard
## Complete System Specification + Final Master Development Prompt

**Prepared for:** Patil Group / Patil Rail Infrastructure Pvt. Ltd. (PRIL)
**Source inputs analyzed:** `Production_Dashboard_Data.docx`, `PRIL_DPR_OEE_Sheet_-_PG_NPD_029.xlsx`
**Document type:** Pre-development architecture, requirements, and specification package + a copy‑paste‑ready Master Development Prompt for an AI coding agent.

**Labeling convention used throughout this document:**
- `[SOURCE: DOCX]` — stated explicitly in Production_Dashboard_Data.docx
- `[SOURCE: XLSX]` — present in the actual DPR_OEE Excel workbook (column, formula, or structure)
- `[RECOMMENDED]` — this document's professional recommendation, not present in either source file
- `[REQUIRES CLARIFICATION]` — an open business-rule question that must be answered by PRIL before or during build
- `[FUTURE PHASE]` — explicitly out of scope for MVP/Phase 2, deferred to a later phase

---

## Table of Contents

**SECTION A — Complete System Specification**
1. Executive Summary
2. Understanding of the Current Idea
3. Requirements Extracted from the DOCX
4. Requirements Extracted from the Excel Workbook
5. Assumptions
6. Missing Requirements (Gap Analysis)
7. Business Rules Requiring Clarification
8. KPI Dictionary
9. OEE Methodology
10. Department-by-Department Requirements
11. Data Architecture
12. Database Architecture & ER Model
13. Real-Time Architecture
14. Data Ingestion Architecture
15. Google Forms / Google Sheets Architecture
16. Excel/CSV Import Architecture
17. User Roles & RBAC
18. Security
19. Audit Logging
20. Alerts & Notifications
21. Action Management (CAPA)
22. AI Analytics Architecture
23. API Architecture
24. Frontend Architecture
25. Backend Architecture
26. Deployment Architecture
27. Backup & Disaster Recovery
28. Monitoring & Observability
29. Testing Strategy
30. MVP Scope
31. Phase 2 Scope
32. Phase 3 Scope
33. Development Roadmap
34. Risks
35. Open Questions Requiring Clarification (Consolidated)

**SECTION B — Final Master Development Prompt**
36. How to Use This Prompt
37. The Master Development Prompt (copy-paste block)

---

# SECTION A — COMPLETE SYSTEM SPECIFICATION

## 1. Executive Summary

Patil Rail Infrastructure Pvt. Ltd. (PRIL), part of Patil Group, wants a **real-time, multi-department manufacturing analytics and performance dashboard**. The starting point is a rough concept note (the DOCX) describing the desired *outcome* — department-wise dashboards, KPI scorecards, Pareto/fishbone analysis, Excel/CSV upload, Google Forms data collection, and live-updating charts — plus one **real, formula-driven production template** (the XLSX): a Daily Production Report with OEE (DPR_OEE) sheet used on the shop floor today for a plastic-injection-molding-type process (rail components — cavities, cycle time, mould-related downtime reasons strongly suggest injection molding of rail pads/clips).

The DOCX itself states its data is illustrative ("assumption... not totally correct"), so it must be treated as a **statement of intent and visual direction**, not a frozen data model. The XLSX, by contrast, is the **actual working artifact** PRIL uses today — its column names, formulas, and calculation logic are the real ground truth for how OEE is currently computed at PRIL and should anchor the OEE engine design.

The core engineering challenge is not "build a dashboard" — it is:
1. Formalizing one **centralized, auditable OEE/KPI calculation engine** so every department and every drill-down level (shift → machine → line → plant → day → week → month) produces numbers that agree with each other and with the shop-floor Excel sheet.
2. Building a **flexible data ingestion layer** (Excel/CSV/manual/Google Forms today; API/IoT/PLC/MES/ERP later) that doesn't corrupt KPI history when its input formats change.
3. Providing **department-scoped, role-based dashboards** (Production, Quality, PPC, SCM, Stores, Maintenance, NPD, HR, Safety, Logistics, 5S, Overall) that management can read in under 30 seconds.
4. Delivering **near-real-time** updates without over-promising true real-time from spreadsheet-based sources.

This document turns that rough idea plus the two reference files into (A) a full technical specification and (B) one master prompt an AI coding agent can execute **in incremental, non-destructive phases**.

## 2. Understanding of the Current Idea

`[SOURCE: DOCX]` Your stated vision, restated precisely from the document text:

- A dashboard where you **upload Excel/CSV files** and the system **generates analysis and charts** automatically — Pareto charts, pie charts, bar graphs, fishbone diagrams.
- When you **update data**, the **whole dashboard and its charts should update live**.
- The dashboard should be organized **department-wise**: Production, Quality, PPC, SCM, Stores, Maintenance, NPD, HR, Safety, and an Overall Manufacturing view.
- A **transparent railway-track motif** in the background (reflecting PRIL's rail-infrastructure business) — the reference image attached was a stock photo of a train and rail-fastening components, used only to communicate the *aesthetic direction*, not a literal asset to reuse.
- Each department should have **upload and export** of data, and a **Google Form per department** so that operators/staff can submit data which flows into the dashboard.
- **Operators log hourly production** via Google Form (Hourly Production Report / HPR) which feeds KPI generation; other departments follow the same submission model.
- Column and row structure of uploaded data should be **customizable** by the user, not fixed.
- The **company identity** (Patil Group logo, owner Dr. L.S. Patil's name/photo) and **Safety Rules** should appear as part of the dashboard's branding/header.
- A **5S dashboard** is wanted, visually similar to a reference image the document points to.
- **KPI scorecards** per department, styled after a reference "Balanced Scorecard" concept image.
- A **Top 10 Pending Actions** list.
- An **overall KPI formula**: `Overall KPI (%) = (Total Achieved KPI Points / Total KPI Target Points) × 100` `[SOURCE: DOCX]`.

The document explicitly invites the analyst to **add anything missing** ("if something I don't know please add from yourself") — Section 6 of this specification (Gap Analysis) and Section 35 (open questions) take that instruction seriously.

## 3. Requirements Extracted from the DOCX

### 3.1 Explicit functional requirements `[SOURCE: DOCX]`

| # | Requirement | Exact intent |
|---|---|---|
| 1 | Excel/CSV upload | User uploads files; system parses and analyzes them |
| 2 | Auto-chart generation | Pareto, pie, bar, fishbone/root-cause charts generated from uploaded data |
| 3 | Live dashboard update | Updating data updates all graphs/dashboards without manual refresh |
| 4 | Department-wise structure | Production, Quality, PPC, SCM, Stores, Maintenance, NPD, HR, Safety + Overall Manufacturing |
| 5 | Customizable schema | Uploaded file's columns/rows can vary — not a fixed template |
| 6 | Google Form per department | Each department gets its own form; submissions land in a Google Sheet |
| 7 | Hourly Production Report (HPR) | Operators submit hourly production via form, feeding KPI calculation |
| 8 | Data export | Each department can export its data |
| 9 | Branding | Patil Group logo, owner name/photo, railway-track background motif |
| 10 | Safety Rules display | A visible safety-rules element on the dashboard |
| 11 | 5S dashboard | A dedicated 5S visual module |
| 12 | KPI scorecards | Department-wise KPI scorecards |
| 13 | Top 10 Pending Actions | A prioritized action list visible on the dashboard |
| 14 | Overall KPI formula | `(Total Achieved KPI Points / Total KPI Target Points) × 100` |
| 15 | Plan / Target / Actual / Capacity | Referenced repeatedly as core production fields |

### 3.2 The reference "Medchal Downtime & Production" column list `[SOURCE: DOCX]`

The DOCX supplies one illustrative table, explicitly caveated as non-final ("glimpses of column required... not exactly, it can vary"):

`SL No, Date, Line, Shift, Part, Stage, Machine, Downtime Type, Downtime (Mins), Prod Loss (NOS), Prod Target (NOS), Total PROD (NOS), Rejection, Description, Month, Week Nr, Heat No.`

This is materially **similar in spirit** to the actual XLSX (Section 4) but **not identical** — the DOCX version adds `Line`, `Stage`, `Description`, `Month`, `Week Nr`, `Heat No.` (traceability field) which the XLSX does not currently have as explicit columns, and the XLSX has a far more granular, formula-driven structure the DOCX doesn't mention (idle-time-reason breakdown, rejection-reason breakdown, calculated ratios). Both must be reconciled — see Section 5 (Assumptions) and Section 12 (Dynamic Data Structure logic carried into Section 11).

### 3.3 KPI list stated per department `[SOURCE: DOCX]`

Manufacturing/OEE: OEE, Availability, Performance, Quality, HPR, DPR.
Production: Production Achievement, Machine Utilization, Rejection Rate, Downtime, Plan vs Target vs Actual.
Quality: Customer Complaints, Internal Rejection, CAPA Closure, Inspection Pass Rate, In-process PPM, Final PPM, Customer PPM.
Maintenance: Preventive Maintenance Completion, Breakdown Frequency, MTTR, MTBF.
PPC: Production Plan (n, n+1, n+2 days), Plan vs Actual, Material Availability, On-time Production.
Logistics/Dispatch: GRN, Delivery Accuracy, FG Stock.
HR: Attendance, Attrition Rate, Training Status.
Safety: Safety Training Completion, Near Miss Reports, Safety Audit Score, Lost Time Injury.
NPD/Design/R&D: Drawing Release Time, Engineering Change Requests Closed, BOM Accuracy, Design Errors.

Every one of these is carried into the KPI Dictionary in Section 8, with formulas either sourced, derived, or explicitly marked `[RECOMMENDED]`/`[REQUIRES CLARIFICATION]`.

### 3.4 What the DOCX's embedded reference images actually show

The 12 embedded images in the DOCX are **inspirational references**, not final designs — most are stock/generic examples (a generic dark-themed multi-tile manufacturing BI dashboard, a generic Pareto chart, a generic Balanced Scorecard diagram, an OEE gauge dashboard photographed on a different company's shop floor, an HR "turnover vs attrition" infographic, generic pie/donut chart examples, a stock photo of a train and rail-fastening hardware, and the Patil Group logo/owner photo). They confirm the **visual language** PRIL likes — dark or clean card-based tiles, donut/gauge KPIs for OEE and its three sub-components, Pareto bars with cumulative-% line, downtime lists ranked by duration — but none of them are literal specifications to clone, and none should be reproduced verbatim; they inform the UI/UX guidance in Section 24 and the frontend instructions in the Master Prompt.

## 4. Requirements Extracted from the Excel Workbook

`[SOURCE: XLSX]` The workbook `PRIL_DPR_OEE_Sheet_-_PG_NPD_029.xlsx` contains **one sheet**, `DPR_OEE`, titled "PATIL RAIL INFRASTRUCTURE PVT. LTD. — DAILY PRODUCTION REPORT WITH OEE". It is a **live, formula-driven daily template** (formulas exist for rows 5–30, i.e. it is built out for roughly one shift's worth of entries at a time and re-used/re-filled, not a running multi-thousand-row database). This is the single most important source-of-truth artifact for the OEE engine. Its full column structure, verbatim:

### 4.1 Raw input columns (operator/clerk-entered)

| Col | Header (exact) | Data type observed | Notes |
|---|---|---|---|
| A | S.No. | Formula `=ROW()-3` | Auto row counter, not a real business key |
| B | Date | Date (`dd-mm-yyyy`) | |
| C | Shift | Free text (e.g. `A`) | No dropdown/data validation defined in the file |
| D | Machine Name/No. | Free text (e.g. `M001`) | No dropdown defined |
| E | Start Time | Time (`hh:mm`) | Shift start |
| F | Stop Time | Time (`hh:mm`) | Shift end |
| H | Operator Name | Free text | |
| I | Part Name | Free text (e.g. `RGP`) | |
| J | Part No. | Free text (e.g. `PD001`) | |
| K | Cavity | Number | Mould cavity count — confirms an injection-moulding process |
| L | Cycle Time (Sec.) | Number | Ideal/standard cycle time per shot |
| N | Prod. Qty. (Pcs.) | Number | Actual produced quantity |
| O | Planned Down Time (Tea/Lunch) | Number (minutes) | Planned stoppage, excluded from "available time" |
| Q–AA | Reason of Idle Time (Unplanned BD Time in Minutes) — 11 sub-columns | Number (minutes) | `1.Manpower Shortage, 2.Mould Trial, 3.Bin Shortage, 4.Material Shortage, 5.M/c Under BD, 6.Nozzle Block, 7.Mould Problem, 8.Crystal/Insert Shortage, 9.Power Failure, 10.Process Setting, 11.Others` |
| AH–AQ | Reason of Rejection (Qty. in Pcs.) — 10 sub-columns | Number (pieces) | `A.Short Moulding, B.Shrinkage Mark, C.Silver Streak, D.Flow Mark, E.Weld Line, F.Dent Mark, G.Power Cut, H.Black Marks, I.Crack Marks, J.Others` |
| AV | Any Other Remarks | Free text | |

### 4.2 Calculated columns and their exact live formulas `[SOURCE: XLSX]`

| Col | Header | Formula (row 5 example) | Meaning |
|---|---|---|---|
| G | Shift Time (Minutes) | `=IFERROR((F5-E5)*24*60,"")` | Stop − Start, in minutes |
| M | Target Qty./Hr. (Pcs.) | `=IFERROR(3600/(L5/K5),"")` | `(3600 seconds ÷ cycle time) × cavities` — theoretical hourly output |
| P | Available Time | `=IFERROR(G5-O5,"")` | Shift time minus planned downtime |
| AB | Total Idle Time (Minutes) | `=SUM(Q5:AA5)` | Sum of the 11 unplanned-downtime-reason columns |
| AC | Total Run Time (Minutes) | `=P5-AB5` | Available time minus unplanned idle time |
| AD | Availability Ratio (A) | `=IFERROR(AC5/P5,"")` | Run time ÷ Available time |
| AE | Actual Qty./Hr. | `=IFERROR(N5/AC5*60,"")` | Produced quantity normalized to run-time-per-hour |
| AF | Operator Efficiency / Performance Ratio (P) | `=IFERROR(AE5/M5,"")` | Actual rate ÷ Target rate |
| AG | Machine Efficiency (Machine Utilisation) | `=IFERROR(N5/(P5/60*M5),"")` | Produced qty ÷ (Available hours × Target rate) — a *second*, slightly different performance-style metric |
| AR | Total Rejection (Pcs Qty.) | `=SUM(AH5:AQ5)` | Sum of the 10 rejection-reason columns |
| AS | Rejection PPM | `=IFERROR(AR5/N5*1000000,"")` | Rejections per million produced |
| AT | Quantity Ratio (Q) | `=IFERROR((N5-AR5)/N5,"")` | Good qty ÷ Total produced qty |
| AU | OEE (A×P×Q) | `=IFERROR(AD5*AF5*AT5,"")` | **Row-level OEE** = Availability × Performance × Quality |

### 4.3 Structural observations that materially affect system design `[SOURCE: XLSX]`

1. **OEE is computed per row (per machine, per shift, per day)**, not aggregated anywhere in the file. There is no weekly/monthly/plant rollup sheet or formula in this workbook — any rollup logic PRIL wants is currently done outside this file (manually, or not at all). This is a genuine gap this project must fill; see Section 9 (OEE Methodology).
2. **Machine Efficiency (AG)** and **Operator Efficiency / Performance Ratio (AF)** are two distinct metrics computed from overlapping inputs — AF divides by run time (AC), AG divides by available time (P). Classic OEE Performance uses run time as the denominator (closer to AF). **AG is therefore not the "Performance" term used inside the OEE formula (AU uses AD×AF×AT, not AG)** — AG appears to be a supplementary/parallel metric ("Machine Utilisation") kept for reference. This distinction must be preserved exactly, not collapsed into one number. `[REQUIRES CLARIFICATION: confirm with PRIL why AG exists alongside AF and whether AG should also be surfaced as its own KPI]`.
3. **No dropdown / data-validation lists** exist in the file for Shift, Machine, Operator, Part, or the downtime/rejection reason columns — they are free-typed. This is a real-world data-quality risk (e.g., "M001" vs "m001" vs "Machine 1" fragmenting a machine's history) that the new system must solve with proper master data + dropdowns rather than free text.
4. **No Line field.** The sheet is Machine-level only; "Line" appears only in the DOCX's illustrative table, not in the real template. `[REQUIRES CLARIFICATION: does PRIL group machines into lines, and if so what is that hierarchy?]`
5. **No explicit "Target Production Qty for the shift"** column — only an hourly target rate (M) is computed. Shift-level target quantity must be derived (`Target Qty/Hr × Available Hours`) or explicitly clarified.
6. **Heat No.** (mentioned in the DOCX table, common in metallurgical/rail-component traceability) does **not** appear in the XLSX. It's a real candidate for a custom/traceability field, not a hallucinated one — but its absence from the working template means it may not currently be tracked at all. `[REQUIRES CLARIFICATION]`.
7. The file name `PG_NPD_029` looks like a **document control number** (Patil Group, possibly NPD/Format-029), not a data field — treat as metadata about the template itself, not a column to model.
8. Only ~26 rows have formulas filled (rows 5–30) even though the sheet's used range extends to row 1001 — i.e., in practice this file is manually re-created or re-filled per shift/day, not appended to indefinitely. This confirms Excel-as-a-database is not sustainable at scale, reinforcing the need for a real database with Excel/CSV as an **ingestion** format only, not the system of record.
## 5. Assumptions

These are working assumptions this specification makes in order to proceed. Each is labeled `[RECOMMENDED]` and must be confirmed by PRIL; none are treated as fact elsewhere in this document.

1. `[RECOMMENDED]` The XLSX's Machine/Shift/Part/Operator granularity (not the DOCX's Line/Stage granularity) is the real, current data-capture reality on the shop floor, and "Line" is a **future or higher-level grouping** of machines rather than something already tracked.
2. `[RECOMMENDED]` "PG_NPD_029" is a document-control code and PRIL likely has, or should have, similar DPR/OEE-style sheets for **other departments/plants** beyond Medchal, structurally similar but not necessarily identical.
3. `[RECOMMENDED]` The process observed (cavity count, cycle time in seconds, mould-related downtime and rejection reasons) is **injection molding** of rail/rubber components — this shapes default terminology (cavity, mould, shot) but the system must not hard-code the process type, since other departments (e.g., a machining line) would use different terms.
4. `[RECOMMENDED]` "Total Idle Time" in the XLSX (unplanned only) is distinct from "Planned Down Time" (tea/lunch) — both must be modeled as separate downtime categories, with room for more planned-downtime types (changeover, PM, meetings) than just tea/lunch.
5. `[RECOMMENDED]` A "shift" does not cross midnight in the sample data (08:30–20:30), but this cannot be assumed true for all shifts (a night shift almost certainly crosses midnight) — see Section 7, business rule Q1.
6. `[RECOMMENDED]` One row in DPR_OEE = one Machine + one Shift + one Date + one Part combination. If a machine changes parts mid-shift, that would currently require two rows — this must be explicitly supported, not assumed away.
7. `[RECOMMENDED]` The department list in the DOCX (Production, Quality, PPC, SCM, Stores, Maintenance, NPD, HR, Safety, Logistics/Dispatch, 5S, Overall) is the full initial department set; no departments are to be removed per the DOCX's explicit instruction.
8. `[RECOMMENDED]` Google Forms/Sheets are a **desired input channel**, not a mandated architecture — Section 15 evaluates fit and recommends where to actually use them vs. an alternative.

## 6. Missing Requirements (Gap Analysis)

The DOCX explicitly invites additions ("if something I don't know please add from yourself"). The following 34 requirements are not present in either source file but are necessary for an enterprise-grade manufacturing analytics system. All are labeled `[RECOMMENDED]`.

**Data governance & lineage**
1. Data ownership policy — which department/role owns/can edit each data entity.
2. Data lineage tracking — for every KPI number shown, be able to trace back to the exact source rows/import batch that produced it.
3. Data retention policy — how long raw imports, audit logs, and historical KPI snapshots are kept before archival.
4. KPI versioning — when a KPI formula changes, old historical values must not silently be recalculated with the new formula; version the formula definitions.
5. Data correction workflow — a formal "propose correction → approve → apply → audit" flow instead of silent edits to submitted production data.

**Master data & calendars**
6. Plant/site hierarchy — Plant → Line → Machine (and Shop/Building if multi-site) as first-class master data, not free text.
7. Shift master & shift calendar — named shifts with start/end times, including overnight shifts and shift-pattern rotation.
8. Holiday/working-day calendar per plant, feeding "planned production days" for monthly KPI targets.
9. Machine master with capacity, ideal cycle time, and criticality classification, separate from any one day's DPR entry.
10. Part/Product master with standard cycle time, cavity count, target rate — instead of re-entering cycle time per row, look it up.

**Approval & workflow**
11. Approval workflow for DPR submissions (supervisor sign-off before a shift's data is "final" and feeds official KPIs).
12. Escalation matrix for overdue actions/alerts (who gets notified if the owner doesn't act within X hours).
13. Change-management/approval for KPI target and weight changes (who can change a target, and is it logged).

**Data quality & operations**
14. Duplicate-submission detection across the same Machine+Shift+Date, especially important once Google Forms is added (a resubmission should update, not double-count).
15. Late/missing submission detection — flag when an expected shift entry hasn't arrived by a cutoff time.
16. Outlier/anomaly detection on KPI values (e.g., OEE > 100%, negative downtime) beyond simple range checks.
17. Backup and disaster-recovery policy (RPO/RTO targets), not just "the DB exists."
18. Monitoring/observability of the platform itself (uptime, ingestion job failures, API error rates) — distinct from monitoring the *factory's* data freshness.
19. A formal testing strategy (unit/integration/UAT) before go-live, and a UAT sign-off step with PRIL stakeholders.
20. Deployment/environment strategy — dev/staging/production separation, not just "it runs somewhere."

**Security & compliance**
21. Sensitive-data classification — HR salary/attrition data, safety incident details, and CAPA records likely need stricter access control than production counters.
22. Session/device management and forced logout policy for shared shop-floor terminals/kiosks used for HPR entry.
23. Environment-variable/secrets management strategy (no credentials in source code or spreadsheets).

**Product/UX completeness**
24. Notification channels beyond in-app — email/SMS/WhatsApp escalation for critical alerts (breakdown, safety incident).
25. Multi-language support for shop-floor operator-facing forms (Telugu/Hindi alongside English), since HPR entry is done by operators, not just management.
26. Offline-capable data entry for the shop floor in case of network loss (queue-and-sync), since a Medchal shop floor cannot always guarantee connectivity.
27. Printable/PDF shift-end report matching the familiar DPR_OEE layout, so supervisors keep a document they already recognize.
28. Configurable KPI targets/weights/thresholds via an admin UI — explicitly requested implicitly by "who I don't know, add" but never stated as a UI requirement; must be first-class, not hardcoded.
29. A documented onboarding/training plan for shop-floor operators who will move from paper/Excel to a digital form.

**Technical completeness**
30. API rate limiting and abuse protection on all public-facing ingestion endpoints (Google Forms webhook, REST API).
31. Pagination/virtualization strategy for any UI table showing more than ~500 rows (raw production records will grow into the millions).
32. A materialized/precomputed KPI aggregation layer so dashboards never compute OEE by scanning raw rows live at scale.
33. A "data freshness" status indicator per department/data source (LIVE/RECENT/STALE/OFFLINE), explicitly required by the *sense* of "live update" in the DOCX but not the word.
34. A change/version log ("what changed in this release") once the system is in production, to support ongoing iterative development without breaking trust in the numbers.

## 7. Business Rules Requiring Clarification

The DOCX doesn't answer these; they must be answered by PRIL before or during Phase 1–3 build. None are assumed — where a common industry default exists it's noted, but PRIL's actual practice governs.

| # | Question | Why it matters | Common default (not assumed to be PRIL's answer) |
|---|---|---|---|
| Q1 | Does any shift cross midnight, and if so, is a cross-midnight shift's production attributed entirely to the shift's start date? | Directly affects every date-based rollup (daily/weekly/monthly OEE) | Yes, common; attribute to shift start date |
| Q2 | How is Planned Downtime defined beyond "Tea/Lunch" — does it include changeover, PM, planned meetings, mould trial? | XLSX only has one Planned Downtime column; column Q "2. Mould Trial" is currently bucketed as *unplanned* idle time — confirm that's correct | Mould trial is often planned, not unplanned — needs confirmation |
| Q3 | What counts as "Setup Time" and is it Available Time or excluded entirely? | Availability formula depends on this | Usually excluded from Available Time (treated as planned) |
| Q4 | What is "Ideal Cycle Time" — is it a fixed master-data value per part/mould, or can it vary by machine/operator? | Performance formula depends on a single, trusted Ideal Cycle Time | Fixed per Part+Machine combination, changed only via engineering change control |
| Q5 | Can DPR/HPR data be corrected after submission? By whom, within what time window? | Drives the audit/approval-workflow design | Yes, supervisor-approved correction within 24–48 hrs is typical |
| Q6 | How should OEE be aggregated across time (day→week→month) and across machines (machine→line→plant)? Simple average, or time/production-weighted? | Core to Section 9; must not be assumed | Weighted average (see Section 9 recommendation) — confirm |
| Q7 | What is PRIL's target OEE (plant-wide and per line/machine)? | Needed for RAG thresholds on every OEE tile | Global manufacturing benchmark ~85% "world class", but PRIL's own target must be set by PRIL |
| Q8 | What defines "machine availability" for planning purposes — is a machine "available" during changeover, or only when actively running production? | Impacts Machine Utilization KPI, distinct from OEE Availability | — |
| Q9 | What is the definition of "capacity" referenced repeatedly in the DOCX — theoretical max, or a de-rated practical capacity? | Impacts Machine Utilization / Plan vs Capacity KPIs | — |
| Q10 | What is a "working day" for monthly targets — does it exclude Sundays/holidays uniformly across all plants, or per-plant? | Impacts monthly target denominators | — |
| Q11 | How are multiple plants/locations handled — is Medchal the only site today, or are there others that need the same structure? | Impacts Plant entity design and RBAC scope | — |
| Q12 | Who is authorized to close/verify a CAPA action, and is a second-person verification step required? | Impacts Action Management workflow (Section 21) | Verification by someone other than the action owner is best practice |
| Q13 | Is a "Line" grouping of machines used anywhere today, and if so what's the mapping? | Impacts master data hierarchy | — |
| Q14 | What quantity should "Rejection Rate" (as a department KPI, distinct from Rejection PPM) be expressed as — rejected/produced, or rejected/(produced+rejected)? | Small but must be fixed once, centrally | — |
| Q15 | Should HR and Safety incident-level detail be visible to Production/Shop-floor roles, or restricted to HR/Safety/Management only? | Impacts RBAC design directly | Restrict — treat as sensitive by default |
## 8. KPI Dictionary

Central rule: **every dashboard reads KPIs from one shared KPI engine/service — no dashboard is allowed to compute its own OEE, Rejection %, or any other KPI independently.** Targets/Warning/Critical thresholds below are **placeholder defaults** `[RECOMMENDED]` — PRIL must confirm real targets via the admin KPI Configuration screen (Section 25); nothing here is hardcoded into application logic.

Legend for **Aggregation Method**: `SUM` = simple sum; `WAVG` = weighted average (weight noted); `RATIO-OF-SUMS` = recompute the ratio from summed numerator/denominator, never average the ratio itself; `LATEST` = most recent value only; `COUNT` = count of records/events.

### 8.1 Manufacturing / OEE `[SOURCE: DOCX + XLSX]`

| KPI | Formula | Unit | Frequency | Owner | Data Source | Aggregation | Label |
|---|---|---|---|---|---|---|---|
| Availability (A) | (Run Time) / (Available Time) × 100 | % | Per shift | Production Supervisor | DPR_OEE rows | RATIO-OF-SUMS (ΣRun Time / ΣAvailable Time) | SOURCE |
| Performance (P) | (Actual Qty/Hr) / (Target Qty/Hr) × 100 | % | Per shift | Production Supervisor | DPR_OEE rows | RATIO-OF-SUMS | SOURCE |
| Quality (Q) | (Good Qty) / (Total Produced Qty) × 100 | % | Per shift | Quality/Production | DPR_OEE rows | RATIO-OF-SUMS | SOURCE |
| OEE | A × P × Q | % | Per shift, rolled to day/week/month/line/plant | Plant Head | Computed from A, P, Q above | See Section 9 (never average row OEE directly) | SOURCE |
| Machine Utilisation | Prod Qty / (Available Hours × Target Rate) × 100 | % | Per shift | Maintenance/Production | DPR_OEE col AG | RATIO-OF-SUMS | SOURCE (kept distinct from Performance, see 4.3.2) |
| Hourly Production Report (HPR) count/status | count of hourly submissions vs expected | count/% | Hourly | Operator/Supervisor | Form/API submissions | COUNT | SOURCE |
| Daily Production Report (DPR) status | Submitted / Approved / Pending | status | Daily | Supervisor | DPR record | LATEST | SOURCE |

### 8.2 Production `[SOURCE: DOCX]`

| KPI | Formula | Unit | Frequency | Owner | Data Source | Aggregation | Label |
|---|---|---|---|---|---|---|---|
| Production Achievement | Actual Qty / Target Qty × 100 | % | Shift/Day/Month | Production Manager | DPR | RATIO-OF-SUMS | SOURCE (formula recommended, target concept sourced) |
| Machine Utilization (Capacity) | Run Time / Total Available Plant Time × 100 | % | Day/Month | Production Manager | DPR + Machine master | RATIO-OF-SUMS | SOURCE concept, formula RECOMMENDED |
| Rejection Rate | Total Rejection Qty / Total Produced Qty × 100 | % | Shift/Day/Month | Quality/Production | DPR rejection columns | RATIO-OF-SUMS | SOURCE concept, formula RECOMMENDED — confirm Q14 |
| Downtime (Total) | Sum of Planned + Unplanned downtime minutes | minutes | Shift/Day | Production/Maintenance | DPR downtime columns | SUM | SOURCE |
| Plan vs Target vs Actual | Three-series comparison, no single ratio | Pcs | Day/Week/Month | PPC/Production | PPC Plan + DPR Actual | SUM per series | SOURCE |

### 8.3 Quality `[SOURCE: DOCX]`

| KPI | Formula | Unit | Frequency | Owner | Data Source | Aggregation | Label |
|---|---|---|---|---|---|---|---|
| Customer Complaints | Count of open/closed complaints | count | Month | Quality Manager | Quality module (RECOMMENDED new entity) | COUNT | SOURCE (name), entity RECOMMENDED |
| Internal Rejection | Rejected Qty (internal) / Produced Qty × 100 | % | Day/Month | Quality | DPR rejection columns | RATIO-OF-SUMS | SOURCE |
| CAPA Closure | Closed CAPAs / Total CAPAs Raised × 100 | % | Month | Quality | Action Management module | RATIO-OF-SUMS | SOURCE |
| Inspection Pass Rate | Passed Inspections / Total Inspections × 100 | % | Day/Month | Quality | Quality inspection records (RECOMMENDED new entity) | RATIO-OF-SUMS | SOURCE (name), entity RECOMMENDED |
| In-process PPM | In-process Rejected Qty / Produced Qty × 1,000,000 | PPM | Day/Month | Quality | DPR rejection columns | RATIO-OF-SUMS | SOURCE, formula matches XLSX AS logic |
| Final PPM | Final-inspection Rejected Qty / Dispatched Qty × 1,000,000 | PPM | Month | Quality | Final inspection + Dispatch (RECOMMENDED new entities) | RATIO-OF-SUMS | SOURCE (name), entities RECOMMENDED |
| Customer PPM | Customer-returned/rejected Qty / Supplied Qty × 1,000,000 | PPM | Month | Quality | Customer complaint/return records (RECOMMENDED) | RATIO-OF-SUMS | SOURCE (name), entity RECOMMENDED |

### 8.4 Maintenance `[SOURCE: DOCX]`

| KPI | Formula | Unit | Frequency | Owner | Data Source | Aggregation | Label |
|---|---|---|---|---|---|---|---|
| Preventive Maintenance Completion | PM Tasks Completed on Time / PM Tasks Scheduled × 100 | % | Month | Maintenance | Maintenance module (RECOMMENDED new entity: PM schedule) | RATIO-OF-SUMS | SOURCE (name), entity RECOMMENDED |
| Breakdown Frequency | Count of unplanned-breakdown events | count | Day/Week/Month | Maintenance | DPR "M/c Under BD" idle reason + Maintenance tickets | COUNT | SOURCE |
| MTTR (Mean Time To Repair) | Σ Repair Duration / Count of Breakdowns | minutes | Month | Maintenance | Maintenance tickets (RECOMMENDED new entity) | RATIO-OF-SUMS | SOURCE (name), formula RECOMMENDED (standard) |
| MTBF (Mean Time Between Failures) | Σ Run Time / Count of Breakdowns | hours | Month | Maintenance | DPR run time + Maintenance tickets | RATIO-OF-SUMS | SOURCE (name), formula RECOMMENDED (standard) |

### 8.5 PPC `[SOURCE: DOCX]`

| KPI | Formula | Unit | Frequency | Owner | Data Source | Aggregation | Label |
|---|---|---|---|---|---|---|---|
| Production Plan (n, n+1, n+2) | Planned Qty per part/machine/day, rolling 3-day horizon | Pcs | Day | PPC Planner | PPC Plan module (RECOMMENDED new entity) | LATEST per day | SOURCE (concept), entity RECOMMENDED |
| Plan vs Actual | Actual Qty / Planned Qty × 100 | % | Day/Week/Month | PPC | PPC Plan + DPR Actual | RATIO-OF-SUMS | SOURCE |
| Material Availability | Available Qty / Required Qty × 100 (per BOM/part) | % | Day | PPC/Stores | Inventory module (RECOMMENDED) | RATIO-OF-SUMS | SOURCE (name), formula RECOMMENDED |
| On-time Production | Shifts/Days meeting plan on schedule / Total Shifts × 100 | % | Week/Month | PPC | PPC Plan + DPR | RATIO-OF-SUMS | SOURCE |

### 8.6 SCM / Stores / Logistics `[SOURCE: DOCX for GRN, Delivery Accuracy, FG Stock; rest RECOMMENDED]`

| KPI | Formula | Unit | Frequency | Owner | Data Source | Aggregation | Label |
|---|---|---|---|---|---|---|---|
| GRN (Goods Receipt) Count/Value | Count / Value of GRNs processed | count/₹ | Day/Month | Stores | Inventory/GRN module (RECOMMENDED new entity) | SUM | SOURCE (name), entity RECOMMENDED |
| Delivery Accuracy | On-time & Complete Dispatches / Total Planned Dispatches × 100 | % | Day/Month | Logistics | Dispatch module (RECOMMENDED new entity) | RATIO-OF-SUMS | SOURCE |
| FG Stock | Finished Goods on hand, by part | Pcs/₹ | Daily snapshot | Stores | Inventory module | LATEST (snapshot) | SOURCE |
| Stock Below Minimum (alert-feeding KPI) | Count of SKUs below reorder point | count | Daily | Stores/SCM | Inventory module | COUNT | RECOMMENDED |
| Dispatch Delay | Actual Dispatch Date − Planned Dispatch Date | days | Per dispatch | Logistics | Dispatch module | AVG | RECOMMENDED |

### 8.7 HR `[SOURCE: DOCX]`

| KPI | Formula | Unit | Frequency | Owner | Data Source | Aggregation | Label |
|---|---|---|---|---|---|---|---|
| Employee Attendance | Present Days / Working Days × 100 | % | Day/Month | HR | HR module (RECOMMENDED new entity, or HRMS integration) | RATIO-OF-SUMS | SOURCE (name), entity RECOMMENDED |
| Attrition Rate | Employees Left in Period / Average Headcount in Period × 100 | % | Month | HR | HR module | RATIO-OF-SUMS | SOURCE (name), formula RECOMMENDED (standard) |
| Training Status | Trainings Completed / Trainings Planned × 100 | % | Month | HR | HR/Training module | RATIO-OF-SUMS | SOURCE (name), entity RECOMMENDED |

### 8.8 Safety `[SOURCE: DOCX]`

| KPI | Formula | Unit | Frequency | Owner | Data Source | Aggregation | Label |
|---|---|---|---|---|---|---|---|
| Safety Training Completion | Completed / Planned Safety Trainings × 100 | % | Month | Safety Officer | Safety module (RECOMMENDED new entity) | RATIO-OF-SUMS | SOURCE (name), entity RECOMMENDED |
| Near Miss Reports | Count of near-miss reports logged | count | Month | Safety Officer | Safety module | COUNT | SOURCE |
| Safety Audit Score | Points Scored / Points Possible × 100 | % | Per audit | Safety Officer | Safety audit records (RECOMMENDED new entity) | LATEST/AVG | SOURCE (name), entity RECOMMENDED |
| Lost Time Injury (LTI) | Count and Status of LTI events; LTI-free days counter | count/days | Ongoing | Safety Officer | Safety incident module | COUNT + running streak | SOURCE |

### 8.9 NPD / Design / R&D `[SOURCE: DOCX]`

| KPI | Formula | Unit | Frequency | Owner | Data Source | Aggregation | Label |
|---|---|---|---|---|---|---|---|
| Drawing Release Time | Actual Release Date − Planned Release Date | days | Per drawing | NPD Lead | NPD module (RECOMMENDED new entity) | AVG | SOURCE (name), entity RECOMMENDED |
| Engineering Change Requests Closed | ECRs Closed / ECRs Raised × 100 | % | Month | NPD Lead | NPD/ECR module | RATIO-OF-SUMS | SOURCE (name), entity RECOMMENDED |
| BOM Accuracy | Correct BOM Lines / Total BOM Lines Audited × 100 | % | Per audit | NPD/PPC | BOM records (RECOMMENDED) | RATIO-OF-SUMS | SOURCE (name), formula RECOMMENDED |
| Design Errors | Count of design-error NCRs raised | count | Month | NPD Lead | NPD/NCR module | COUNT | SOURCE (name), entity RECOMMENDED |

### 8.10 5S `[RECOMMENDED — mentioned in DOCX only as "5S dashboard i want to make like this"]`

| KPI | Formula | Unit | Frequency | Owner | Data Source | Aggregation | Label |
|---|---|---|---|---|---|---|---|
| 5S Audit Score | Points Scored / Points Possible × 100, per zone | % | Per audit (e.g. weekly) | 5S Champion | 5S audit module (RECOMMENDED new entity) | LATEST/AVG per zone | RECOMMENDED |
| Zone-wise 5S Trend | 5S Score over time, per zone/area | % over time | Weekly | 5S Champion | 5S audit module | Trend (time series) | RECOMMENDED |
| Open 5S Findings | Count of open corrective items from audits | count | Ongoing | 5S Champion | 5S module / linked to Action Management | COUNT | RECOMMENDED |

### 8.11 Overall Manufacturing / Management `[SOURCE: DOCX formula, rest RECOMMENDED]`

| KPI | Formula | Unit | Frequency | Owner | Data Source | Aggregation | Label |
|---|---|---|---|---|---|---|---|
| Overall KPI (%) | (Total Achieved KPI Points / Total KPI Target Points) × 100 | % | Day/Week/Month | Management | KPI engine (aggregate of all department KPIs) | See Section 8.12 for scoring methodology | SOURCE (formula) |
| Plant OEE | See Section 9 | % | Day/Week/Month | Plant Head | OEE engine | Weighted per Section 9 | SOURCE |
| Pending Actions (Top 10) | Open actions sorted by priority/due date | list | Live | Management/All | Action Management module | LATEST/sorted | SOURCE (concept) |

### 8.12 KPI Scorecard Methodology — Equal-Weight vs Weighted

`[RECOMMENDED]` The DOCX's Overall KPI formula (points achieved / points targeted) is a workable **scoring shell**, but it does not specify how each KPI converts to "points," nor how KPIs of different importance are weighted. Two options were evaluated:

- **Equal-weight scoring**: every KPI contributes the same weight to the Overall KPI. Simple to explain, but mathematically lets a trivial KPI (e.g., a single training record) move the score as much as OEE — inappropriate for an industrial plant scorecard.
- **Weighted scoring (recommended)**: each KPI (or each department) carries an admin-configurable weight; a KPI's "achieved points" = `min(Actual/Target, cap) × Weight` (cap, e.g. 100–120%, prevents one over-performing KPI from masking a failing one elsewhere), and Overall KPI % = `Σ(Achieved Points) / Σ(Target Points) × 100` exactly matching the DOCX formula's shape, but now weight-aware.

**Recommendation:** implement **weighted scoring**, with weights configurable per KPI and per department by a Super Admin/Management role through a KPI Configuration screen — never hardcoded in application code. Suggested starting weight distribution `[RECOMMENDED, confirm with PRIL]`: OEE and Safety-critical KPIs weighted highest (they represent both output and risk), followed by Quality and Delivery, with administrative KPIs (training records, documentation) weighted lowest. The exact numeric weights are a business decision for PRIL leadership, not an engineering one — the system must make them changeable without a code deployment.
## 9. OEE Methodology (Centralized — Single Source of Truth)

This is the most important calculation in the entire system. **One centralized OEE calculation service must own this logic; no page, report, or export may recompute OEE independently.**

### 9.1 Row-level (shift-machine-day) calculation `[SOURCE: XLSX, exact formulas]`

```
Shift Time (min)      = Stop Time − Start Time
Available Time (min)  = Shift Time − Planned Downtime
Total Idle Time (min) = Σ(unplanned downtime reason columns)
Run Time (min)        = Available Time − Total Idle Time

Availability (%)  = Run Time / Available Time × 100
Target Qty/Hr     = 3600 / (Cycle Time sec / Cavities)
Actual Qty/Hr     = Produced Qty / Run Time × 60
Performance (%)   = Actual Qty/Hr / Target Qty/Hr × 100
Total Rejection   = Σ(rejection reason columns)
Quality (%)       = (Produced Qty − Total Rejection) / Produced Qty × 100

OEE (%) = Availability × Performance × Quality   (all as decimals, then × 100 for display)
```

This row-level formula is exactly what the XLSX computes and must be preserved unchanged as the atomic unit of OEE.

### 9.2 The aggregation problem — why row-level OEE cannot simply be averaged `[RECOMMENDED methodology]`

Averaging a list of OEE percentages (e.g., `(82% + 91% + 40%) / 3`) is a common but **mathematically incorrect** shortcut once shifts/machines have different Available Time or different production volumes — a 2-hour shift and a 12-hour shift should not count equally toward a "daily OEE," and a short shift with an extreme OEE value can distort the number.

**Correct methodology — recompute from summed components, never average the ratio itself ("RATIO-OF-SUMS"):**

```
Availability(period) = Σ Run Time(all rows in period) / Σ Available Time(all rows in period)
Performance(period)  = Σ (Actual Qty × Run Time-weighted rate) ... 
                        → simplified & auditable form:
                        = Σ Produced Qty(all rows) / Σ (Run Time/60 × Target Qty/Hr)  [production-weighted]
Quality(period)       = Σ (Produced Qty − Total Rejection) / Σ Produced Qty
OEE(period)           = Availability(period) × Performance(period) × Quality(period)
```

In words: **sum the numerators, sum the denominators, then divide — at every level of aggregation** (shift → day, machine → line, line → plant, day → week → month). This guarantees that:
- Daily OEE = the OEE you'd get from treating the whole day as one giant "row."
- Weekly/Monthly OEE is automatically time-weighted (a day with more available time naturally counts for more).
- Machine → Line → Plant OEE is automatically volume/time-weighted, not a naive average across machines of different size/utilization.

This RATIO-OF-SUMS rule applies to **every rollup dimension**: Daily OEE, Shift OEE (already atomic), Machine OEE, Line OEE (sum across machines in the line), Weekly OEE, Monthly OEE, Plant OEE (sum across all lines/machines in the plant).

`[REQUIRES CLARIFICATION — Q6]`: Confirm with PRIL that production-weighted rollup (above) is the desired approach, versus a simpler but less accurate straight average across shifts, before this is locked into the KPI engine.

### 9.3 Machine/Line/Plant OEE hierarchy

```
Plant OEE   = RATIO-OF-SUMS across all Lines in the plant, for the period
Line OEE    = RATIO-OF-SUMS across all Machines assigned to that line, for the period
Machine OEE = RATIO-OF-SUMS across all Shifts for that machine, for the period
Shift OEE   = the row-level formula in 9.1 (atomic — no further aggregation needed)
```

Because the source XLSX has no "Line" concept today (Section 4.3.4), Line-level OEE requires the Machine→Line mapping to be established as master data first `[REQUIRES CLARIFICATION — Q13]`; until then, Machine and Plant levels can be delivered without it.

### 9.4 Implementation guidance

- Implement the OEE calculation as **one backend service/module** (e.g. `oee_engine`), called by every report, dashboard widget, export, and the AI analytics layer described in Section 22 — never duplicated in frontend code or in a report template.
- Store **both** the raw inputs (Run Time, Available Time, Produced Qty, Rejection Qty, etc.) **and** the computed row-level OEE/A/P/Q as persisted, indexed columns — recomputing on every dashboard load at scale is unnecessary load; recompute only when source rows change (see Section 12, precomputed KPI layer), and always recompute rollups by summing the underlying components, never by averaging stored percentages.
- Keep **Machine Efficiency (Machine Utilisation)** (XLSX column AG) as a separate, clearly labeled KPI alongside OEE — it is not interchangeable with the Performance component used inside OEE (Section 4.3.2).

## 10. Department-by-Department Requirements

For every department dashboard below: **Purpose, Users, KPIs** (see Section 8 for full formulas), **Filters, Charts, Tables, Drill-down, Alerts, Actions, Reports, Data Sources.**

### 10.1 Production
- **Purpose:** Real-time visibility into output vs. plan, machine performance, downtime, and rejections.
- **Users:** Production Manager, Shift Supervisor, Operators (view own machine), Plant Head.
- **Filters:** Date range, Plant, Line (once defined), Machine, Shift, Part, Operator.
- **Charts:** Plan vs Actual trend (line/bar), Machine Utilization bar chart, Downtime Pareto (bars + cumulative-% line, by reason), Rejection Pareto (by reason), OEE gauge (nested donuts: Availability/Performance/Quality/OEE, echoing the reference dashboard image style).
- **Tables:** Raw DPR entries (paginated), Machine-wise summary, Shift-wise summary.
- **Drill-down:** Plant → Line → Machine → Shift → Part → Operator → raw DPR row.
- **Alerts:** Production below target (configurable %), Downtime above threshold, Rejection above threshold.
- **Actions:** Link high-downtime/high-rejection events into Action Management (Section 21).
- **Reports:** DPR (matching the familiar Excel layout), Daily/Weekly/Monthly Production Summary.
- **Data sources:** DPR entries (manual, Excel/CSV import, future Google Form/API/PLC).

### 10.2 OEE (dedicated module, referenced by every other department view)
- **Purpose:** Single authoritative OEE view; the "answer" every other department's OEE tile pulls from.
- **Users:** Plant Head, Production Manager, Maintenance Manager, Management.
- **Filters:** Date range, Plant/Line/Machine, Shift.
- **Charts:** OEE trend line with target band, stacked A/P/Q breakdown, OEE waterfall (loss breakdown: Availability loss, Performance loss, Quality loss — in minutes/units, not just %), Downtime-reason Pareto.
- **Tables:** OEE by machine (ranked worst-to-best), Loss ledger.
- **Drill-down:** exact hierarchy in Section 17 (OEE → A/P/Q → Machine → Shift → Part → Operator → raw record).
- **Alerts:** OEE below target/critical threshold.
- **Reports:** Daily/Shift OEE Report, Monthly OEE Trend Report.

### 10.3 Quality
- **Purpose:** Track defects, complaints, and corrective actions.
- **Users:** Quality Manager, QA Engineers, Plant Head.
- **Filters:** Date range, Part, Machine, Rejection Reason, Complaint Status.
- **Charts:** Rejection Pareto by reason (from DPR rejection columns), PPM trend (In-process/Final/Customer), Customer Complaint trend, CAPA closure funnel.
- **Tables:** Open complaints, Open CAPAs, Rejection log.
- **Drill-down:** PPM → Part → Machine → Shift → raw rejection record.
- **Alerts:** PPM above threshold, CAPA overdue.
- **Actions:** Root-cause analysis workflow (Section 20), CAPA creation directly from a rejection spike.
- **Reports:** Monthly Quality Report, Customer Complaint Report.

### 10.4 PPC (Production Planning & Control)
- **Purpose:** Plan vs actual visibility across a rolling horizon.
- **Users:** PPC Planner, Production Manager, Plant Head.
- **Filters:** Date, Part, Machine, Plan Horizon (n/n+1/n+2).
- **Charts:** Plan vs Actual (rolling), Material Availability trend, On-time Production %.
- **Tables:** Rolling plan table, variance log.
- **Alerts:** Plan not met, material shortage risk.
- **Reports:** Weekly Plan Adherence Report.

### 10.5 SCM / Stores
- **Purpose:** Material/inventory visibility feeding production continuity.
- **Users:** Stores/SCM Manager, PPC, Plant Head.
- **Filters:** Date, Material/SKU, Supplier.
- **Charts:** GRN trend, Stock level trend vs. reorder point, FG Stock by part.
- **Tables:** Below-minimum stock list, Pending GRNs.
- **Alerts:** Stock below minimum, delayed GRN.
- **Reports:** Monthly Inventory Report.

### 10.6 Maintenance
- **Purpose:** Equipment reliability visibility.
- **Users:** Maintenance Manager, Technicians, Plant Head.
- **Filters:** Date, Machine, Breakdown Reason.
- **Charts:** Breakdown Pareto, MTTR/MTBF trend, PM completion trend.
- **Tables:** Open breakdown tickets, PM schedule adherence.
- **Alerts:** PM overdue, repeated breakdown on same machine.
- **Actions:** Link breakdown → root cause → corrective action.
- **Reports:** Monthly Maintenance Report.

### 10.7 Logistics / Dispatch
- **Purpose:** Outbound delivery performance.
- **Users:** Logistics Manager, Plant Head.
- **Filters:** Date, Customer, Dispatch Status.
- **Charts:** Delivery Accuracy trend, Dispatch delay distribution.
- **Tables:** Today's dispatch plan vs status, delayed dispatches.
- **Alerts:** Dispatch delayed.
- **Reports:** Monthly Dispatch/Delivery Report.

### 10.8 HR
- **Purpose:** Workforce visibility (access-restricted, see Section 17).
- **Users:** HR Manager, Plant Head (aggregate only), Management (aggregate only).
- **Filters:** Date, Department, Employee Category.
- **Charts:** Attendance trend, Attrition trend, Training completion.
- **Tables:** Training due list.
- **Alerts:** Attendance below threshold, training overdue.
- **Reports:** Monthly HR Report.
- **Access note:** individual employee-level detail must be restricted; shop-floor/production roles should see only aggregate/department-level HR numbers if any at all (Section 17, Q15).

### 10.9 Safety
- **Purpose:** Incident prevention and compliance visibility.
- **Users:** Safety Officer, Plant Head, Management.
- **Filters:** Date, Area/Zone, Incident Type.
- **Charts:** Near-miss trend, Safety audit score trend, LTI-free days counter (prominent, plant-wide visible).
- **Tables:** Open safety findings, Training-due list.
- **Alerts:** LTI event (critical, immediate), Safety audit overdue.
- **Reports:** Monthly Safety Report.

### 10.10 NPD / Design / R&D
- **Purpose:** New-product development pipeline visibility.
- **Users:** NPD Lead, Engineering, Plant Head.
- **Filters:** Date, Project/Part, ECR Status.
- **Charts:** Drawing release time trend, ECR closure trend, Design error trend.
- **Tables:** Open ECRs, BOM accuracy audit log.
- **Alerts:** Drawing release overdue, ECR overdue.
- **Reports:** Monthly NPD Status Report.

### 10.11 5S
- **Purpose:** Workplace-organization visibility (`[RECOMMENDED]` module, styled per the DOCX's reference intent).
- **Users:** 5S Champion, all department heads, Plant Head.
- **Filters:** Date, Zone/Area.
- **Charts:** 5S score by zone (bar/radar), trend over audits.
- **Tables:** Open 5S findings.
- **Alerts:** Score below threshold, finding overdue.
- **Reports:** Monthly 5S Audit Report.

### 10.12 Overall Manufacturing / Management
- **Purpose:** Plant performance understood in under 30 seconds (Section 16).
- **Users:** Management, Plant Head.
- **Filters:** Date range, Plant.
- **Charts:** Overall KPI scorecard tiles (Green/Amber/Red), Plant OEE, Production, Quality, Delivery, Maintenance, Safety, Inventory, Complaints summarized as single-number tiles with trend sparklines.
- **Tables:** Top 10 Pending Actions (all departments), data-freshness status per department (Section 14).
- **Drill-down:** every tile drills into its own department dashboard.
- **Alerts:** Roll-up of all critical alerts plant-wide.
- **Reports:** Daily Management Brief, Monthly Management Report.
## 11. Data Architecture

`[RECOMMENDED]` Layered architecture:

```
[Ingestion Layer]  Excel/CSV upload, Manual entry, Google Forms (Phase 2), REST API, (Future: IoT/PLC/MES/ERP)
        ↓
[Staging/Validation Layer]  raw import staged, column-mapped, validated, errors surfaced before commit
        ↓
[System of Record — PostgreSQL]  normalized transactional tables (production, downtime, rejection, quality, etc.)
        ↓
[KPI/OEE Engine]  centralized calculation service; writes precomputed KPI snapshots
        ↓
[API Layer]  REST + real-time channel (Section 13) serving the frontend
        ↓
[Frontend]  department dashboards, drill-downs, admin, reports
```

Raw uploaded files are archived (Section 24) separately from the parsed, validated data that lands in the database — the database, not the spreadsheet, is always the system of record once import is confirmed.

## 12. Database Architecture & ER Model

### 12.1 Database choice `[RECOMMENDED, with comparison]`

| Criterion | PostgreSQL | MySQL | MongoDB |
|---|---|---|---|
| Manufacturing relationships (Plant→Line→Machine→Shift→Part, foreign keys) | Strong (native FKs, constraints) | Strong | Weak (denormalized, app-enforced) |
| Transactions/data integrity | Strong (full ACID, row-level locking) | Strong | Weaker multi-document guarantees historically |
| KPI aggregation (SUM/GROUP BY across large tables) | Strong (window functions, materialized views) | Adequate | Requires aggregation pipeline, less mature for this workload |
| Historical/time-series analytics | Strong, extensible (TimescaleDB extension available) | Adequate | Adequate for flexible schemas, weaker for heavy rollups |
| Data integrity for financial/quality/audit data | Strong | Strong | Weaker without app-level enforcement |
| Reporting/BI tool compatibility | Excellent (standard SQL) | Excellent | Requires translation layers |
| Auditability | Strong (triggers, constraints, easy audit tables) | Strong | Possible but less standard |
| Dynamic/custom fields (Section 12's "customizable columns" requirement) | Good via JSONB columns | Weaker JSON support | Naturally flexible |

**Recommendation: PostgreSQL**, using its native `JSONB` column type to hold the metadata-driven custom fields (Section 12 dynamic-fields requirement) on top of a fully relational core schema. This gives PRIL strict relational integrity for the manufacturing entities that matter most (avoiding orphaned/duplicate machines, shifts, KPI records) while still allowing flexible custom fields without a NoSQL trade-off. A dedicated time-series extension (TimescaleDB) is noted as a `[FUTURE PHASE]` option if raw sensor-level IoT data volume (Section 26) eventually demands it — not needed for MVP volumes.

### 12.2 Core entities (ER model, described relationally)

`[RECOMMENDED — improves on the DOCX's suggested entity list by grouping and adding what's structurally necessary]`

**Master data / hierarchy**
- `plants` (id, name, code, timezone)
- `lines` (id, plant_id→plants, name, code)
- `machines` (id, line_id→lines nullable until Line is confirmed, plant_id→plants, code, name, ideal_cycle_time_sec, capacity, criticality)
- `shifts` (id, plant_id→plants, name, start_time, end_time, crosses_midnight bool)
- `shift_calendar` (id, plant_id, date, shift_id→shifts, is_holiday bool)
- `parts` (id, code, name, customer, material_grade, standard_cycle_time_sec, cavities, target_rate_per_hr)
- `operators` (id, employee_code, name, department_id)
- `departments` (id, name, code)
- `users` (id, employee_code, name, email, phone, password_hash, role_id→roles, department_id→departments, plant_id→plants nullable for multi-plant users)
- `roles` (id, name, description) — see Section 17

**Production / OEE**
- `production_records` (id, plant_id, machine_id, part_id, shift_id, operator_id, date, start_time, stop_time, cycle_time_sec, cavities, target_qty_hr, produced_qty, planned_downtime_min, custom_fields JSONB, source_import_id→import_jobs nullable, created_by, created_at, approved_by nullable, approved_at nullable)
- `downtime_reasons` (id, code, label, category [planned/unplanned], department_id)
- `downtime_records` (id, production_record_id→production_records, downtime_reason_id→downtime_reasons, minutes)
- `rejection_reasons` (id, code, label, department_id)
- `rejection_records` (id, production_record_id→production_records, rejection_reason_id→rejection_reasons, qty)
- `oee_snapshots` (id, scope_type [shift/machine/line/plant], scope_id, period_type [shift/day/week/month], period_start, period_end, availability, performance, quality, oee, computed_at) — the precomputed rollup table described in Section 12 (Performance) and Section 9.4

**Quality**
- `quality_inspections`, `customer_complaints`, `capa_actions` (or unified into `actions` — see Action Management)

**Maintenance**
- `pm_schedules`, `maintenance_tickets` (linked to `machines`, with breakdown/repair timestamps for MTTR/MTBF)

**PPC / SCM / Stores / Logistics**
- `production_plans` (plan horizon n/n+1/n+2), `materials`, `inventory_snapshots`, `grn_records`, `dispatch_records`

**HR / Safety / NPD / 5S**
- `hr_records` (attendance/attrition/training — access-restricted), `safety_incidents`, `safety_audits`, `npd_projects`, `ecr_records`, `five_s_audits`

**Cross-cutting**
- `kpi_definitions` (id, name, department_id, formula_description, unit, aggregation_method, target, warning_threshold, critical_threshold, weight, frequency, owner_role_id, version, is_active) — the admin-configurable KPI registry (Section 8.12)
- `actions` (id, source_module, source_record_id, title, problem, root_cause, corrective_action, preventive_action, owner_id, priority, status, created_at, due_date, closed_at, verified_by) — see Section 21
- `alerts` (id, kpi_definition_id nullable, source_module, severity, message, triggered_at, acknowledged_by, acknowledged_at)
- `import_jobs` (id, source_type [excel/csv/google_form/api], file_path, uploaded_by, status, row_count, error_count, mapping_config JSONB, created_at)
- `audit_logs` (id, user_id, entity_type, entity_id, field, old_value, new_value, reason, timestamp)
- `custom_field_definitions` (id, entity_type, field_name, field_type, is_required, options JSONB, department_id) — the metadata-driven custom field system (Section 12's requirement)

### 12.3 Key relationships
- `plants (1) → (many) lines → (many) machines`
- `machines (many) → (many) parts` via a `machine_part_mapping` (a machine can run multiple parts; a part can run on multiple machines)
- `production_records` is the central fact table — nearly everything (downtime, rejection, OEE) hangs off it by foreign key
- `actions` is polymorphic (`source_module` + `source_record_id`) so any department's finding (a quality rejection, a maintenance breakdown, a safety near-miss, a 5S audit gap) can generate a trackable action without a separate action table per department

### 12.4 Indexing & scale guidance
- Composite index on `production_records(machine_id, date, shift_id)` — the primary lookup pattern for every dashboard filter.
- Partition `production_records` and `oee_snapshots` by month once volumes justify it (Section 28).
- `oee_snapshots` is the table dashboards actually read for anything beyond the current shift — never make a dashboard aggregate raw `production_records` live for a monthly/yearly view.

## 13. Real-Time Architecture

### 13.1 Defining "real-time" precisely `[RECOMMENDED]`

| Term | Definition | Applies to |
|---|---|---|
| True real-time | Sub-second update, typically event/stream driven | Not realistic for Excel/Google Forms-based input; relevant only to future PLC/IoT (Section 27) |
| Near-real-time | A few seconds to ~1 minute latency | REST API submissions, manual entry, webhook-triggered Google Form submissions |
| Periodic refresh | Minutes (e.g., 1–15 min poll) | Excel/CSV batch uploads, Google Sheets polling fallback |

### 13.2 Realistic latency by source `[RECOMMENDED]`

| Source | Expected latency | Why |
|---|---|---|
| Manual entry (in-app form) | Near-real-time (seconds) | Direct API write, can push immediately |
| REST API | Near-real-time (seconds) | Direct write |
| Google Forms → Google Sheets | Near-real-time to ~1 min | Apps Script trigger on form submit can call a webhook within seconds; polling Sheets instead adds minutes |
| Excel/CSV upload | Periodic (on upload + validation time) | Inherently a batch action, not continuous |
| Future PLC/IoT | True real-time to near-real-time | Depends on MQTT/edge gateway design (Section 27) |

### 13.3 Update-delivery mechanism evaluation

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| Polling | Simple, works everywhere, easy to reason about | Wastes requests, latency = poll interval | MVP fallback only |
| WebSockets | True bidirectional, low latency | More server complexity, connection management at scale | **Recommended for MVP** (dashboard subscribes to relevant channels: plant/department) |
| Server-Sent Events (SSE) | Simpler than WebSockets, good for one-way server→client push | No client→server channel (not needed here), less universal browser tooling than WebSockets for reconnection | Viable alternative to WebSockets, slightly simpler to operate |
| Webhooks | Good for source→backend delivery (e.g., Google Forms/Apps Script → backend) | Not for backend→browser delivery | Use for ingestion (Section 15), not for dashboard push |
| Event-driven architecture (message queue/pub-sub) | Scales cleanly, decouples ingestion from KPI recompute from dashboard push | Operational overhead not justified at MVP scale | `[FUTURE PHASE]` once ingestion volume/sources multiply (IoT, MES, ERP) |

**Recommendation:** MVP uses **WebSockets** (or SSE as a simpler substitute) for dashboard push, triggered by the backend after any write commits and the KPI engine recomputes affected `oee_snapshots`/KPI values. **Future scale** (Phase 3, IoT/MES/ERP volumes) introduces a proper **event-driven/message-queue backbone** (e.g., an outbox pattern publishing to a broker) feeding both the real-time push layer and the KPI recompute workers, decoupling ingestion rate from dashboard rendering.

## 14. Data Ingestion Architecture

`[SOURCE: DOCX concept, RECOMMENDED workflow detail]` Unified pipeline for every source type (Excel, CSV, manual, Google Forms, REST API; future IoT/PLC/MES/ERP all converge on the same staging→validate→commit contract):

```
1. UPLOAD           user selects file / form submits / API posts payload
2. PREVIEW           first N rows shown to user (for file uploads) before commit
3. DETECT COLUMNS     system auto-detects headers, guesses types (date/number/text)
4. MAP COLUMNS        user (or a saved mapping template) maps source columns → system fields
                        — unmapped columns can become custom fields (Section 12) rather than being dropped
5. VALIDATE           range checks, cross-field checks (Section 13, Data Quality), duplicate checks
6. SHOW ERRORS         row-level error report; valid rows can be committed while invalid rows are fixed/skipped
7. CONFIRM             user explicitly confirms import (never silent auto-commit of unreviewed data)
8. IMPORT              rows written to production_records (+ related tables), import_jobs row logged
9. RECALCULATE KPIs    KPI/OEE engine recomputes affected oee_snapshots and KPI aggregates
10. UPDATE DASHBOARD   real-time channel (Section 13) pushes updated data to open dashboards
```

Column mapping should be **saveable as a template per department/source** so a recurring Excel export from PRIL's existing process doesn't need re-mapping every time — directly serving the DOCX's "columns and rows are customized" requirement without turning every upload into a manual chore.

## 15. Google Forms / Google Sheets Architecture

### 15.1 Fit assessment `[RECOMMENDED — do not assume Google Forms is automatically correct]`

| Concern | Assessment |
|---|---|
| Operator hourly production entry | Workable for a low-friction, single-operator-per-machine form, but Google Forms has no native offline queueing and no native duplicate-prevention beyond "one response per account," which requires Google account login per operator — a real friction point on a shared shop-floor device |
| Near-real-time dashboard updates | Achievable via a Google Apps Script trigger (`onFormSubmit`) that POSTs to the backend webhook immediately — this is materially faster and more reliable than polling the Google Sheet |
| Latency | Seconds, if using the Apps Script webhook trigger; minutes, if relying on a polling job against the Sheet |
| Authentication | Google Forms can require Google sign-in for one-response-per-person control, but PRIL shop-floor operators may not have individual Google accounts — needs an identity decision |
| API quotas | Google Sheets/Apps Script quotas are generous for this scale but are a real ceiling to be aware of if usage grows heavily (Section 28 volumes) |
| Data validation | Google Forms supports basic field validation (required, number range) but not the cross-field business rules in Section 13 (e.g., rejection ≤ produced) — those must still be enforced server-side after ingestion, not trusted from the form |
| Duplicate submissions | A real risk — an operator resubmitting the same hour's data must be detected and handled (update vs. reject) server-side; Google Forms itself won't prevent this |
| Editing submitted data | Google Forms edit-after-submit is limited/awkward; corrections are better handled through the platform's own correction workflow (Section 6, item 5), not by editing the Google Form response directly |
| Offline operation | Google Forms requires connectivity to submit; no built-in offline queue — a real limitation for shop-floor network dead zones |
| Network dependency | Same as above — a network outage blocks all Form-based HPR entry until connectivity returns |
| Security / data ownership | Data initially lives in Google's infrastructure (Sheets) before reaching PRIL's database — acceptable for non-sensitive production counts, a bigger concern for HR/Safety-sensitive data, which should **not** go through Google Forms |

### 15.2 Recommended architecture

- **Use Google Forms + Apps Script webhook** (not Sheet polling) for **low-sensitivity, high-frequency shop-floor data entry** — Production HPR being the clearest fit, matching the DOCX's explicit example.
- **Do not** route HR or Safety-incident data through Google Forms given the data-ownership and access-control concerns above; use the platform's own in-app forms for those, respecting RBAC (Section 17).
- Treat Google Forms as **one ingestion channel among several**, not the primary one — the platform's own in-app entry screens (works offline-capable per Section 6 item 26, and enforces full validation) should be the primary path; Google Forms is an accessible, familiar **fallback/parallel channel** for departments already comfortable with it, per the DOCX's explicit request.
- All Google Form submissions still flow through the same staging→validate→commit pipeline in Section 14 — a Form submission is not special-cased or trusted more than a CSV row.

## 16. Excel/CSV Import Architecture

Directly reuses the pipeline in Section 14. Two format-specific notes:
- The **DPR_OEE.xlsx structure itself** (Section 4) should be offered as a **built-in column-mapping template** so PRIL's existing shift-end Excel workflow can be uploaded with zero manual remapping on day one.
- CSV exports from other systems (or from Google Sheets) reuse the same mapping-template mechanism; a template, once saved, is reusable for both CSV and XLSX so the two paths do not diverge into separate codepaths.
## 17. User Roles & RBAC

`[SOURCE: DOCX concept, RECOMMENDED detail]`

| Role | Scope | Notes |
|---|---|---|
| Super Admin | Everything, all plants | System configuration, KPI targets/weights, user management |
| Management | Read-only, all departments, all plants (aggregate + drill-down) | Overall Manufacturing dashboard is their home view |
| Plant Head | Full read, all departments within their plant | Cross-department visibility at plant scope |
| Department Head | Full read/write within their department, all plants (or their plant) | e.g., Quality Manager sees Quality module fully |
| Manager/Supervisor | Read/write within their department + plant, approval rights on DPR submissions | e.g., Shift Supervisor approves DPR |
| Operator | Write access to their own HPR/DPR entries only; read own machine's data | Shop-floor role, most restrictive write scope |
| Engineer (Maintenance/NPD) | Read/write within their module | |
| Viewer | Read-only, configurable department scope | For auditors, external stakeholders |

**Sensitive-data rule** `[REQUIRES CLARIFICATION — Q15]`: by default, HR individual-employee data and Safety incident personal details are visible only to HR/Safety/Management/Super Admin roles — Production/Operator roles see aggregate department KPIs at most, not row-level HR/Safety records, unless PRIL confirms otherwise.

Department-level data isolation must be enforced at the **API/query layer** (row-level scoping by `department_id`/`plant_id` tied to the requesting user), not just hidden in the UI.

## 18. Security

`[RECOMMENDED, standard enterprise baseline]`
- **Authentication:** email/employee-code + password (bcrypt/argon2 hashed), with session tokens (JWT or server-side session) with reasonable expiry; MFA optional for Super Admin/Management roles.
- **Authorization:** RBAC enforced server-side on every API endpoint (Section 17) — never trust frontend role checks alone.
- **Transport:** HTTPS everywhere, HSTS enabled.
- **Input validation:** server-side validation on every ingestion path (Section 14 step 5), not just client-side.
- **Injection protection:** parameterized queries / ORM usage only — no raw string-concatenated SQL; output-encoding to prevent XSS in any user-supplied text (e.g., DPR remarks field) rendered back in the UI.
- **CSRF protection:** required for any cookie-session-based state-changing endpoint.
- **Rate limiting:** on authentication endpoints and all ingestion endpoints (Section 14), especially the Google Forms webhook and public API.
- **Secrets management:** environment variables / a secrets manager — never credentials committed to source control or embedded in exported files.
- **File upload safety:** validate file type/size before parsing; parse Excel/CSV in a sandboxed manner (malformed files should fail gracefully, not crash the ingestion service).

## 19. Audit Logging

`[SOURCE: DOCX intent via correction/traceability need, RECOMMENDED detail]` The `audit_logs` table (Section 12.2) captures, for every material change to production, quality, KPI-target, or user/role data: **who, what (entity+field), when, old value, new value**, and where applicable a **reason** (required for corrections to already-submitted DPR data, per Section 6 item 5's correction workflow). Audit history is retained per Section 24/27's retention policy and is itself read-only — audit rows are never edited or deleted through the application.

## 20. Alerts & Notifications

`[SOURCE: DOCX examples, RECOMMENDED detail]`

| Alert | Trigger | Severity |
|---|---|---|
| OEE below target | OEE(period) < target threshold (Section 8's `kpi_definitions.target`) | Warning/Critical (two-tier, per configured thresholds) |
| Production below target | Production Achievement < threshold | Warning |
| Downtime above threshold | Downtime minutes > threshold in a shift/day | Warning |
| Rejection above threshold | Rejection % or PPM > threshold | Warning/Critical |
| CAPA overdue | `actions.due_date` passed, status not Closed | Warning |
| Maintenance/PM overdue | PM schedule date passed, not completed | Warning |
| Material shortage | Material Availability < threshold | Warning |
| Stock below minimum | Inventory < reorder point | Warning |
| Dispatch delayed | Actual dispatch > planned dispatch date | Warning |
| Safety incident/LTI | New safety_incidents row with severity=LTI | Critical, immediate |
| Training overdue | Training due date passed | Info/Warning |
| NPD milestone delayed | Drawing/ECR due date passed | Warning |
| Data freshness stale | No data received from a source within configured window (Section 14 of DOCX intent / this doc's Section 6 item 15) | Warning |

**Escalation logic** `[RECOMMENDED]`: unacknowledged Critical alerts escalate to the next role up (Supervisor → Department Head → Plant Head) after a configurable time window; escalation path and window are admin-configurable, not hardcoded.

## 21. Action Management (CAPA)

`[SOURCE: DOCX "Top 10 Pending Actions", RECOMMENDED full workflow]` Single polymorphic `actions` table (Section 12.2) serving every department. Fields: Action ID, Department, Problem, Root Cause, Corrective Action, Preventive Action, Owner, Priority, Created Date, Due Date, Status, Closure Date, Remarks, Evidence (attachment).

**Statuses:** Open → In Progress → (On Hold) → Completed → Verified → Closed; Overdue is a derived state (Open/In Progress past due date), not a stored status.

**Relationship chain** (Root Cause Analysis, expanded per DOCX's Pareto/Fishbone mention):
```
KPI problem/loss/defect → Root Cause (5-Why / Fishbone/Ishikawa) → Corrective Action → Preventive Action → Owner → Due Date → Closure → Verification (by someone other than the owner, `[REQUIRES CLARIFICATION — Q12]`)
```

**Dashboard views:** Top 10 Pending Actions (plant-wide, sorted by priority then due date), Overdue, Due Today, Due This Week, grouped Department-wise and Owner-wise — directly fulfilling the DOCX requirement.

## 22. AI Analytics Architecture

`[RECOMMENDED, explicitly optional layer]` An AI layer that **only answers from the actual database** (via the KPI engine and structured queries) — never from open-ended generation — to avoid hallucinated numbers on a factory floor.

**Pattern:** natural-language question → intent/entity extraction → constrained query against `oee_snapshots`/`production_records`/`actions`/etc. → structured result → the AI composes a natural-language answer **strictly from the returned data**, citing the time period and underlying KPI(s).

Example questions it should handle: "Why did OEE fall today?" (query today's `oee_snapshots` vs. yesterday's, decompose into A/P/Q deltas, pull top downtime/rejection reasons from `downtime_records`/`rejection_records` for the delta period), "Which machine had the highest downtime?" (aggregate `downtime_records` grouped by machine for the asked period), "Top rejection causes?" (aggregate `rejection_records` by reason), "Which department has the lowest KPI?" (compare `kpi_definitions` actual-vs-target across departments), "Top pending actions?" (query `actions`).

- **MVP AI:** `[FUTURE PHASE — Phase 2/3]`, not required for MVP; when built, a retrieval/tool-calling pattern (the AI calls the same KPI-engine query functions the dashboards use) rather than free-text generation over raw data.
- **Future AI:** natural-language chat interface across all departments.
- **Predictive analytics** (failure prediction, demand forecasting): `[FUTURE PHASE 3]`, requires sufficient historical data volume first.

## 23. API Architecture

`[RECOMMENDED]` REST API (versioned, e.g. `/api/v1/...`) as the primary interface, organized by domain: `/auth`, `/production`, `/oee`, `/quality`, `/maintenance`, `/ppc`, `/scm`, `/hr`, `/safety`, `/npd`, `/five-s`, `/kpis`, `/actions`, `/alerts`, `/imports`, `/reports`, `/admin`. A real-time channel (WebSocket/SSE, Section 13) runs alongside REST for dashboard push. Every endpoint enforces RBAC scoping (Section 17) and input validation (Section 18) server-side. Google Forms integration uses a dedicated authenticated webhook endpoint (Section 15), separate from the general-purpose REST API surface, so it can be independently rate-limited and monitored.

## 24. Frontend Architecture

`[RECOMMENDED]` React + TypeScript SPA, department-scoped routing matching the navigation in Section 30 (Development Roadmap references), component library for charts (e.g., ECharts/Recharts) capable of Pareto (dual-axis bar+cumulative-line), donut/gauge (OEE/A/P/Q), trend lines, and tables with drill-down and pagination/virtualization for large record sets (Section 28). Visual direction (Section 24 of the original brief, i.e. UI/UX): a professional industrial-BI aesthetic — dark or clean card-based tiles, Patil Group brand colors (maroon/orange, per the actual logo), a **subtle, low-opacity railway-track graphic motif** used tastefully as a background accent (not a literal photographic reproduction of any stock image), clear RAG (Red/Amber/Green) status coloring, minimal animation, responsive from mobile through a large-screen TV/kiosk "overview" mode for the shop floor.

## 25. Backend Architecture

`[RECOMMENDED]` Node.js (NestJS/Express) or Python (FastAPI/Django) service — either is viable; **FastAPI (Python)** is a reasonable default given the heavy analytical/aggregation workload and Python's strength in data-processing libraries useful for Excel/CSV parsing (pandas/openpyxl) and future AI/analytics work, while **Node.js/NestJS** is an equally valid default if the team's existing skillset favors JavaScript/TypeScript end-to-end (shared types with the React frontend). The Master Prompt in Section 37 asks the coding agent to make and justify this call explicitly rather than defaulting silently. Layered internally as: API layer → service layer (business logic, including the KPI/OEE engine as its own service module) → repository/data-access layer → PostgreSQL.

## 26. Deployment Architecture

`[RECOMMENDED]` Docker-containerized services (frontend, backend, database, real-time/worker processes) orchestrated via Docker Compose for MVP; cloud-agnostic so it can run on AWS/Azure or on-PRIL-premises infrastructure. Separate **dev / staging / production** environments (Section 6 item 20), with environment variables (never secrets in code) injected per environment (Section 18).

## 27. Backup & Disaster Recovery

`[RECOMMENDED]` Automated daily database backups with a defined retention window (e.g., 30 daily + 12 monthly, tune with PRIL), tested restore procedure (a backup that's never been restored is not a backup), and separate durable storage for raw uploaded files (Section 24 of the original brief — file storage) so the system survives server restarts, redeployments, and container restarts without data loss. RPO/RTO targets should be explicitly agreed with PRIL, not assumed.

## 28. Monitoring & Observability

`[RECOMMENDED]` Two distinct monitoring concerns, both needed: (1) **platform health** — uptime, API error rates, ingestion job failure rates, real-time channel connection health; (2) **factory data health** — the data-freshness layer (Section 14 of the original brief: LIVE/RECENT/STALE/OFFLINE per department/data source) that alerts when expected shop-floor data stops arriving. Structured logging with correlation IDs across the ingestion → KPI-recompute → dashboard-push chain, to make lineage (Section 6 item 2) actually traceable.

## 29. Testing Strategy

`[RECOMMENDED]` Unit tests on the KPI/OEE engine specifically (Section 9's formulas are the highest-value thing to get exactly right and regression-proof, with test cases built directly from the XLSX's real row-5/row-6 example values as fixtures), integration tests on the ingestion pipeline (Section 14) including malformed-file and duplicate-submission cases, and a formal UAT pass with PRIL stakeholders comparing the new system's DPR/OEE output against the existing Excel sheet for the same input data before go-live, per Section 6 item 19.
## 30. MVP Scope

`[RECOMMENDED]` Smallest useful, production-ready release:

**In scope:** Authentication + RBAC (core roles), PostgreSQL schema (master data + production/OEE/quality/maintenance/PPC core tables), Excel/CSV import pipeline (Section 14) with the DPR_OEE.xlsx template as a built-in mapping (Section 16), Production + OEE module (fully matching Section 9's methodology), Quality module (rejection tracking, PPM), Maintenance module (breakdown/PM basics), PPC module (plan vs actual), centralized KPI engine + admin-configurable targets/weights (Section 8.12), Overall Manufacturing / Management dashboard, filters + drill-down (Section 17 of the original brief), Alerts (core set), Action Management (Top 10 Pending Actions + CAPA workflow), Excel/PDF export, Audit log, Data-freshness indicator, WebSocket/SSE-based near-real-time updates.

**Out of MVP scope (deferred, see Phase 2/3):** SCM/Stores/Logistics/HR/Safety/5S/NPD modules (structurally supported by the schema but not built out with full UI in MVP), Google Forms integration, AI analytics, advanced scheduled/emailed reporting, IoT/PLC/MES/ERP integration.

## 31. Phase 2 Scope

`[SOURCE: DOCX intent, RECOMMENDED sequencing]` SCM, Stores, Logistics, HR, Safety, 5S, NPD full modules; Google Forms + Apps Script webhook integration (Section 15) starting with Production HPR; advanced reporting (scheduled reports, email delivery); refined AI analytics (Section 22 "MVP AI" tier: retrieval-based Q&A over the KPI engine).

## 32. Phase 3 Scope

`[SOURCE: DOCX Section 27 intent, RECOMMENDED]` IoT/PLC/SCADA/MQTT edge ingestion (Section 27's future flow: Machine → PLC → Edge Gateway → MQTT → ingestion → database → KPI engine → dashboard), MES/ERP integration, predictive maintenance, demand forecasting, quality prediction/anomaly detection, event-driven/message-queue backbone at scale (Section 13.3), advanced/predictive AI, digital twin concepts.

## 33. Development Roadmap

`[RECOMMENDED, matches the phased build discipline mandated in Section 38 of the original brief]`

| Phase | Focus | Key deliverable |
|---|---|---|
| 1 | Foundation | Repo scaffold, Docker environment, CI skeleton, coding standards |
| 2 | Authentication & RBAC | Login, roles, department scoping |
| 3 | Database | Full schema (Section 12), migrations, seed/master data |
| 4 | Data ingestion | Excel/CSV pipeline (Section 14), DPR_OEE template mapping (Section 16) |
| 5 | Production & OEE | Section 9's engine, Production + OEE dashboards |
| 6 | Quality | Rejection/PPM/CAPA basics |
| 7 | Maintenance & PPC | Breakdown/PM, Plan vs Actual |
| 8 | KPI engine & Overall dashboard | Section 8.12 scoring, Management view, alerts, actions |
| 9 | Remaining departments (Phase 2) | SCM/Stores/Logistics/HR/Safety/5S/NPD |
| 10 | Google Forms integration (Phase 2) | HPR via Forms |
| 11 | Reporting & export | PDF/Excel exports, scheduled reports |
| 12 | AI analytics (Phase 2/3) | Retrieval-based Q&A |
| 13+ | Phase 3 | IoT/PLC/MES/ERP, predictive analytics |

## 34. Risks

`[RECOMMENDED]`
1. **OEE trust risk** — if the new system's OEE ever disagrees with the familiar Excel sheet during parallel-run/UAT, PRIL staff will distrust the whole platform; mitigate via Section 29's fixture-based testing against real XLSX values before go-live.
2. **Data-entry adoption risk** — moving operators from paper/Excel to digital entry (Google Form or in-app) can fail without training and a genuinely low-friction UI (Section 6 item 29).
3. **Master-data quality risk** — free-text Machine/Shift/Part fields in the current Excel (Section 4.3.3) mean historical data will need cleanup/mapping before it can be trusted in the new normalized schema.
4. **Scope-creep risk** — 12 departments plus AI plus future IoT is a large surface; the phased roadmap (Section 33) and strict MVP boundary (Section 30) exist specifically to manage this.
5. **Connectivity risk** — Google Forms and even in-app entry assume network availability the Medchal shop floor may not always have; the offline-capable entry requirement (Section 6 item 26) mitigates this but adds engineering complexity that must be planned for, not bolted on later.
6. **Ambiguous business rules risk** — the 15 open questions in Section 7 (shift boundaries, planned-vs-unplanned downtime definitions, OEE aggregation approach, targets) directly change calculation outputs; building before they're answered risks expensive rework.

## 35. Open Questions Requiring Clarification (Consolidated)

All items below are also detailed inline in Sections 4, 7, and 17 — consolidated here for a single clarification checklist to run past PRIL before/during Phase 1–5:

1. Do shifts cross midnight, and how is date attribution handled? (Q1)
2. What exactly counts as Planned Downtime beyond tea/lunch — is Mould Trial planned or unplanned? (Q2)
3. Is Setup Time part of Available Time or excluded? (Q3)
4. Is Ideal Cycle Time fixed master data per Part+Machine, and who controls changes to it? (Q4)
5. Can DPR/HPR be corrected after submission — by whom, within what window? (Q5)
6. Is production-weighted RATIO-OF-SUMS the desired OEE aggregation approach across time and machine hierarchy? (Q6)
7. What is PRIL's actual target OEE (plant-wide and per line/machine)? (Q7)
8. What defines "machine availability" for Machine Utilization vs. OEE Availability? (Q8)
9. What is the definition of "capacity" used across Production/PPC KPIs? (Q9)
10. What is a "working day" for monthly targets, and does it vary by plant? (Q10)
11. Is Medchal the only plant today, or must the system support multiple plants from day one? (Q11)
12. Who verifies/closes a CAPA action, and is independent verification required? (Q12)
13. Is "Line" (machine grouping) used today, and what is the Machine→Line mapping? (Q13)
14. Should Rejection Rate be Rejected/Produced or Rejected/(Produced+Rejected)? (Q14)
15. Should HR/Safety incident-level detail be restricted from Production/shop-floor roles? (Q15)
16. Does the "Heat No." traceability field need to be captured, and from what process step? (Section 4.3.6)
17. What weight distribution should the Overall KPI scorecard use across departments/KPIs? (Section 8.12)

---

# SECTION B — FINAL MASTER DEVELOPMENT PROMPT

## 36. How to Use This Prompt

Copy everything inside the fenced block in Section 37 and paste it as the **first message** to your AI coding agent (Claude Code, Cursor, Replit Agent, etc.) in a **fresh project**. The prompt is self-contained — it does not assume the agent has read Section A of this document — but you (PRIL) should keep Section A open alongside it, because the prompt will ask the agent to **stop and ask you** the open questions from Section 7/35 at the relevant phase rather than guessing. Answer those questions as they come up; do not pre-answer them for the agent unless you already know PRIL's real practice.

The prompt is written to make the agent build **incrementally, phase by phase**, explaining its work and never silently breaking earlier phases — per your original instruction. Do not skip ahead and ask it to "just build everything" in one shot even if it offers to.

## 37. The Master Development Prompt

```
ROLE

You are acting as a senior full-stack architect and implementer building a real-time
manufacturing analytics and OEE/KPI dashboard for Patil Rail Infrastructure Pvt. Ltd.
(PRIL), part of Patil Group. You will build this INCREMENTALLY, in the phases defined
below. Do not generate the entire application in one response. Do not skip phases.
Do not silently break a previous phase's working functionality when building a later
one — if a change requires modifying earlier code, say so explicitly and explain why.

============================================================
1. PROJECT OBJECTIVE
============================================================

Build a real-time, multi-department manufacturing analytics and performance dashboard
for PRIL's Medchal plant (and designed to extend to additional plants). Users upload
Excel/CSV production data, enter data manually, and (Phase 2+) submit data via Google
Forms; the system validates and stores it, computes OEE and department KPIs through
ONE centralized calculation engine, and shows live-updating, role-scoped, department-
wise dashboards with drill-down, alerts, and a CAPA-style action-tracking module.

The single most important correctness requirement: OEE and every KPI must be computed
by ONE shared backend engine and must never be computed independently by a report, a
frontend chart, or an export — every consumer reads the same computed numbers.

============================================================
2. LABELING DISCIPLINE YOU MUST FOLLOW THROUGHOUT THE BUILD
============================================================

When you produce code, comments, or explanations, distinguish:
- SOURCE: a requirement or formula taken directly from PRIL's real Excel template or
  their written brief (both reproduced below) — implement these exactly.
- RECOMMENDED: an addition from professional best practice, not explicitly requested.
  Implement these, but flag them clearly in your phase summary as recommendations the
  business should confirm, not settled requirements.
- REQUIRES CLARIFICATION: a business rule PRIL has not yet confirmed (list in Section 6
  below). Where you must make a build decision before an answer exists, implement the
  most reasonable default, make it a CONFIGURABLE value (not hardcoded), and clearly
  flag it in that phase's summary as "assumed pending confirmation."
- FUTURE PHASE: explicitly out of scope until Phase 3+ (Section 11). Do not build it
  now; design the schema/architecture so it is not precluded later.

============================================================
3. GROUND-TRUTH SOURCE: THE REAL EXCEL TEMPLATE (DPR_OEE)
============================================================

PRIL's actual shop-floor template is a single sheet "DPR_OEE" with these exact columns
and formulas. This is SOURCE, not an approximation — implement the OEE math exactly as
shown; do not invent a different OEE formula.

RAW INPUT COLUMNS:
S.No., Date, Shift, Machine Name/No., Start Time, Stop Time, Operator Name, Part Name,
Part No., Cavity, Cycle Time (Sec.), Target Qty./Hr. (Pcs.) [calculated, see below],
Prod. Qty. (Pcs.), Planned Down Time (Tea/Lunch, minutes), 11 unplanned-idle-time-reason
columns in minutes (Manpower Shortage, Mould Trial, Bin Shortage, Material Shortage,
M/c Under BD, Nozzle Block, Mould Problem, Crystal/Insert Shortage, Power Failure,
Process Setting, Others), 10 rejection-reason columns in pieces (Short Moulding,
Shrinkage Mark, Silver Streak, Flow Mark, Weld Line, Dent Mark, Power Cut, Black Marks,
Crack Marks, Others), Any Other Remarks (free text).

EXACT CALCULATION FORMULAS (implement in one backend "oee_engine" module):

  Shift Time (min)      = Stop Time - Start Time  (in minutes)
  Target Qty/Hr         = 3600 / (Cycle Time sec / Cavities)
  Available Time (min)  = Shift Time - Planned Down Time
  Total Idle Time (min) = SUM(the 11 unplanned-idle-reason columns)
  Total Run Time (min)  = Available Time - Total Idle Time
  Availability (A)      = Total Run Time / Available Time            [x100 for %]
  Actual Qty/Hr         = Prod Qty / Total Run Time * 60
  Performance (P)       = Actual Qty/Hr / Target Qty/Hr               [x100 for %]
  Machine Efficiency    = Prod Qty / (Available Time/60 * Target Qty/Hr)  [x100 for %]
                           -- NOTE: this is a SEPARATE metric ("Machine Utilisation"),
                           NOT the same as Performance (P) above. Do not merge them.
  Total Rejection       = SUM(the 10 rejection-reason columns)
  Rejection PPM         = Total Rejection / Prod Qty * 1,000,000
  Quality (Q)           = (Prod Qty - Total Rejection) / Prod Qty      [x100 for %]
  OEE                   = Availability(decimal) * Performance(decimal) * Quality(decimal)  [x100 for %]

AGGREGATION RULE (critical — read carefully): when rolling OEE up from shift-level to
day/week/month, or from machine to line to plant, NEVER average the OEE percentages
directly. Instead, at every rollup level, sum the underlying components first and
recompute the ratio from the sums ("ratio-of-sums"):

  Availability(period) = SUM(Total Run Time across rows) / SUM(Available Time across rows)
  Quality(period)      = SUM(Prod Qty - Total Rejection across rows) / SUM(Prod Qty across rows)
  Performance(period)  = SUM(Prod Qty across rows) / SUM(Available Time/60 * Target Qty/Hr across rows)
  OEE(period)           = Availability(period) * Performance(period) * Quality(period)

Build this as ONE reusable aggregation function parameterized by scope (shift/machine/
line/plant) and period (shift/day/week/month), not copy-pasted per screen.

Write unit tests for oee_engine using these two REAL example rows from PRIL's actual
file as fixtures (values are exact, from the live workbook):

  Row 1: Shift Time=720min, Planned Down Time=60, Prod Qty=1200, Cavity=2, Cycle
         Time=60sec, unplanned idle=20min (M/c Under BD), rejections: Short Moulding=1,
         Shrinkage Mark=2, Silver Streak=3, Flow Mark=5, Weld Line=4 (total rejection=15)
         Expected: Available Time=660, Total Idle=20, Run Time=640,
         Availability=96.97%, Target Qty/Hr=120, Actual Qty/Hr=112.5,
         Performance=93.75%, Machine Efficiency=90.91%, Rejection PPM=12500,
         Quality=98.75%, OEE=89.77%

  Row 2: Shift Time=720min, Planned Down Time=30, Prod Qty=1100, Cavity=2, Cycle
         Time=60sec, unplanned idle=20min (Bin Shortage), rejections: Dent Mark=4
         (total rejection=4)
         Expected: Available Time=690, Total Idle=20, Run Time=670,
         Availability=97.10%, Target Qty/Hr=120, Actual Qty/Hr=98.51,
         Performance=82.09%, Machine Efficiency=79.71%, Rejection PPM=3636.36,
         Quality=99.64%, OEE=79.42%

If your computed values differ from these by more than rounding error, your formula
implementation is wrong — fix it before proceeding, do not adjust the fixtures.

============================================================
4. GROUND-TRUTH SOURCE: PRIL'S WRITTEN BRIEF (SUMMARIZED, SOURCE-LABELED)
============================================================

- Upload Excel/CSV; auto-generate Pareto charts, pie charts, bar charts, fishbone/
  root-cause diagrams from uploaded data.
- When data updates, dashboards and charts update without manual refresh
  (near-real-time; see Section 8 below for the precise latency targets).
- Department-wise dashboards: Production, Quality, PPC, SCM, Stores, Maintenance,
  NPD, HR, Safety, Logistics/Dispatch, 5S, and an Overall Manufacturing view. Do not
  drop any of these departments.
- Uploaded data's columns/rows must be customizable, not a rigid fixed schema.
- Each department gets a Google Form (Phase 2) feeding a Google Sheet, which feeds
  the dashboard; operators submit Hourly Production Reports (HPR) this way.
- Each department can export its data.
- Branding: Patil Group name/logo, owner name (display only, do not fabricate any
  personal detail beyond name/title), a Safety Rules element, a subtle railway-track-
  motif background (an ORIGINAL, tasteful graphic treatment evoking rail infrastructure
  — not a reproduction of any specific photograph).
- A 5S dashboard module.
- KPI scorecards per department; a "Top 10 Pending Actions" list.
- Overall KPI (%) = (Total Achieved KPI Points / Total KPI Target Points) x 100 — the
  scoring shell; implement it as WEIGHTED (each KPI has an admin-configurable weight
  and target; achieved points = min(actual/target, cap) * weight, cap default 120%,
  admin-configurable) rather than naive equal weighting across dissimilar KPIs.

DEPARTMENT KPI LIST (implement all; formulas either SOURCE-labeled from the brief or
RECOMMENDED where the brief names the KPI but not its formula):
Manufacturing: OEE, Availability, Performance, Quality, HPR status, DPR status.
Production: Production Achievement (Actual/Target*100), Machine Utilization, Rejection
  Rate (Total Rejection/Produced*100), Downtime (sum), Plan vs Target vs Actual.
Quality: Customer Complaints (count), Internal Rejection %, CAPA Closure %, Inspection
  Pass Rate %, In-process PPM, Final PPM, Customer PPM.
Maintenance: Preventive Maintenance Completion %, Breakdown Frequency (count), MTTR,
  MTBF.
PPC: Production Plan (n/n+1/n+2 day horizon), Plan vs Actual %, Material Availability %,
  On-time Production %.
Logistics/SCM/Stores: GRN count/value, Delivery Accuracy %, FG Stock, Stock Below
  Minimum count, Dispatch Delay (days).
HR: Employee Attendance %, Attrition Rate %, Training Status %. (ACCESS-RESTRICTED —
  see RBAC section.)
Safety: Safety Training Completion %, Near Miss Reports (count), Safety Audit Score %,
  Lost Time Injury (count + LTI-free-days streak).
NPD/Design/R&D: Drawing Release Time (days), ECR Closed %, BOM Accuracy %, Design
  Errors (count).
5S (RECOMMENDED module): 5S Audit Score % per zone, zone-wise trend, Open 5S Findings
  count.

============================================================
5. NON-FUNCTIONAL REQUIREMENTS
============================================================

- Every KPI/OEE number traceable back to its source rows (data lineage).
- No dashboard may load millions of raw rows into the browser — always query
  precomputed aggregates/pagination.
- RBAC enforced server-side on every endpoint, never only in the frontend.
- All state-changing actions logged to an append-only audit_logs table (who, what,
  when, old value, new value, reason for corrections).
- The app must survive server restarts/redeployments with zero data loss (persistent
  DB volume + backed-up file storage for raw uploads).
- Near-real-time dashboard updates: seconds-level for manual/API entry, ~1 minute or
  better for Google Forms via webhook (not polling), batch/on-demand for Excel/CSV
  uploads. Do not claim true sub-second real-time for spreadsheet-based sources.

============================================================
6. OPEN BUSINESS QUESTIONS — ASK THE USER, DO NOT SILENTLY ASSUME
============================================================

Before or during Phase 5 (Production/OEE), explicitly ask PRIL's representative these
questions. Where an answer isn't available yet, implement the most defensible default
as an ADMIN-CONFIGURABLE setting (never hardcoded) and flag it as assumed:

1. Do any shifts cross midnight? How should date attribution work for those?
2. Is "Mould Trial" planned or unplanned downtime? What other planned-downtime types
   exist besides tea/lunch (changeover, PM, meetings)?
3. Is Setup Time included in Available Time or excluded entirely?
4. Is Ideal Cycle Time fixed master data per Part+Machine? Who can change it?
5. Can DPR/HPR data be corrected after submission, by whom, within what time window?
6. Confirm the ratio-of-sums OEE aggregation approach (Section 3) is what PRIL wants,
   versus a simple average.
7. What is PRIL's target OEE (plant-wide and per line/machine)?
8. What defines "machine availability" for Machine Utilization vs. OEE Availability?
9. What is PRIL's definition of "capacity" for Production/PPC KPIs?
10. What counts as a "working day" for monthly targets, and does it vary by plant?
11. Is Medchal the only plant, or must multi-plant be supported from day one?
12. Who verifies/closes a CAPA action — does it require a second person, not the owner?
13. Does PRIL group machines into "Lines" today? What's the mapping?
14. Should Rejection Rate be Rejected/Produced, or Rejected/(Produced+Rejected)?
15. Should HR and Safety incident-level detail be hidden from Production/shop-floor
    roles? (Default to YES — restrict — until told otherwise.)
16. Does "Heat No." (material traceability) need to be captured, and at what step?
17. What weight distribution should the Overall KPI scorecard use across departments?

============================================================
7. TECHNOLOGY STACK (JUSTIFY, DO NOT SILENTLY SUBSTITUTE)
============================================================

- Frontend: React + TypeScript, Tailwind CSS, a charting library capable of Pareto
  (dual-axis bar + cumulative-% line), donut/gauge (OEE/A/P/Q), and trend-line charts
  (e.g. Recharts or ECharts — pick one and justify), a data-grid component with
  pagination/virtualization for raw record tables (e.g. AG Grid or TanStack Table).
- Backend: choose FastAPI (Python) OR NestJS (Node.js/TypeScript) and JUSTIFY the
  choice in your Phase 1 summary based on the team's likely skillset and the
  Excel/CSV-parsing and analytics workload (Python has stronger data-processing
  libraries: pandas, openpyxl; Node/NestJS gives shared TypeScript types with the
  React frontend). Do not pick silently — state the tradeoff.
- Database: PostgreSQL, using JSONB columns for the metadata-driven custom-field
  system (Section 9). Justify why not MySQL/MongoDB in one paragraph (relational
  integrity for the machine/line/plant/shift hierarchy, strong aggregation support,
  native JSONB flexibility) — do this analysis yourself in your Phase 1 output.
- Real-time: WebSockets (or SSE as a simpler substitute) for dashboard push, backend-
  triggered after any write commits and KPI recompute completes.
- Deployment: Docker + Docker Compose (frontend, backend, Postgres, and a background
  worker for KPI recompute/import processing), environment-variable-driven config,
  separate dev/staging/production environment configs.

============================================================
8. DATABASE SCHEMA (BUILD EXACTLY THIS, EXTEND ONLY WITH REASON)
============================================================

Master data: plants, lines, machines (fk line_id nullable, fk plant_id, ideal_cycle_
time_sec, capacity), shifts (start_time, end_time, crosses_midnight bool), shift_
calendar (date, shift_id, is_holiday), parts (standard_cycle_time_sec, cavities,
target_rate_per_hr), operators, departments, roles, users (fk role_id, fk department_
id, fk plant_id nullable).

Production/OEE: production_records (fk plant/machine/part/shift/operator, date, start_
time, stop_time, cycle_time_sec, cavities, target_qty_hr, produced_qty, planned_
downtime_min, custom_fields JSONB, source_import_id fk nullable, created_by, approved_
by nullable, approved_at nullable), downtime_reasons (code, label, category [planned/
unplanned]), downtime_records (fk production_record_id, fk downtime_reason_id,
minutes), rejection_reasons (code, label), rejection_records (fk production_record_id,
fk rejection_reason_id, qty), oee_snapshots (scope_type, scope_id, period_type,
period_start, period_end, availability, performance, quality, oee, computed_at) —
THIS is the table dashboards read for anything beyond the live current shift; never
make a dashboard live-aggregate raw production_records for a monthly/yearly view.

Quality: quality_inspections, customer_complaints.
Maintenance: pm_schedules, maintenance_tickets (breakdown_at, repair_completed_at, fk
machine_id — feeds MTTR/MTBF).
PPC/SCM: production_plans (horizon n/n+1/n+2), materials, inventory_snapshots,
grn_records, dispatch_records.
HR/Safety/NPD/5S: hr_records (ACCESS-RESTRICTED), safety_incidents, safety_audits,
npd_projects, ecr_records, five_s_audits.

Cross-cutting: kpi_definitions (name, department_id, formula_description, unit,
aggregation_method, target, warning_threshold, critical_threshold, weight, frequency,
owner_role_id, version, is_active) — admin-editable, never hardcode targets in code;
actions (polymorphic: source_module, source_record_id, title, problem, root_cause,
corrective_action, preventive_action, owner_id, priority, status, created_at, due_
date, closed_at, verified_by); alerts (kpi_definition_id nullable, source_module,
severity, message, triggered_at, acknowledged_by, acknowledged_at); import_jobs
(source_type, file_path, uploaded_by, status, row_count, error_count, mapping_config
JSONB); audit_logs (user_id, entity_type, entity_id, field, old_value, new_value,
reason, timestamp); custom_field_definitions (entity_type, field_name, field_type,
is_required, options JSONB, department_id).

Index production_records and oee_snapshots on (machine_id, date, shift_id) at minimum.

============================================================
9. DATA INGESTION PIPELINE (IMPLEMENT EXACTLY THIS FLOW)
============================================================

Upload -> Preview (first N rows) -> Detect columns/types -> Map columns (user-driven,
with SAVEABLE mapping templates per department/source, and unmapped columns can become
custom_field_definitions entries rather than being dropped) -> Validate (cross-field
rules below + range checks + duplicate detection on machine+shift+date) -> Show
row-level errors, allow committing valid rows while flagging invalid ones -> Explicit
user confirmation (never silent auto-commit) -> Import (write to production_records +
related tables, log to import_jobs) -> Recalculate affected oee_snapshots/KPI values ->
Push update to open dashboards via the real-time channel.

Provide a BUILT-IN mapping template matching PRIL's real DPR_OEE.xlsx column layout
(Section 3) so that file can be uploaded with zero manual remapping.

Cross-field validation rules (implement these, do not skip): rejection quantity cannot
exceed produced quantity; downtime cannot exceed available time; negative production/
downtime/rejection values are invalid; unknown machine codes are rejected (or routed to
an "unmatched machine" review queue, not silently created); duplicate machine+shift+
date submissions are flagged for update-vs-reject decision, not silently double-
counted.

============================================================
10. DASHBOARD REQUIREMENTS PER DEPARTMENT
============================================================

For EVERY department below, build: role-scoped access, the filters listed, the KPI
tiles from Section 4's KPI list, the specified chart types, a raw/summary data table
with pagination, a drill-down path, alert rules, an "Add Action" shortcut into the
actions module, and an Export (Excel/CSV/PDF) button. Do not ship a department with
generic placeholder KPIs — use the specific KPI list from Section 4.

- Production: filters (date range, plant, line, machine, shift, part, operator);
  charts: Plan vs Actual trend, Machine Utilization bar, Downtime Pareto, Rejection
  Pareto, OEE nested-donut gauge (Availability/Performance/Quality/OEE); drill-down
  Plant -> Line -> Machine -> Shift -> Part -> Operator -> raw record.
- OEE (dedicated hub, the authoritative OEE view every other screen links back to):
  OEE trend with target band, A/P/Q stacked breakdown, OEE loss waterfall (in minutes/
  units, not just %), machine ranking table (worst-to-best).
- Quality: Rejection Pareto by reason, PPM trend (in-process/final/customer),
  complaint trend, CAPA funnel; drill-down PPM -> Part -> Machine -> Shift -> record.
- Maintenance: Breakdown Pareto, MTTR/MTBF trend, PM completion trend; open ticket
  table.
- PPC: Plan vs Actual rolling chart, Material Availability trend, On-time Production %.
- SCM/Stores/Logistics: GRN trend, Stock vs reorder point, FG Stock by part, Delivery
  Accuracy trend, dispatch delay distribution.
- HR (ACCESS-RESTRICTED to HR/Management/Super Admin — enforce server-side, not just
  hidden in UI): Attendance trend, Attrition trend, Training completion.
- Safety: Near-miss trend, Safety audit score trend, prominent LTI-free-days counter,
  LTI events trigger a CRITICAL, immediately-escalating alert.
- NPD: Drawing release time trend, ECR closure trend, design error trend, open ECR
  table.
- 5S: 5S score by zone (bar/radar), trend over audits, open findings list.
- Overall Manufacturing / Management: single-screen KPI scorecard tiles (Green/Amber/
  Red per configurable thresholds) for Overall KPI, Plant OEE, Production, Quality,
  Delivery, Maintenance, Safety, Inventory, Complaints; Top 10 Pending Actions list;
  data-freshness status (LIVE/RECENT/STALE/OFFLINE) per department/source. Design goal:
  a plant head can understand plant health in under 30 seconds.

============================================================
11. PHASED BUILD PLAN — BUILD IN THIS ORDER, ONE PHASE PER TURN
============================================================

After EVERY phase, you must: (a) list files created/modified, (b) explain any DB
migration and how to run it, (c) explain new/changed API endpoints, (d) explain how to
run the app and test what you just built, (e) explicitly confirm nothing from a prior
phase was broken (or explain what had to change and why), (f) list remaining work.

PHASE 1 - Foundation: repo scaffold (frontend + backend + docker-compose), coding
  standards, environment variable setup, health-check endpoint, CI skeleton. Justify
  your backend language choice here (Section 7).

PHASE 2 - Authentication & RBAC: user/role/department models, login, JWT/session
  handling, server-side RBAC middleware, seed a Super Admin user.

PHASE 3 - Database: full schema from Section 8, migrations, seed master data (a
  sample plant, line, machines, shifts, parts, downtime/rejection reason lists
  matching Section 3 exactly).

PHASE 4 - Data ingestion: the pipeline in Section 9, the built-in DPR_OEE.xlsx mapping
  template, validation rules, import_jobs logging, error reporting UI.

PHASE 5 - Production & OEE engine: implement oee_engine exactly per Section 3
  (including the ratio-of-sums aggregation function and the unit tests against the two
  real fixture rows), Production and OEE dashboards from Section 10. ASK the Section 6
  clarification questions here if not already answered.

PHASE 6 - Quality: rejection tracking (reuses production_records/rejection_records),
  PPM calculations, CAPA basics, Quality dashboard.

PHASE 7 - Maintenance & PPC: breakdown/PM tracking, MTTR/MTBF, Plan vs Actual, their
  dashboards.

PHASE 8 - KPI engine & Overall dashboard: kpi_definitions admin UI (targets/weights/
  thresholds, never hardcoded), the weighted Overall KPI scoring from Section 4,
  Overall Manufacturing / Management dashboard, alerts engine (Section rules below),
  Top 10 Pending Actions / full actions module, audit log, data-freshness indicator,
  WebSocket/SSE real-time push wiring across all dashboards built so far.

PHASE 9 (Phase 2 scope) - Remaining departments: SCM, Stores, Logistics, HR (access-
  restricted), Safety, 5S, NPD full modules and dashboards.

PHASE 10 (Phase 2 scope) - Google Forms integration: Apps Script webhook -> backend
  endpoint, starting with Production HPR only (not HR/Safety data), routed through the
  same validation pipeline as any other ingestion source, duplicate-submission
  handling.

PHASE 11 (Phase 2 scope) - Reporting & export: Excel/CSV/PDF export per department,
  scheduled report generation, email delivery.

PHASE 12+ (Phase 2/3 scope) - AI analytics (retrieval-based Q&A strictly over the KPI
  engine's own query functions, never free-text hallucination over raw data), then
  Phase 3: IoT/PLC/MQTT edge ingestion, MES/ERP integration, predictive analytics —
  design for these but do not build until explicitly requested.

============================================================
12. ALERTS TO IMPLEMENT (Phase 8)
============================================================

OEE below target/critical, Production below target, Downtime above threshold,
Rejection above threshold/PPM, CAPA overdue, PM/Maintenance overdue, Material
shortage, Stock below minimum, Dispatch delayed, Safety incident/LTI (CRITICAL,
immediate escalation), Training overdue, NPD milestone delayed, Data source stale.
All thresholds admin-configurable via kpi_definitions, not hardcoded. Unacknowledged
CRITICAL alerts escalate up the role hierarchy after a configurable time window.

============================================================
13. SECURITY, ERROR HANDLING, LOGGING (APPLY IN EVERY PHASE, NOT AS AN AFTERTHOUGHT)
============================================================

Bcrypt/argon2 password hashing; HTTPS/HSTS in deployment config; parameterized
queries/ORM only, no string-concatenated SQL; output-encode any user-supplied text
rendered in the UI (e.g., DPR remarks); CSRF protection on cookie-session state
changes; rate limiting on auth endpoints and all ingestion endpoints (especially the
Google Forms webhook); secrets via environment variables only, never committed;
validate file type/size and parse uploads defensively (a malformed file must fail
gracefully with a clear error, never crash the ingestion worker); structured logging
with correlation IDs across ingestion -> KPI recompute -> dashboard push, so any KPI
number is traceable back to its source rows; every material data change writes an
audit_logs row (who/what/when/old/new/reason).

============================================================
14. TESTING (APPLY FROM PHASE 5 ONWARD)
============================================================

Unit tests on oee_engine against the two fixture rows in Section 3 (non-negotiable —
these must pass exactly). Integration tests on the ingestion pipeline covering
malformed files, duplicate submissions, and the cross-field validation rules in
Section 9. Before declaring Phase 5 "done," run the DPR_OEE.xlsx sample file (or
equivalent seed data matching it) through the full pipeline and confirm the computed
OEE matches the real spreadsheet's values for the same inputs.

============================================================
15. SEED / SAMPLE DATA & DOCUMENTATION (Phase 3 onward)
============================================================

Seed the two real example rows from Section 3 as sample production_records so the
Production/OEE dashboards are non-empty and demonstrably correct on first run. Provide
a README covering: how to run locally (Docker Compose), how to run migrations, how to
run tests, how to import a DPR_OEE.xlsx file, environment variables required, and a
short glossary of OEE/KPI terms for PRIL's non-technical stakeholders.

============================================================
16. QUALITY BAR FOR YOUR OWN OUTPUT
============================================================

Never write vague instructions to yourself like "create a modern dashboard." For every
major feature you build, be able to state: WHAT it does, WHY it exists (tie back to a
numbered requirement above), WHERE it lives (file/module), HOW it's calculated (exact
formula, not "some logic"), its DATA SOURCE (table/column), which USER role can access
it, its PERMISSION model, its API contract, its DATABASE tables, its UI behavior, its
input VALIDATION rules, its ERROR HANDLING behavior, and how it's TESTED. If you can't
answer all of those for a feature, you haven't finished specifying it — ask, don't
guess silently, and never present an assumption as a confirmed fact.

Begin with PHASE 1 now. Stop after Phase 1 and wait for confirmation before continuing
to Phase 2.
```

---

*End of document. This specification (Section A) and the Master Development Prompt (Section B) were produced by analyzing `Production_Dashboard_Data.docx` and `PRIL_DPR_OEE_Sheet_-_PG_NPD_029.xlsx` in full, including the workbook's live formulas and the document's embedded reference images. No application code has been generated — per your instruction, this is analysis, design, and specification only.*
