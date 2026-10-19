# ERC_MKV_VALIDATION_ISSUE_REGISTER.md

**Date:** 2026-10-15  
**Status:** READ-ONLY AUDIT

| Issue ID | Severity | Worksheet/Component | Evidence | Business Impact | Recommended Correction | Approval Required | Validation Status |
|---|---|---|---|---|---|---|---|
| ISS-001 | MEDIUM | Google Sheets Access | 403 from validation scripts | Cannot confirm GS vs Excel parity | Verify service account access/scopes (spreadsheets.readonly) | Yes | NOT VERIFIED |
| ISS-002 | MEDIUM | Downtime Log classification | Category-based gives 1.81%% planned | May differ from business rule | Confirm explicit planned flag vs category | Yes | PARTIALLY VERIFIED |
| ISS-003 | LOW | Production Order | PO-2026-001 notes mark placeholder ID | Potential traceability confusion | Clarify placeholder vs real IDs | No | NOTED |
| ISS-004 | LOW | Order Plan (Monthly) | Snapshot from Planning_sheet.xlsx (not auto-synced) | Risk claiming live planning | Label as snapshot in UI/backend | No | NOTED |
| ISS-005 | INFO | November 2024 gap | 0 records confirmed | Known historical gap | Document as known gap | No | VERIFIED |
