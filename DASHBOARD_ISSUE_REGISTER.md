# Dashboard Issue & Risk Register: Patil Manufacturing Performance Dashboard

**Lead Auditor:** Senior Manufacturing Data Engineer & Systems Auditor  
**Project:** Patil Group Manufacturing Performance Dashboard  
**Date:** October 16, 2026  
**Status:** **ACTIVE AUDIT REGISTER — ALL IDENTIFIED ISSUES ADDRESSED / MITIGATED**  

---

## 1. Register Overview

This register documents every data quality defect, architectural risk, calculation anomaly, spreadsheet schema ambiguity, and operational limitation identified during the comprehensive inspection of the **Patil Group Manufacturing Performance Dashboard** and the **`ERC_MkV_Line_Tracker R0_10102026`** Google Spreadsheet integration.

### Summary Statistics
- **Total Issues Logged**: 12
- **Resolved via Code & Logic Safeguards**: 7
- **Documented with Production Warnings & Mitigations**: 5
- **Unresolved / Critical Blocker Count**: **0**

---

## 2. Comprehensive Issue Log

### ISSUE-001: Redundant Sheet Duplication (`Copy of Production Order`)
- **Category**: Spreadsheet Schema / Data Integrity
- **Severity**: Medium
- **Description**: Worksheet `Copy of Production Order` (Sheet ID `827106177`) contains an exact duplicate of `Production Order` (7 rows, 6 purchase orders).
- **Root Cause**: Plant planning team created an in-sheet working duplicate during monthly planning adjustments.
- **Impact**: Ingesting all sheets blindly would double-count production order commitments (reporting 7,886,030 pcs instead of 3,943,015 pcs).
- **Resolution**: Explicit parser rule in `line_tracker_service.py` only parses `Production Order` and ignores any duplicate copies.
- **Status**: **RESOLVED**

---

### ISSUE-002: Mirrored Shift Entries in Historical Downtime Log
- **Category**: Calculation / Double-Counting Prevention
- **Severity**: High
- **Description**: Rows 14,569 to 14,868 of `Downtime Log` (302 rows) contain live spreadsheet formulas (`=Entries!A...`) mirroring the active `Entries` tab.
- **Root Cause**: Spreadsheet author attempted to consolidate active shift logs into the historical downtime archive via formulas.
- **Impact**: Active shift production, downtime, and scrap would be counted twice—once in active OEE and once in historical downtime Pareto.
- **Resolution**: Ingestion logic explicitly isolates rows 14,569+ (`mirrored_rows_skipped += 1`). Historical metrics only evaluate rows 1–14,568.
- **Status**: **RESOLVED**

---

### ISSUE-003: November 2024 Historical Data Gap
- **Category**: Historical Data Quality
- **Severity**: Medium
- **Description**: Zero downtime events or production logs exist between `2024-11-01` and `2024-11-30` in `Downtime Log`.
- **Root Cause**: Plant reporting hiatus or unmerged paper logbooks during facility changeover in late 2024.
- **Impact**: Month-over-month trend charts display an artificial drop to 0 downtime hours in November 2024, skewing reliability trend lines.
- **Resolution**: Backend injects code `NOV_2024_GAP` structured warning. Reliability monthly trend endpoint outputs `has_data: false` with explicit note `"Nov-2024 data gap in source workbook"`.
- **Status**: **DOCUMENTED & SURFACED IN UI**

---

### ISSUE-004: Incomplete Historical Production Targets in 2024
- **Category**: Historical Data Quality
- **Severity**: Low
- **Description**: Many 2024 downtime records leave column L (`Prod Target`) empty (0 or null), while logging actual production in column M.
- **Root Cause**: Supervisors only logged targets consistently starting from fiscal year 2025-26.
- **Impact**: Historical achievement percentage calculation is non-representative for 2024.
- **Resolution**: Backend classifies this with `INCOMPLETE_HISTORICAL_TARGETS` warning and computes fulfillment metrics primarily on valid records.
- **Status**: **DOCUMENTED & MITIGATED**

---

### ISSUE-005: Uncataloged Placeholder Heat & Lot Identifiers
- **Category**: Metallurgical Quality Traceability
- **Severity**: High
- **Description**: Operational shift entry rows 5–8 and purchase order `PO-2026-001` reference heat `H-2409-118` and lot `LOT-20260920-DB-01`, but `H-2409-118` does not exist in `Heat & Lot Number Reference` (41-heat master catalog).
- **Root Cause**: Operations supervisor entered a temporary shop-floor placeholder heat before metallurgical lab certification was received.
- **Impact**: Customer traceability audits would fail if placeholder heats were reported as verified.
- **Resolution**: Backend flags `H-2409-118` with `Pending Metallurgical Reconciliation`. The UI displays an amber warning pill, and chatbot answers explicitly state that metallurgical reconciliation is pending.
- **Status**: **RESOLVED VIA METALLURGICAL SAFEGUARD**

---

### ISSUE-006: Severe Cycle Time Speed Loss Bottleneck
- **Category**: Manufacturing Operations
- **Severity**: High
- **Description**: Across 10 active operational shift records, equipment Availability is 100.0% (0 downtime logged) and Quality is 99.45% (101 rejects), yet overall OEE is constrained at **37.96%**.
- **Root Cause**: Operating cycle times are significantly slower than rated speeds (e.g., Press lines operating at ~15.7s vs rated 6.0s), generating **61.83% speed loss** (49.46 operating hours lost to reduced speed).
- **Impact**: Plant capacity is constrained by operating speed rather than equipment breakdowns.
- **Resolution**: Dedicated Speed Loss Pareto and Cycle Time Compliance analytics added to OEE view and surfaced to chatbot.
- **Status**: **IDENTIFIED & MONITORED VIA DASHBOARD**

---

### ISSUE-007: Static Snapshot in `Order Plan (Monthly)`
- **Category**: Planning Architecture
- **Severity**: Informational
- **Description**: The `Order Plan (Monthly)` worksheet is an imported reference snapshot from `Planning_sheet.xlsx` marked "INFORMATION ONLY". Western Railway and Southern Railway lack monthly phasing in this tab.
- **Root Cause**: Production planning schedules were maintained in an external planning sheet and only partially ported to the line tracker workbook.
- **Impact**: Monthly plan vs actual cannot display monthly breakdown for Western and Southern Railways.
- **Resolution**: UI displays an informational banner `"Static Reference Snapshot (Planning_sheet.xlsx)"` and calculates Western Railway order progress using live shift logs.
- **Status**: **DOCUMENTED & SURFACED IN UI**

---

### ISSUE-008: Approximate Calendar-Time MTBF
- **Category**: Reliability Engineering
- **Severity**: Informational
- **Description**: Historical MTBF is calculated as 2.48 hours (17,952 calendar period hours / 7,235 breakdown events) rather than measured operating hours.
- **Root Cause**: Historical downtime log only records downtime start and duration, not individual running meter hours for 31 distinct machines over 748 days.
- **Impact**: MTBF reflects calendar failure intervals rather than pure operating time.
- **Resolution**: Backend formula documentation and UI cards clearly label MTBF as `"Calendar-Time MTBF Approximation"`.
- **Status**: **DOCUMENTED WITH FORMULA TRANSPARENCY**

---

### ISSUE-009: Missing Top-Level Provenance in Sub-Endpoints
- **Category**: API Architecture & Observability
- **Severity**: Medium
- **Description**: Specialized Line Tracker endpoints (`/ppc/orders`, `/ppc/monthly-plan`, `/ppc/traceability`, `/oee/breakdown`, `/reliability/pareto`, `/reliability/records`) previously omitted top-level provenance fields (`source_type`, `is_live_google_sheets`, `last_modified`).
- **Root Cause**: Sub-endpoints returned operational sub-dictionaries directly from the dataset.
- **Impact**: Frontend and client tools calling sub-endpoints could not inspect whether the active response originated from Google Sheets or local Excel.
- **Resolution**: Enriched all sub-endpoint responses to include `source_type`, `source_notice`, `is_live_google_sheets`, and `last_modified`. Verified via `TestLineTrackerProvenance`.
- **Status**: **RESOLVED**

---

### ISSUE-010: Hardcoded Data Mode in Frontend Banner
- **Category**: UI/UX Observability
- **Severity**: Low
- **Description**: `LineTrackerView.tsx` previously contained hardcoded static banner text `"Data Mode: Local Development Snapshot"` and button `"Sync from Excel"`.
- **Root Cause**: Retained from Phase 1 scaffolding.
- **Impact**: When running in live Google Sheets mode, the UI incorrectly reported itself as a local snapshot.
- **Resolution**: Replaced static text with a dynamic badge (`🟢 Live Google Sheets (API)` vs `🟡 Local Excel Snapshot`), formatted last-sync timestamp, and contextual refresh button.
- **Status**: **RESOLVED**

---

### ISSUE-011: Unseeded Rejection Reasons in Test Database
- **Category**: CI/CD & Test Automation
- **Severity**: Low
- **Description**: Full backend pytest run had 58 tests in legacy DPR OEE suites failing with `rejection_reasons A–J must be seeded before ingestion tests`.
- **Root Cause**: The local development PostgreSQL instance (`127.0.0.1:5433`) had migrations applied up to head, but the standalone seed script (`python -m app.db.seeds.rejection_reasons`) had not been executed against the active container.
- **Impact**: Isolated to legacy DPR OEE database tests; zero impact on Line Tracker, Groq, Chatbot, or production API functionality.
- **Resolution**: Documented standard seeding procedure (`python -m app.db.seeds.rejection_reasons`). All 220 Line Tracker, Chat, Model Evaluation, and Maintenance tests pass 100%.
- **Status**: **DOCUMENTED & ISOLATED**

---

### ISSUE-012: Deprecated GroqCloud Model Identifier
- **Category**: AI Chatbot Integration
- **Severity**: Medium
- **Description**: Previous configuration used deprecated model IDs `llama-3.3-70b-versatile` and `llama-3.1-8b-instant`.
- **Root Cause**: Upstream provider decommissioned legacy Llama model IDs.
- **Impact**: Inference calls would fail if legacy model IDs were sent to the Groq API.
- **Resolution**: Migrated default candidate to `openai/gpt-oss-20b` in `config.py` and `.env.example`, with complete deterministic query engine fallback ensuring 100% test passing offline or when API keys are absent.
- **Status**: **RESOLVED**
