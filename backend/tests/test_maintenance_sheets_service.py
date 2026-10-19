from app.services.maintenance_sheets_service import (
    _dataset_date_bounds,
    normalize_breakdown_rows,
)


def test_normalizes_breakdown_rows_with_all_fields():
    rows = [
        [
            "  Plant Code",
            "Machine",
            "Machine Owner",
            "Date",
            "Shift",
            "Down Time (mins)",
            "Machine Break Down",
            "B/D description",
            "Counter Measure",
            "Root cause",
            "Corrective Action",
            "Spare Parts",
            "Target Date",
            "B/D Attended By",
            "M/C available Time",
            "Production Loss",
            "Remarks",
        ],
        [
            "MED- Forge",
            "Bar cropper 1",
            "Pritam",
            "2026-03-15",
            "B",
            "42.5",
            "Mechanical",
            "Conveyor belt jammed",
            "Immediate clearing",
            "Bearing wear",
            "Replaced bearing and lubricated",
            "6204 Bearing",
            "2026-03-16",
            "Joydeep",
            "618",
            "42",
            "Running smooth",
        ],
        [
            "MED- Forge",
            "Autocopying M/C 2",
            "Mitu",
            "2026-03-16",
            "A",
            "120",
            "Electrical",
            "PLC fault",
            None,
            "Sensor wire cut",
            "Re-wired and tested",
            "Wire 1.5sqmm",
            None,
            "Gowda",
            "540",
            "0",
            None,
        ],
    ]

    records = normalize_breakdown_rows(rows)

    assert len(records) == 2

    # First record checks
    rec1 = records[0]
    assert rec1["id"] == "bd-1"
    assert rec1["plantCode"] == "MED- Forge"
    assert rec1["machine"] == "Bar cropper 1"
    assert rec1["machineOwner"] == "Pritam"
    assert rec1["date"] == "2026-03-15"
    assert rec1["shift"] == "B"
    assert rec1["downtimeMinutes"] == 42.5
    assert rec1["breakdownType"] == "Mechanical"
    assert rec1["breakdownDescription"] == "Conveyor belt jammed"
    assert rec1["counterMeasure"] == "Immediate clearing"
    assert rec1["rootCause"] == "Bearing wear"
    assert rec1["correctiveAction"] == "Replaced bearing and lubricated"
    assert rec1["spareParts"] == "6204 Bearing"
    assert rec1["targetDate"] == "2026-03-16"
    assert rec1["attendedBy"] == "Joydeep"
    assert rec1["productionLoss"] == 42.0

    # Second record checks
    rec2 = records[1]
    assert rec2["id"] == "bd-2"
    assert rec2["machine"] == "Autocopying M/C 2"
    assert rec2["date"] == "2026-03-16"
    assert rec2["shift"] == "A"
    assert rec2["downtimeMinutes"] == 120.0
    assert rec2["breakdownType"] == "Electrical"
    assert rec2["counterMeasure"] is None
    assert rec2["remarks"] is None


def test_skips_empty_rows_and_calculates_date_bounds():
    rows = [
        ["Machine", "Date", "Down Time (mins)"],
        [None, None, None],
        ["Press 1", "2026-01-10", 30],
        ["Press 2", "2026-04-20", 45],
        ["", "2026-02-01", 10],  # empty machine skipped
    ]

    records = normalize_breakdown_rows(rows)
    assert len(records) == 2
    min_date, max_date = _dataset_date_bounds(records)
    assert min_date == "2026-01-10"
    assert max_date == "2026-04-20"

