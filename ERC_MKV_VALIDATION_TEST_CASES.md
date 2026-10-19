# ERC_MKV_VALIDATION_TEST_CASES.md

**Date:** 2026-10-15

| Test Case | Expected | Actual (Excel) | Status | Method |
|---|---|---|---|---|
| TC-001 | 17 tabs with expected names | 17 tabs confirmed | PASS | openpyxl sheetnames |
| TC-002 | 14,567 records, 2024-08-31 to 2026-09-18 | 14,567 records, 2024-08-31 to 2026-09-18 | PASS | Row scan 2-14568 |
| TC-003 | Mirrored region 14569-14868 empty (data_only) | Empty | PASS | data_only inspection |
| TC-004 | November 2024 has 0 records | 0 records | PASS | Month grouping |
| TC-005 | Breakdown metrics computed | 1482 events, 5644.8h | PASS | Classification |
| TC-006 | Planned/unplanned computed | 3529.5h planned (1.81%%), 33012.8h unplanned (98.19%%) | PASS | Category text match |
| TC-007 | GS vs Excel parity | Not validated | NOT TESTED | Requires GS access |
