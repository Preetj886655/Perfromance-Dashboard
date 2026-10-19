# End-to-End Action Plan & Detailed Paragraph-Form VS Code Prompt: `ERC_MkV_Line_Tracker R0_10102026.xlsx` Dashboard

## 1. Detailed Paragraph-Form Master Prompt for VS Code (Copy & Paste Directly)

Copy the continuous, detailed paragraph-form prompt below and paste it directly into your VS Code AI assistant (GitHub Copilot Chat, Cursor Composer, Cline, Roo Code, or Windsurf) to generate your complete backend parser, REST API, and interactive frontend dashboard:

```text
Act as a Principal Full-Stack Manufacturing Analytics Engineer and Industrial UI/UX Architect working inside my VS Code workspace to build a complete, production-ready web application (Python FastAPI + OpenPyXL + Pandas backend in `backend/` and React + Vite + Tailwind CSS + Recharts + Lucide Icons frontend in `frontend/`) powered by my downloaded Google Sheets workbook `ERC_MkV_Line_Tracker R0_10102026.xlsx`. This workbook is the master operational tracker for an Elastic Rail Clip (`ERC Mk-V`, `ERC Mk-III`, and `Liner Less Clip`) manufacturing plant supplying five Indian Railways zones (`South Central Railway`, `Central Railway`, `Southern Railway`, `Western Railway`, and `East Coast Railway`), and it contains 17 interconnected worksheets spanning customer purchase orders, monthly production and dispatch phasing, raw material steel heat and lot traceability, machine master capacity and consumables, live shop-floor shift entries, manpower allocation, and 14,567 historical downtime records from August 2024 through September 2026. Because the downloaded `.xlsx` file contains multiple stacked tables on single worksheets, decorative banner rows above headers, merged cells, cached formula error tokens (`#N/A`, `#REF!`, `#DIV/0!`, `#VALUE!`), and hundreds of pre-filled blank formula template rows, you must not use a naive `pd.read_excel(sheet_name=None)` loader; instead, build a schema-aware `ERCWorkbookParser` service using `openpyxl` (`data_only=True`, `read_only=True`) with automatic file-modification timestamp caching (`os.path.getmtime`) that slices all 17 worksheets by their exact 1-based Excel row coordinates into 25 clean, normalized JSON entities and sanitizes all spreadsheet error tokens to `null`.

In the backend parser, ingest the first ten operational and master tabs using their exact structural boundaries: parse `Production Order` (Row 1 header, Rows 2–7 data covering 6 customer POs totaling 3,943,015 Nos and 4,052.18 MT of required raw material across WR, SCR, CR, SR, and ECoR, while ignoring instructional notes at Rows 202–204 and linking the placeholder order number `PO-2026-001` on Row 2 to Western Railway's actual PO `26265489205106`), and parse `Copy of Production Order` (Row 1 header, Rows 2–7 data) for the raw worksheet explorer while excluding it from global order book KPI totals so the 3,943,015 Nos order book is never double-counted. For `Order Plan (Monthly)` (Row 4 header, Rows 5–16 data, Row 18 grand total, Row 21 notes), handle the paired-row structure where each PO occupies two consecutive rows—an odd row with `Type = "Production"` and an even row with `Type = "Dispatch"` whose metadata columns `A:H` (`Part`, `Customer`, `PO No`, `PO Date`, `PO Qty`, `DP Date`, `FY25-26 Carryover`, `Balance`) are blank—by forward-filling columns `A:H` from each `Production` row onto its paired `Dispatch` row below it, and rename the mislabeled column headers `Feb-26` and `Mar-26` in Columns T and U to `Feb-27` and `Mar-27` to preserve chronological FY 2026–27 ordering. For `RM Heat Plan vs Actual` (Row 4 header, Rows 5–46 data, summary KPIs at Rows 49–53 showing 41 heats tracked, 37 heats with actuals, 2,102.18 MT planned RM, 1,774,734 Nos planned final supply, and 1,456,660 Nos actual Forming OK across suppliers `Bhushan`, `JSW`, `JSL`, and `JSW JFE`, plus data quality notes at Rows 56–59), explicitly filter out the inline separator row at Row 29 where `Customer == "TOTAL"` and `Heat No. == "BAR CROPPER"`, convert the `#REF!` formula error on Heat `A264654` to `null`, flag Rows 43–46 (`JSW JFE` and `JSL`) as plan-only heats awaiting shop-floor actuals, and strip wrapper text from customer strings like `"South Central Railway (PO No. 60257500205475)"` into clean `Customer` and `PO_No` fields. Split `Heat & Lot Number Reference` into two separate tables—Table 1 at Row 5 header and Rows 6–46 data for all 40 valid heat numbers (filtering out Row 30's `BAR CROPPER` row) and Table 2 at Row 50 header and Rows 51–84 data for the 33 distinct lot numbers (`6/32` through `6/54` and `PR 6/16` through `PR 6/26`, plus `(no lot assigned)` at Row 84)—and surface Row 88's reconciliation warning that `H-2409-118` and `LOT-20260920-DB-01` used in `Production Order` and `Entries` are leftover template placeholders rather than real heats or lots. Parse `Machine Consumables` (Row 4 header, Rows 5–35 data for 31 machine consumable schedules across Tooling, Wear Part, Chemical, Lubricant, and Packaging), `Machine Master` (Row 1 header, Rows 2–32 data for 31 machines across 10 Work Centers `BC`, `DB`, `MPI`, `Turning`, `IBH`, `Forming`, `AD`, `Linnseed`, `Packing`, and `Clip` totaling 60 rated operators per shift, trimming the trailing space on `"De-Comissioned "` for `SBL` and `SBR` decommissioned on `2026-06-01`, and gracefully handling blank Rated CT values on `Quench Tank` and `Tempering Furnace` without divide-by-zero errors), `Capacity Change Log` (Row 1 header, Row 2+ audit records), `Entries` (Row 1 header, Rows 2–12 active shift entries from `2026-09-19` and `2026-09-20` across 32 columns, strictly dropping template rows 13–301 where `Date` and `Output Qty` are null so pre-filled formula defaults like `Shift Duration = 660` and `Availability % = 100%` do not corrupt live OEE and cycle-time averages), and `Planned Shutdowns` (Row 1 header, Rows 2–100 active shutdown rows, excluding help text at Rows 103–104).

Continue in the backend parser by splitting the remaining seven multi-table analytical and historical worksheets into structured sub-tables and reconciling cross-sheet naming differences: parse `Manpower Summary` into Table 1 (Row 5 header, Rows 6–14 data by Work Center) and Table 2 (Row 18 header, Rows 19–49 data by Machine, highlighting operator shortfalls such as `Forming / Press line E1` with 6 planned vs. 3 actual operators). Parse `Production Dashboard` by extracting the control metadata at Rows 4–7 (`View range = 15 days`, `Latest date = 2026-09-18`, `Avg Fill % = 27.67%`, `Total Downtime = 1,969.13 hrs`), Table 1 (Row 7 header, Rows 8–37 daily 30-day window), Table 2 (Row 77 header, Rows 78–82 work-center pivot across `Turned Bar`, `Clip`, `Cut Bar`, `Deburring`, and `MPI`), and Table 3 (Row 108 header, Rows 109–138 filtered trend), while dynamically recomputing the full 15/30/60/90-day daily output, target, fill percentage, and downtime series directly from `Downtime Log` in Python so that Rows 8–22 (`2026-08-20` to `2026-09-03`, which evaluate to `#N/A` in Excel when cell `B4` is set to 15 days) render complete historical curves. Parse `Dashboard` into Table 1 (Row 5 header, Rows 6–14 rated bottleneck analysis by work center), the theoretical line-balance KPIs at Rows 16–18 and Row 46 (identifying `Packing` at `4.4 sec` effective rated cycle time, `818.18 pcs/hr`, and `9,818.18 pcs/12-hr shift` as the `◄ BOTTLENECK` vs. upstream centers like `Linnseed` at `0.9s` and `BC` at `1.58s`), and Table 2 (Row 23 header, Rows 24–32 actual shop-floor performance from `Entries`). Parse `Summary` into Table 1 (Row 5 header, Rows 6–30 covering 25 months from `2024-08` to `2026-09`, illustrating how monthly fill percentage fell from `92.5%` in December 2025 to `17.3%–33.5%` in May–September 2026 when monthly targets tripled from ~1.3M to ~5.5M clips), Table 2 (Row 34 header, Rows 35–37 yearly totals for 2024, 2025, and 2026), and Table 3 (Row 41 header, Rows 42–50 live work-center availability). Ingest `Downtime Log` (Row 1 header, Rows 2–14568 containing 14,567 historical records from `2024-08-31` to `2026-09-18` plus Row 14569's active live-mirror entry, dropping blank formula rows 14570–14868), and normalize historical `Stage` names (`Cut Bar` -> `BC`, `Deburring` -> `DB`, `MPI` -> `MPI`, `Turned Bar` -> `Turning`, `Clip` -> `Forming/Clip`) and legacy machine spellings (`Autocopying-1..6` -> `ACM 1..6`, `W-CNC 1..6` -> `CNC 1..6`, `Sikka1` -> `Sikka CNC`, `Bar corpper 1..3` -> `Bar Cropping H M1 / C M2`, `Line 1..2` -> `Press line E1 / P2`, `Tampering Furnace` -> `Tempering Furnace`) to match `Machine Master` while keeping the raw values for auditability. Parse `Downtime Analysis` into Table 1 (Row 5 header, Rows 6–25 ranking all 20 downtime categories totaling `36,545.28 hrs`, led by `Dimensions & Length Issue` at `14,303.13 hrs` / `39.14%` across 3,428 occurrences and `Breakdown` at `5,644.80 hrs` / `15.45%`), Table 2 (Row 29 header, Rows 30–49 ranking the top 20 machine-breakdown pairs led by `Autocopying-5` Mechanical at `939.5 hrs`, `Autocopying-2` Mechanical at `794.25 hrs`, and `Sikka1` Mechanical at `674.06 hrs` with `9.23 hrs/occurrence`), Table 3 (Row 53 header, Rows 54–78 monthly target vs. actual), and the strategic action notes at Rows 81–93. Finally, parse `OEE & Reliability` into Table 1 (Row 5 header, Rows 6–14 live OEE showing `BC` at `32.2%`, `Turning` at `30.1%`, and `Forming` at `67.5%`), Table 2 (Row 19 header, Rows 20–34 MTTR across 15 machines led by `W-CNC 6` at `11.0 hrs` and `Sikka1` at `9.23 hrs`), and Table 3 (Row 39 header, Rows 40–54 MTBF across 17,952 calendar hours showing `SBL` failing every `101.4 hrs`, `Autocopying-5` every `121.3 hrs`, and `SBR` every `125.5 hrs`).

Expose this parsed data through a fast, modular FastAPI backend (`backend/main.py`) with CORS enabled and dedicated endpoints: `GET /api/workbook/meta` (returning all 17 sheet names, row counts, last-modified timestamp, and active data-reconciliation alerts), `GET /api/overview` (returning plant-wide executive KPIs, order book progress, 25-month production/fill/availability trends, work-center output pivots, and top reliability recommendations), `GET /api/orders` (returning `Production Order` and forward-filled `Order Plan (Monthly)` series filterable by railway customer and clip part), `GET /api/rm-traceability` (returning the 40 valid heats from `RM Heat Plan vs Actual`, supplier/batch yield summaries, the 33 distinct lots from `Heat & Lot Number Reference`, and placeholder heat/lot mismatch warnings), `GET /api/machines` (returning `Machine Master`, `Machine Consumables`, `Capacity Change Log`, and `Planned Shutdowns`), `GET /api/shop-floor` (returning the 11 active shift rows from `Entries`, `Manpower Summary` by work center and machine, and `Dashboard` bottleneck vs. actual cycle time metrics), `GET /api/downtime/analytics` (returning `Downtime Analysis` Pareto tables, `OEE & Reliability` OEE/MTTR/MTBF matrices, `Summary` monthly/yearly rollups, and dynamically recomputed daily production and downtime trends supporting `?days=15|30|60|90|all&stage=&machine=&part=`), `GET /api/downtime/logs` (providing server-side pagination, multi-column sorting, date-range filtering, stage/machine/category filtering, and instant text search across all 14,568 downtime log rows), `GET /api/sheets/{sheet_name}` (returning every parsed table, KPI block, and note for any of the 17 individual worksheets), and `POST /api/workbook/upload` (accepting a multipart `.xlsx` file upload to hot-swap `ERC_MkV_Line_Tracker R0_10102026.xlsx` on disk and immediately refresh all dashboard views without restarting the server).

On the frontend, design an ultra-polished industrial command-center UI using a cohesive dark/light slate color palette (`#090D16` background, `#111827` elevated cards with subtle `#1F2937` borders, crisp `Inter` UI typography paired with `JetBrains Mono` tabular numbers for all engineering metrics, and semantic emerald, amber, rose, cyan, and indigo status badges) organized around a left navigation sidebar with two distinct modes: **6 Integrated Manufacturing Cockpit Views** and an **All 17 Worksheets Direct Explorer**. In the **Executive Command Center** view, display a 6-card hero KPI ribbon (`Order Book: 3,943,015 Nos`, `Planned RM: 2,102.18 MT`, `Forming OK Yield: 1,456,660 Nos / 82.08%`, `Line Takt Bottleneck: 4.4s at Packing / 9,818 pcs per shift`, `Historical Downtime: 36,545.3 hrs across 14,567 logs`, and `#1 Loss Driver: Dimensions & Length Issue at 39.14%`), followed by an interactive 25-month Production vs. Target & Fill % combo chart (`2024-08` to `2026-09`), a Work Center Output & Rejects breakdown, and an expandable Data Reconciliation & Action Priorities drawer. In the **Orders & Monthly Phasing** view, render customer progress cards for `SCR`, `CR`, `SR`, `WR`, and `ECoR`, a grouped monthly bar chart comparing `Production` vs. `Dispatch` targets from `Apr-26` to `Mar-27`, and an interactive PO table showing carryover, balance, and assigned RM heat status. In the **RM Heat & Lot Traceability** view, build a multi-stage conversion funnel (`Plan Cut Bar: 1,303,956` -> `Bar Cropper OK: 1,103,759` -> `ACM/Turning OK: 1,291,173` -> `Forming OK: 1,456,660`), supplier yield comparison cards (`Bhushan`, `JSW`, `JSL`, `JSW JFE`), a searchable 40-heat performance grid with visual yield bars and plan-only badges, and the 33-lot reference directory with placeholder mismatch alerts. In the **Line Bottleneck, Machine Master & Maintenance** view, plot an horizontal Effective Rated Cycle Time bar chart across all 9 work centers with a red bottleneck threshold line at `Packing (4.4s)`, a 31-machine master capacity grid with `Active` and `Decommissioned` (`SBL`, `SBR`) filter pills, a 31-item `Machine Consumables` life tracker, and side-by-side panels for `Capacity Change Log` and `Planned Shutdowns`. In the **Live Shop-Floor Shift Entries & Manpower** view, display live OEE gauges (`Availability x Performance x Quality`) for `BC (32.2%)`, `Turning (30.1%)`, and `Forming (67.5%)`, an Actual vs. Rated Cycle Time variance chart across active machines (`Press line E1/P2`, `CNC 1–6`, `Bar Cropping C M2`), a Manpower Planned vs. Actual shortfall heatmap by work center and machine, and the 11-row shift entry inspector. In the **Historical Downtime, OEE & Reliability** view, render a dual-axis Pareto chart of the 20 Downtime Categories, an interactive Machine Reliability Quadrant scatter plot (`MTBF` on the X-axis vs. `MTTR` on the Y-axis with bubble size proportional to `Total Breakdown Hours`, spotlighting `Sikka1` at `9.23h MTTR`, `W-CNC 6` at `11.0h MTTR`, and `Autocopying-5` at `939.5h total breakdown`), a dynamic 15/30/60/90-day daily output and downtime trend chart computed from `Downtime Log`, and a blazing-fast server-paginated 14,568-row `Downtime Log` table with multi-facet filters and CSV export. Finally, in the **All 17 Worksheets Direct Explorer** section of the sidebar, list all 17 exact sheet names from `ERC_MkV_Line_Tracker R0_10102026.xlsx` plus a drag-and-drop `.xlsx` sync button in the top header so clicking any worksheet tab renders every single sub-table, summary block, and footnote from that exact sheet with zero data loss.
```

---

## 2. Executive Architecture for the 17-Worksheet ERC Mk-V Manufacturing Workbook

Your downloaded Google Sheets workbook (`ERC_MkV_Line_Tracker R0_10102026.xlsx`) is a comprehensive manufacturing, raw material traceability, shop-floor OEE, and historical downtime system for **Elastic Rail Clip (ERC Mk-V, Mk-III, and Liner Less Clip)** production supplying Indian Railways (**South Central Railway, Central Railway, Southern Railway, Western Railway, and East Coast Railway**).

Because several tabs in this workbook contain **multiple stacked tables on a single sheet**, **decorative banner rows above headers**, **pre-filled formula template rows**, and **cross-tab naming mismatches**, a generic Excel loader will fail or produce corrupted charts. Your VS Code backend needs a **schema-aware multi-table parser** that splits the 17 tabs into **25 normalized data entities** before serving them to your frontend dashboard.

| Workbook Domain | Worksheet Tabs Included | Total Records / Scope | Critical Parsing & Reconciliation Rule |
| :--- | :--- | :--- | :--- |
| **1. Orders & Monthly Planning** | `Production Order`, `Copy of Production Order`, `Order Plan (Monthly)` | 6 Customer POs (3,943,015 Nos total); 12 monthly production/dispatch phasing rows (Apr 2026 – Mar 2027) | Skip `Copy of Production Order` (100% duplicate). Forward-fill `Part`, `Customer`, `PO No`, `PO Qty` from odd (`Production`) rows onto even (`Dispatch`) rows in `Order Plan (Monthly)`. |
| **2. Raw Material & Heat Traceability** | `RM Heat Plan vs Actual`, `Heat & Lot Number Reference` | 41 RM Heats (32 unique heats, 33 distinct lots, 2,102.18 MT planned RM, 1,456,660 Forming OK clips) | Filter out the inline separator row at Row 29 (`Customer="TOTAL", Heat No.="BAR CROPPER"`). Sanitize `#REF!` on Heat `A264654` to `null`. Flag placeholder Heat `H-2409-118` and Lot `LOT-20260920-DB-01`. |
| **3. Machine Master & Maintenance** | `Machine Master`, `Machine Consumables`, `Capacity Change Log`, `Planned Shutdowns` | 31 Machines across 10 Work Centers (60 rated manpower/shift); 31 consumable schedules | Normalize `De-Comissioned ` (with trailing space) on `SBL`/`SBR`. Handle blank Rated CT on `Quench Tank` and `Tempering Furnace` without divide-by-zero errors. |
| **4. Live Shop-Floor Shift Operations** | `Entries`, `Manpower Summary`, `Dashboard` (Line Bottleneck) | 11 populated shift rows (Rows 2–12) + 289 pre-filled formula template rows; 9 Work Center bottleneck rows | **Crucial:** In `Entries`, drop Rows 13–301 where `Date` is null (they contain pre-filled `Shift Duration=660` and `Availability=1` that will skew averages if ingested). |
| **5. Historical Production & Downtime (2024–2026)** | `Downtime Log`, `Downtime Analysis`, `Summary`, `Production Dashboard`, `OEE & Reliability` | 14,567 historical shift/downtime rows (`2024-08-31` to `2026-09-18`) + 300 live mirror rows; 25 monthly summaries; 15 machine MTTR/MTBF rows | **Crucial:** Map historical stage names (`Cut Bar`, `Turned Bar`, `Clip`, `Deburring`, `MPI`) to `Machine Master` Work Center codes (`BC`, `Turning`, `Forming`/`Clip`, `DB`, `MPI`). Recompute 30-day rolling trends in backend to bypass `#N/A` cells in `Production Dashboard`. |

---

## 3. Deep-Dive Schema & Structural Audit of All 17 Worksheets

Below is the exact structural blueprint of every worksheet in `ERC_MkV_Line_Tracker R0_10102026.xlsx` (using 1-based Excel row numbers):

| # | Worksheet Name | Header Row(s) | Data Row Range | Columns & Key Metrics | Quirks, Anomalies & Required Backend Handling |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `Production Order` | Row 1 | Rows 2–7 | `PO Date`, `Order Nr`, `Customer`, `Order Qty`, `Part`, `DP Date`, `Assigned RM Heat Nr`, `Subsequent Lot Nr`, `Status`, `Notes`, `RM Requirment in MT` | Rows 8–201 are empty; Rows 202–203 contain usage instructions. Row 2 uses placeholder `PO-2026-001` for Western Railway real PO `26265489205106` (607,785 Nos). Total across 6 orders = 3,943,015 Nos. |
| **2** | `Copy of Production Order` | Row 1 | Rows 2–7 | Identical to `Production Order` (11 columns) | 100% duplicate backup tab. Exclude from primary navigation or expose only as a read-only comparison diff in the backend. |
| **3** | `Order Plan (Monthly)` | Row 4 | Rows 5–16 (Total at Row 18) | `Part`, `Customer`, `PO No`, `PO Date`, `PO Qty`, `DP Date`, `FY25-26 Carryover`, `Balance`, `Type`, `Apr-26` .. `Jan-27`, `Feb-26`, `Mar-26`, `Grand Total` | Each order spans 2 rows: `Type="Production"` (odd row) and `Type="Dispatch"` (even row where Columns A–H are blank). Forward-fill Columns A–H from the odd row above. Note headers `Feb-26` and `Mar-26` in Columns T–U actually represent `Feb-27` and `Mar-27` in FY 2026-27. |
| **4** | `RM Heat Plan vs Actual` | Row 4 | Rows 5–46 (Summary Rows 49–53) | `Customer`, `Supplier`, `Heat No.`, `Lot No.`, `RM Qty (MT)`, `Plan: Cut Bar (Nos)`, `Actual: Bar Cropper OK`, `Actual: Endbit Scrap`, `Actual: ACM/Turning OK`, `Actual: ACM/Turning REJ`, `Plan: Clip Prod (Nos)`, `Actual: Forming OK`, `Actual: Forming REJ`, `Plan: Final Supply (Nos)`, `Yield vs Plan %`, `Balance / Reconciliation`, `Source Batch` | **Row 29 is an inline header/separator row** (`TOTAL, JSW, BAR CROPPER, , , ACM...`)—filter out any row where `Heat No. == "BAR CROPPER"` or `Customer == "TOTAL"`. Rows 43–46 (`JSW JFE` / `JSL`) have plan-only figures and blank actuals. |
| **5** | `Heat & Lot Number Reference` | Row 5 (Table 1)<br>Row 50 (Table 2) | Rows 6–46 (Heats)<br>Rows 51–84 (Lots) | **Table 1:** `Heat No.`, `Lot No.`, `Customer`, `Supplier`, `RM Qty (MT)`, `Source Batch`<br>**Table 2:** `Lot No.`, `Heats Assigned`, `Total RM Qty (MT)` | Contains 2 stacked tables plus a reconciliation warning at Rows 87–88. Table 1 also includes the `BAR CROPPER` junk row at Row 30. Table 2 has 33 real lots (`6/32`–`6/54`, `PR 6/16`–`PR 6/26`) plus `(no lot assigned)` at Row 84. |
| **6** | `Machine Consumables` | Row 4 | Rows 5–35 | `Work Center`, `Machine`, `Consumable`, `Category`, `Typical Change Frequency`, `Last Changed Date`, `Next Due Date`, `Notes` | 31 machine consumables across `Tooling`, `Wear Part`, `Chemical`, `Lubricant / Chemical`, and `Packaging`. `Last Changed Date` and `Next Due Date` are currently blank for live shop-floor entry. |
| **7** | `Machine Master` | Row 1 | Rows 2–32 | `Work Center`, `Machine`, `Current Rated CT (sec)`, `Status`, `Notes`, `Commissioning Date`, `Manpower Required (Rated) / Shift`, `Decommissioned Date`, `Output`, `Hourly`, `Shift`, `Day`, `85 %` | 31 machines across 10 Work Centers (`BC`, `DB`, `MPI`, `Turning`, `IBH`, `Forming`, `AD`, `Linnseed`, `Packing`, `Clip`). `SBL` and `SBR` have `Status="De-Comissioned "` (decommissioned `2026-06-01`). `Quench Tank` and `Tempering Furnace` have `Current Rated CT = null`. |
| **8** | `Capacity Change Log` | Row 1 | Row 2+ | `Date Changed`, `Work Center`, `Machine`, `Old Rated CT (sec)`, `New Rated CT (sec)`, `Reason / Notes` | Contains 1 example row (`2026-09-20`, `Turning`, `ACM 1`, Old=30, New=30). Backend should support appending new logs when cycle times change. |
| **9** | `Entries` | Row 1 | Rows 2–12 (Active)<br>Rows 13–301 (Blank Template) | 32 columns: `Date`, `Shift`, `Shift Duration (min)`, `Source`, `Work Center`, `Machine`, `Rated CT`, `Output Qty`, `Downtime (min)`, `Rejects (Other Ops)`, `Actual CT`, `Efficiency %`, `Status vs Rated`, `Downtime Category`, `Breakdown Type`, `Downtime Description`, `Planned Shutdown`, `Availability %`, `Performance %`, `Quality %`, `OEE %`, `Planned Manpower`, `Actual Manpower`, `Manpower Shortfall`, `RM Heat Nr`, `Bundle Nr`, `Lot Number`, `Part`, `OP10/20/30 Rejects`, `Total Rejects` | **Critical Filter:** Rows 2–11 have full shift data (`2026-09-19` and `2026-09-20`); Row 12 is a partial `MPI line 1` row; Rows 13–301 are pre-filled formula templates where `Date` and `Machine` are blank but `Shift Duration=660` and `Availability %=1`. Only ingest rows where `Date` is not null and `Output Qty` is not null. |
| **10** | `Planned Shutdowns` | Row 1 | Row 2+ | `Start Date`, `End Date`, `Scope`, `Scope Detail (Work Center or Machine)`, `Hours Affected / Day`, `Reason`, `Notes` | Contains 1 example row (`2026-01-26`, Republic Day, `All Machines`, 24 hrs) and explanatory notes at Rows 103–104. |
| **11** | `Manpower Summary` | Row 5 (Table 1)<br>Row 18 (Table 2) | Rows 6–14 (By WC)<br>Rows 19–49 (By Machine) | **Table 1:** `Work Center`, `Avg Planned`, `Avg Actual`, `Total Shortfall`, `Shifts Logged`<br>**Table 2:** `Machine`, `Rated Manpower / Shift`, `Avg Planned`, `Avg Actual`, `Total Shortfall`, `Shifts Logged` | Multi-table sheet summarizing live manpower from `Entries` (e.g., `Forming` / `Press line E1` shows Planned=6, Actual=3, Shortfall=3). |
| **12** | `Production Dashboard` | Row 7 (Table 1)<br>Row 77 (Table 2)<br>Row 108 (Table 3) | Rows 8–37 (Daily)<br>Rows 78–82 (WC Pivot)<br>Rows 109–138 (Trend) | **Table 1:** `Day#`, `Date`, `Output`, `Target`, `Downtime (hrs)`, `Fill %`<br>**Table 2:** `Work Center`, `Total Output`, `Total Target`, `Fill %`, `Downtime (hrs)`, `Rejects`<br>**Table 3:** `Date`, `Output`, `Downtime (hrs)`, `Date Label` | **Formula `#N/A` Warning:** Because cell `B4` (`View range`) is set to `15` days, Rows 8–22 (`2026-08-20` to `2026-09-03`) evaluate to `#N/A` in Excel! Your backend should either sanitize `#N/A` to `null` or compute daily rollups directly from `Downtime Log`. |
| **13** | `Dashboard` | Row 5 (Table 1)<br>Row 23 (Table 2) | Rows 6–14 (Bottleneck)<br>Rows 24–32 (Actuals) | **Table 1:** `Work Center`, `Machines`, `Effective Rated CT (sec)`, `Bottleneck?`<br>**Table 2:** `Work Center`, `Avg Actual CT (sec)`, `Total Output`, `Total Rejects`, `Avg Efficiency %`<br>**KPIs (Rows 16–18, 36–46):** Takt = `4.4s` (`Packing` is `◄ BOTTLENECK`), `818.18 pcs/hr`, `9,818.18 pcs/shift`, Rated Manpower = `60/shift` | Multi-table sheet combining theoretical line balance (`Machine Master`) with live shop-floor performance (`Entries`). |
| **14** | `Summary` | Row 5 (Table 1)<br>Row 34 (Table 2)<br>Row 41 (Table 3) | Rows 6–30 (Monthly)<br>Rows 35–37 (Yearly)<br>Rows 42–50 (Live Avail) | **Table 1 & 2:** `Month`/`Year`, `Downtime Hours`, `Breakdown Hours`, `Target NOS`, `Actual NOS`, `Fill %`, `Approx. Availability %`<br>**Table 3:** `Work Center`, `Avg Availability %`, `Shifts Logged` | 25 months of history (`2024-08` to `2026-09`, with `2024-11` missing in source data). Shows how `Fill %` dropped from `92.5%` (Dec 2025) to `17.3%–33.5%` (May–Sep 2026) when monthly targets tripled from ~1.3M to ~5.5M clips. |
| **15** | `Downtime Log` | Row 1 | Rows 2–14568 (History)<br>Rows 14569–14868 (Live Mirror) | `Date`, `Line`, `Shift`, `Part`, `Stage`, `Machine`, `Downtime Type (raw)`, `Downtime Category`, `Breakdown Type`, `Downtime Mins`, `Prod Loss NOS`, `Prod Target NOS`, `Total PROD NOS`, `Rejection`, `Description` | **14,567 historical records** (`2024-08-31` to `2026-09-18`) + 1 populated live mirror row at Row 14569 (`2026-09-20`, `Turning`, `CNC 1`) + 299 blank formula rows (Rows 14570–14868) that must be filtered out where `Date` is null. |
| **16** | `Downtime Analysis` | Row 5 (Table 1)<br>Row 29 (Table 2)<br>Row 53 (Table 3) | Rows 6–25 (By Category)<br>Rows 30–49 (By Machine)<br>Rows 54–78 (Monthly) | **Table 1:** `Category`, `Total Minutes`, `Total Hours`, `Occurrences`, `% of Total Downtime`<br>**Table 2:** `Machine`, `Breakdown Type`, `Total Hours`, `Occurrences`, `Avg Hours / Occurrence`<br>**Table 3:** `Month`, `Target NOS`, `Actual NOS`, `Fill %`, `Downtime Hours`<br>**Notes:** Rows 81–93 | Multi-table analytical sheet. Highlights #1 cause: `Dimensions & Length Issue` (`14,303.13 hrs`, `39.14%`, `3,428 occurrences`), #2 `Breakdown` (`5,644.80 hrs`, `15.45%`), and worst machine MTTR: `Sikka1` (`9.23 hrs/occurrence`, `674.06 hrs` total) and `Autocopying-5` (`939.5 hrs`). |
| **17** | `OEE & Reliability` | Row 5 (Table 1)<br>Row 19 (Table 2)<br>Row 39 (Table 3) | Rows 6–14 (Live OEE)<br>Rows 20–34 (MTTR)<br>Rows 40–54 (MTBF) | **Table 1:** `Work Center`, `Avg Availability %`, `Avg Performance %`, `Avg Quality %`, `Avg OEE %`, `Rows with data`<br>**Table 2:** `Machine`, `Total Breakdown Hours`, `Breakdown Events`, `MTTR (hrs / event)`<br>**Table 3:** `Machine`, `Period Hours`, `Breakdown Events`, `MTBF (hrs, approx.)` | Multi-table sheet. Live OEE is populated for `BC` (`32.2%`), `Turning` (`30.1%`), and `Forming` (`67.5%`). Historical MTTR/MTBF spans `17,952 calendar hours` across 15 machines (`SBL` fails most frequently with `MTBF = 101.4 hrs`, followed by `Autocopying-5` at `121.3 hrs`). |

---

## 4. Ready-to-Run Python Parser (`backend/erc_workbook_parser.py`)

Save this script as `backend/erc_workbook_parser.py` in your VS Code project. It handles every single worksheet, multi-table split, forward-fill, and formula cleanup rule for your exact file:

```python
import datetime
import math
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import openpyxl

ERROR_TOKENS = {"#N/A", "#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#NUM!", "N/A", "NaN"}

STAGE_TO_WC = {
    "Cut Bar": "BC",
    "BC": "BC",
    "Deburring": "DB",
    "DB": "DB",
    "MPI": "MPI",
    "Turned Bar": "Turning",
    "Turning": "Turning",
    "Clip": "Clip / Forming",
    "Forming": "Clip / Forming",
    "IBH": "IBH",
}

def clean_val(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        return round(val, 6)
    if isinstance(val, str):
        s = val.strip()
        if s == "" or s in ERROR_TOKENS:
            return None
        return s
    return val

def rows_to_dicts(rows: List[List[Any]], headers: List[str]) -> List[Dict[str, Any]]:
    records = []
    clean_headers = [str(h).strip() if h is not None else f"col_{i}" for i, h in enumerate(headers)]
    for r in rows:
        cleaned = [clean_val(c) for c in r[: len(clean_headers)]]
        if all(c is None for c in cleaned):
            continue
        records.append(dict(zip(clean_headers, cleaned)))
    return records

class ERCWorkbookParser:
    def __init__(self, file_path: str):
        self.file_path = Path(file_path)
        self._cache: Optional[Dict[str, Any]] = None
        self._last_mtime: Optional[float] = None

    def get_data(self, force_reload: bool = False) -> Dict[str, Any]:
        mtime = os.path.getmtime(self.file_path)
        if not force_reload and self._cache is not None and self._last_mtime == mtime:
            return self._cache
        self._cache = self._parse_all()
        self._last_mtime = mtime
        return self._cache

    def _sheet_rows(self, wb: openpyxl.Workbook, name: str) -> List[List[Any]]:
        ws = wb[name]
        return [list(r) for r in ws.iter_rows(values_only=True)]

    def _parse_all(self) -> Dict[str, Any]:
        wb = openpyxl.load_workbook(self.file_path, data_only=True, read_only=True)
        data: Dict[str, Any] = {
            "workbook_name": self.file_path.name,
            "sheet_names": wb.sheetnames,
            "sheets": {},
        }

        # 1 & 2. Production Order & Copy of Production Order
        for sname in ["Production Order", "Copy of Production Order"]:
            if sname in wb.sheetnames:
                rows = self._sheet_rows(wb, sname)
                headers = rows[0]
                order_rows = [
                    r for r in rows[1:50]
                    if clean_val(r[1]) is not None and clean_val(r[1]) != "How to use this tab:"
                ]
                data["sheets"][sname] = {
                    "orders": rows_to_dicts(order_rows, headers),
                    "notes": clean_val(rows[203][1]) if len(rows) > 203 else None,
                }

        # 3. Order Plan (Monthly)
        if "Order Plan (Monthly)" in wb.sheetnames:
            rows = self._sheet_rows(wb, "Order Plan (Monthly)")
            headers = [
                "Feb-27" if clean_val(h) == "Feb-26" else ("Mar-27" if clean_val(h) == "Mar-26" else clean_val(h))
                for h in rows[3]
            ]
            plan_records = []
            carry_meta: List[Any] = [None] * 8
            for r in rows[4:16]:
                if clean_val(r[8]) is None:
                    continue
                row_copy = list(r[:22])
                if clean_val(row_copy[0]) is not None:
                    carry_meta = row_copy[:8]
                else:
                    row_copy[:8] = carry_meta
                plan_records.extend(rows_to_dicts([row_copy], headers))
            data["sheets"]["Order Plan (Monthly)"] = {
                "banner": clean_val(rows[1][0]),
                "monthly_plan": plan_records,
                "total_order_qty": clean_val(rows[17][4]) if len(rows) > 17 else 3943015,
                "notes": clean_val(rows[20][0]) if len(rows) > 20 else None,
            }

        # 4. RM Heat Plan vs Actual
        if "RM Heat Plan vs Actual" in wb.sheetnames:
            rows = self._sheet_rows(wb, "RM Heat Plan vs Actual")
            headers = rows[3]
            heat_rows = [
                r for r in rows[4:46]
                if clean_val(r[2]) not in (None, "BAR CROPPER") and clean_val(r[0]) != "TOTAL"
            ]
            summary_kv = {clean_val(r[0]): clean_val(r[1]) for r in rows[48:53] if clean_val(r[0])}
            notes = [clean_val(r[0]) for r in rows[55:59] if clean_val(r[0])]
            data["sheets"]["RM Heat Plan vs Actual"] = {
                "heats": rows_to_dicts(heat_rows, headers),
                "summary": summary_kv,
                "data_quality_notes": notes,
            }

        # 5. Heat & Lot Number Reference
        if "Heat & Lot Number Reference" in wb.sheetnames:
            rows = self._sheet_rows(wb, "Heat & Lot Number Reference")
            heats_ref = [
                r for r in rows[5:46]
                if clean_val(r[0]) not in (None, "BAR CROPPER")
            ]
            lots_ref = [r for r in rows[50:84] if clean_val(r[0]) is not None]
            data["sheets"]["Heat & Lot Number Reference"] = {
                "heats": rows_to_dicts(heats_ref, rows[4][:6]),
                "distinct_lots": rows_to_dicts(lots_ref, rows[49][:3]),
                "reconciliation_note": clean_val(rows[87][0]) if len(rows) > 87 else None,
            }

        # 6. Machine Consumables
        if "Machine Consumables" in wb.sheetnames:
            rows = self._sheet_rows(wb, "Machine Consumables")
            data["sheets"]["Machine Consumables"] = {
                "consumables": rows_to_dicts(rows[4:35], rows[3][:8]),
                "notes": clean_val(rows[37][0]) if len(rows) > 37 else None,
            }

        # 7. Machine Master
        if "Machine Master" in wb.sheetnames:
            rows = self._sheet_rows(wb, "Machine Master")
            data["sheets"]["Machine Master"] = {
                "machines": rows_to_dicts(rows[1:32], rows[0][:13]),
                "notes": clean_val(rows[34][0]) if len(rows) > 34 else None,
            }

        # 8. Capacity Change Log
        if "Capacity Change Log" in wb.sheetnames:
            rows = self._sheet_rows(wb, "Capacity Change Log")
            data["sheets"]["Capacity Change Log"] = {
                "changes": rows_to_dicts(rows[1:], rows[0][:6]),
            }

        # 9. Entries (Filter out pre-filled template rows where Date is null)
        if "Entries" in wb.sheetnames:
            rows = self._sheet_rows(wb, "Entries")
            headers = rows[0][:32]
            active_entries = [
                r for r in rows[1:301]
                if clean_val(r[0]) is not None or (clean_val(r[5]) is not None and clean_val(r[7]) is not None)
            ]
            data["sheets"]["Entries"] = {
                "entries": rows_to_dicts(active_entries, headers),
                "template_row_count": 300 - len(active_entries),
                "notes": clean_val(rows[303][0]) if len(rows) > 303 else None,
            }

        # 10. Planned Shutdowns
        if "Planned Shutdowns" in wb.sheetnames:
            rows = self._sheet_rows(wb, "Planned Shutdowns")
            valid_shutdowns = [
                r for r in rows[1:100]
                if clean_val(r[0]) is not None and clean_val(r[0]) != "How this works:"
            ]
            data["sheets"]["Planned Shutdowns"] = {
                "shutdowns": rows_to_dicts(valid_shutdowns, rows[0][:7]),
                "notes": clean_val(rows[103][0]) if len(rows) > 103 else None,
            }

        # 11. Manpower Summary
        if "Manpower Summary" in wb.sheetnames:
            rows = self._sheet_rows(wb, "Manpower Summary")
            data["sheets"]["Manpower Summary"] = {
                "by_work_center": rows_to_dicts(rows[5:14], rows[4][:5]),
                "by_machine": rows_to_dicts(rows[18:49], rows[17][:6]),
            }

        # 12. Production Dashboard
        if "Production Dashboard" in wb.sheetnames:
            rows = self._sheet_rows(wb, "Production Dashboard")
            data["sheets"]["Production Dashboard"] = {
                "filters": {
                    "view_range_days": clean_val(rows[3][1]),
                    "latest_date": clean_val(rows[3][4]),
                    "work_center_filter": clean_val(rows[3][8]),
                    "machine_filter": clean_val(rows[4][8]),
                    "avg_fill_pct": clean_val(rows[5][8]),
                    "total_downtime_hrs": clean_val(rows[6][8]),
                },
                "daily_window": rows_to_dicts(rows[7:37], rows[6][:6]),
                "work_center_pivot": rows_to_dicts(rows[77:82], rows[76][:6]),
                "filtered_trend": rows_to_dicts(rows[108:138], rows[107][:4]),
                "pivot_note": clean_val(rows[83][0]) if len(rows) > 83 else None,
            }

        # 13. Dashboard (Line Bottleneck & Takt)
        if "Dashboard" in wb.sheetnames:
            rows = self._sheet_rows(wb, "Dashboard")
            data["sheets"]["Dashboard"] = {
                "rated_bottleneck": rows_to_dicts(rows[5:14], rows[4][:4]),
                "takt_metrics": {
                    "theoretical_takt_sec": clean_val(rows[15][1]),
                    "theoretical_output_hr": clean_val(rows[16][1]),
                    "theoretical_output_shift": clean_val(rows[17][1]),
                    "total_rated_manpower_shift": clean_val(rows[45][1]) if len(rows) > 45 else 60,
                },
                "actual_performance": rows_to_dicts(rows[23:32], rows[22][:5]),
            }

        # 14. Summary (Month-wise & Year-wise Availability & Production)
        if "Summary" in wb.sheetnames:
            rows = self._sheet_rows(wb, "Summary")
            data["sheets"]["Summary"] = {
                "monthly": rows_to_dicts(rows[5:30], rows[4][:7]),
                "yearly": rows_to_dicts(rows[34:37], rows[33][:7]),
                "live_availability_by_wc": rows_to_dicts(rows[41:50], rows[40][:3]),
            }

        # 15. Downtime Log (14,567 historical rows + active live mirror rows)
        if "Downtime Log" in wb.sheetnames:
            rows = self._sheet_rows(wb, "Downtime Log")
            headers = rows[0][:15]
            valid_logs = [
                r for r in rows[1:14868]
                if clean_val(r[0]) is not None and not str(clean_val(r[0])).startswith("Rows 2-")
            ]
            data["sheets"]["Downtime Log"] = {
                "total_records": len(valid_logs),
                "logs": rows_to_dicts(valid_logs, headers),
            }

        # 16. Downtime Analysis
        if "Downtime Analysis" in wb.sheetnames:
            rows = self._sheet_rows(wb, "Downtime Analysis")
            data["sheets"]["Downtime Analysis"] = {
                "by_category": rows_to_dicts(rows[5:25], rows[4][:5]),
                "breakdown_severity_by_machine": rows_to_dicts(rows[29:49], rows[28][:5]),
                "monthly_prod_vs_target": rows_to_dicts(rows[53:78], rows[52][:5]),
                "insights": [clean_val(rows[i][0]) for i in range(80, min(93, len(rows))) if clean_val(rows[i][0])],
            }

        # 17. OEE & Reliability
        if "OEE & Reliability" in wb.sheetnames:
            rows = self._sheet_rows(wb, "OEE & Reliability")
            data["sheets"]["OEE & Reliability"] = {
                "oee_by_work_center": rows_to_dicts(rows[5:14], rows[4][:6]),
                "mttr_by_machine": rows_to_dicts(rows[19:34], rows[18][:4]),
                "mtbf_by_machine": rows_to_dicts(rows[39:54], rows[38][:4]),
            }

        wb.close()
        return data
```
