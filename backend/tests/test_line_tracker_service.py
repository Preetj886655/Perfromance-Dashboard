"""Tests for ERC Mk-V Line Tracker ingestion, normalization, and OEE calculations.

Verifies:
1. Excel loading and missing-file handling.
2. Data type, date normalization, and empty template row filtering.
3. Source separation and double-counting prevention (isolating mirrored rows in Downtime Log).
4. Data quality auditing (Nov 2024 gap, incomplete historical targets).
5. Metallurgical reconciliation tagging ("Pending Metallurgical Reconciliation" for placeholder IDs).
6. Validated component-weighted OEE calculations vs invalid arithmetic averaging.
7. Zero-denominator safety (handling 0 output, 0 runtime gracefully).
8. RBAC and FastAPI endpoint access controls.
"""

from __future__ import annotations

import datetime
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.routes.line_tracker import check_line_tracker_access, router
from app.core.config import settings
from app.core.rbac import require_permission
from app.main import app
from app.models.user import User
from app.services.line_tracker_service import (
    PLACEHOLDER_HEATS,
    PLACEHOLDER_LOTS,
    RECONCILIATION_TAG,
    VERIFIED_TAG,
    _clean_date_str,
    _clean_float,
    _clean_int,
    _clean_str,
    get_line_tracker_dataset,
    get_line_tracker_status,
    parse_line_tracker_workbook,
    resolve_line_tracker_file_path,
)


@pytest.fixture
def mock_dashboard_user() -> User:
    return User(
        email="linetracker_tester@patilgroup.com",
        employee_code="EMP-MkV",
        is_active=True,
    )


@pytest.fixture
def client(mock_dashboard_user: User):
    def mock_require_perm():
        return mock_dashboard_user

    app.dependency_overrides[check_line_tracker_access] = mock_require_perm
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 1. Normalization Utility Tests
# ---------------------------------------------------------------------------

class TestNormalizationUtils:
    """Verify cleaning and coercion functions."""

    def test_clean_str_strips_and_nullifies(self):
        assert _clean_str("  Deburring   ") == "Deburring"
        assert _clean_str("") is None
        assert _clean_str("N/A") is None
        assert _clean_str("#N/A") is None
        assert _clean_str(None) is None

    def test_clean_float_handles_commas_and_percents(self):
        assert _clean_float(" 1,440 ") == 1440.0
        assert _clean_float("32.5%") == 32.5
        assert _clean_float(42.5) == 42.5
        assert _clean_float("invalid") is None
        assert _clean_float(None) is None

    def test_clean_date_str_parses_iso_and_indian_formats(self):
        assert _clean_date_str("2026-09-20 00:00:00") == "2026-09-20"
        assert _clean_date_str("20-09-2026") == "2026-09-20"
        assert _clean_date_str("01-Jul-26") == "2026-07-01"
        assert _clean_date_str(datetime.date(2026, 10, 14)) == "2026-10-14"
        assert _clean_date_str("non-date") == "non-date"


# ---------------------------------------------------------------------------
# 2. File Resolution & Missing File Handling
# ---------------------------------------------------------------------------

class TestFileResolutionAndMissingFile:
    """Verify safe handling when the workbook is present or absent."""

    def test_resolve_line_tracker_file_path(self):
        path = resolve_line_tracker_file_path()
        assert path is not None
        assert "ERC_MkV_Line_Tracker" in path

    def test_missing_file_returns_unconfigured_status(self):
        with patch("app.services.line_tracker_service.resolve_line_tracker_file_path", return_value="/nonexistent/dummy.xlsx"):
            with patch("os.path.exists", return_value=False):
                dataset = get_line_tracker_dataset(refresh=True)
                assert dataset["source_type"] == "unconfigured"
                assert dataset["file_exists"] is False
                assert len(dataset["data_quality_warnings"]) >= 1
                assert dataset["data_quality_warnings"][0]["code"] == "FILE_NOT_FOUND"


# ---------------------------------------------------------------------------
# 3. Full Ingestion & Provenance Tests
# ---------------------------------------------------------------------------

class TestLineTrackerIngestion:
    """Verify parsing against the verified reference workbook."""

    @pytest.fixture(scope="class")
    def dataset(self) -> dict:
        return get_line_tracker_dataset(refresh=True)

    def test_source_is_tagged_as_local_development(self, dataset: dict):
        assert dataset["source_type"] in {"local_excel", "google_sheets"}
        if dataset["source_type"] == "local_excel":
            assert "Not Live Google Sheets" in dataset["source_notice"]

    def test_machine_master_loaded_counts(self, dataset: dict):
        summary = dataset["records_summary"]
        assert summary["machines_count"] == 31
        assert summary["work_centers_count"] >= 8
        machines = dataset["machines"]
        decomm = [m for m in machines if "De-Comissioned" in m.get("status", "")]
        assert len(decomm) == 2  # SBL and SBR

    def test_entries_loaded_active_shifts(self, dataset: dict):
        summary = dataset["records_summary"]
        assert summary["shift_entries_accepted"] == 10
        entries = dataset["shift_entries"]
        dates = {e["date"] for e in entries}
        assert "2026-09-19" in dates
        assert "2026-09-20" in dates

    def test_production_orders_loaded(self, dataset: dict):
        orders = dataset["production_orders"]
        assert len(orders) == 6
        customers = {o["customer"] for o in orders}
        assert any("South Central Railway" in c for c in customers)
        assert any("Western Railway" in o.get("notes", "") or "WR" in o["customer"] for o in orders)

    def test_double_counting_prevention_in_downtime_log(self, dataset: dict):
        summary = dataset["records_summary"]
        # Exactly 14,567 historical records
        assert summary["historical_downtime_accepted"] == 14567
        # Exactly 302 formula-mirrored rows skipped
        assert summary["mirrored_downtime_skipped"] == 302
        # Warning present
        warning_codes = [w["code"] for w in dataset["data_quality_warnings"]]
        assert "DOUBLE_COUNTING_PREVENTED" in warning_codes


# ---------------------------------------------------------------------------
# 4. Data Quality Gaps & Reconciliation Tests
# ---------------------------------------------------------------------------

class TestDataQualityAudit:
    """Verify auditing warnings for known data gaps and unassigned heats."""

    @pytest.fixture(scope="class")
    def dataset(self) -> dict:
        return get_line_tracker_dataset(refresh=False)

    def test_november_2024_gap_warning_detected(self, dataset: dict):
        warning_codes = [w["code"] for w in dataset["data_quality_warnings"]]
        assert "NOV_2024_GAP" in warning_codes

    def test_incomplete_targets_warning_detected(self, dataset: dict):
        warning_codes = [w["code"] for w in dataset["data_quality_warnings"]]
        assert "INCOMPLETE_HISTORICAL_TARGETS" in warning_codes

    def test_placeholder_heat_tagged_as_pending_reconciliation(self, dataset: dict):
        entries = dataset["shift_entries"]
        placeholder_entries = [e for e in entries if e["rm_heat_number"] and e["rm_heat_number"].lower() in PLACEHOLDER_HEATS]
        assert len(placeholder_entries) >= 1
        for pe in placeholder_entries:
            assert pe["traceability_status"] == RECONCILIATION_TAG

    def test_calendar_mtbf_disclaimer_present(self, dataset: dict):
        warning_codes = [w["code"] for w in dataset["data_quality_warnings"]]
        assert "CALENDAR_MTBF_DISCLAIMER" in warning_codes


# ---------------------------------------------------------------------------
# 5. Component-Weighted OEE Mathematical Verification
# ---------------------------------------------------------------------------

class TestOeeCalculations:
    """Verify exact industrial engineering formulas for OEE components."""

    @pytest.fixture(scope="class")
    def dataset(self) -> dict:
        return get_line_tracker_dataset(refresh=False)

    def test_shift_level_component_formulas(self, dataset: dict):
        entries = dataset["shift_entries"]
        # Row 2 (CNC 1, Day Shift): Output=367, DT=0, Rejects=16, RatedCT=25s, Shift=660min
        row_2 = next(e for e in entries if e["machine"] == "CNC 1" and e["shift"] == "Shift 1 (Day)")
        assert row_2["output_qty"] == 367.0
        assert row_2["good_qty"] == 351.0
        assert row_2["availability_rate"] == 1.0  # 660 / 660
        # Performance: (367 * 25) / (660 * 60) = 9175 / 39600 = 0.23169...
        assert round(row_2["performance_rate"], 4) == 0.2317
        # Quality: 351 / 367 = 0.9564...
        assert round(row_2["quality_rate"], 4) == 0.9564
        # OEE: 1.0 * 0.23169 * 0.9564 = 0.22159...
        assert round(row_2["oee_rate"], 4) == 0.2216

    def test_aggregate_weighted_oee_vs_average_of_percentages(self, dataset: dict):
        oee_agg = dataset["oee_aggregate"]
        entries = dataset["shift_entries"]

        # Calculate naive average of OEE percentages
        valid_oees = [e["oee_rate"] for e in entries if e["oee_rate"] is not None]
        naive_average = (sum(valid_oees) / len(valid_oees)) * 100.0

        # Retrieve mathematically weighted OEE
        weighted_oee = oee_agg["component_weighted_oee"]
        assert weighted_oee is not None
        assert oee_agg["component_weighted_availability"] is not None
        assert oee_agg["component_weighted_performance"] is not None
        assert oee_agg["component_weighted_quality"] is not None

        # Verify weighted availability is exactly sum(runtime) / sum(planned_time) * 100
        total_run = sum(e["run_time_min"] for e in entries)
        total_planned = sum(e["planned_operating_time_min"] for e in entries)
        expected_avail = round((total_run / total_planned) * 100, 2)
        assert oee_agg["component_weighted_availability"] == expected_avail

    def test_zero_output_handles_division_by_zero_safely(self):
        """When output is 0 and runtime is 0, Quality and Performance must return None, not crash."""
        entry = {
            "output_qty": 0.0,
            "total_rejects": 0.0,
            "rated_ct_sec": 25.0,
            "run_time_min": 0.0,
            "planned_operating_time_min": 0.0,
        }
        avail = entry["run_time_min"] / entry["planned_operating_time_min"] if entry["planned_operating_time_min"] > 0 else None
        perf = (entry["output_qty"] * entry["rated_ct_sec"]) / (entry["run_time_min"] * 60) if entry["run_time_min"] > 0 else None
        qual = (entry["output_qty"] - entry["total_rejects"]) / entry["output_qty"] if entry["output_qty"] > 0 else None
        assert avail is None
        assert perf is None
        assert qual is None


# ---------------------------------------------------------------------------
# 6. FastAPI Line Tracker Route Tests & RBAC
# ---------------------------------------------------------------------------

class TestLineTrackerRoutes:
    """Verify REST endpoints and permission enforcement."""

    def test_status_endpoint_returns_200(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_type"] in {"local_excel", "google_sheets"}
        assert "records_summary" in data
        assert data["records_summary"]["machines_count"] == 31

    def test_summary_endpoint_returns_kpis(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "oee_aggregate" in data
        assert "data_quality_warnings" in data
        assert "top_historical_downtime_categories" in data

    def test_entries_endpoint_returns_shift_list(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/entries")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 10
        assert len(data["entries"]) == 10
        first = data["entries"][0]
        assert "traceability_status" in first
        assert "oee_rate" in first

    def test_entries_endpoint_filtered_by_work_center(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/entries?work_center=Forming")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 2
        for e in data["entries"]:
            assert e["work_center"].lower() == "forming"

    def test_orders_endpoint_returns_orders(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/orders")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 6

    def test_machines_endpoint_returns_machines(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/machines")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 31

    def test_heats_endpoint_returns_catalog(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/heats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] >= 30

    def test_ppc_orders_endpoint_returns_enriched_orders(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/ppc/orders")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 6
        assert "summary" in data
        assert data["summary"]["total_ordered_qty"] == 3943015
        assert data["summary"]["at_risk_orders_count"] == 1

        wr_order = next(o for o in data["orders"] if o["order_number"] == "PO-2026-001")
        assert wr_order["fulfillment_status"] == "At Risk"
        assert wr_order["produced_qty"] == 18159.0
        assert wr_order["outstanding_qty"] == 589626.0
        assert wr_order["completion_pct"] == 2.99
        assert wr_order["dp_date"] == "2026-10-20"
        assert len(wr_order["risk_reasons"]) > 0

    def test_ppc_monthly_plan_endpoint(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/ppc/monthly-plan")
        assert resp.status_code == 200
        data = resp.json()
        assert "metadata" in data
        assert data["metadata"]["is_stale_snapshot"] is True
        assert "monthly_calendar" in data
        assert len(data["monthly_calendar"]) == 12

        # Verify Apr-26 planned production
        apr = next(m for m in data["monthly_calendar"] if m["month"] == "Apr-26")
        assert apr["planned_production"] == 142247.0

        # Verify Sep-26 has live actuals from Entries
        sep = next(m for m in data["monthly_calendar"] if m["month"] == "Sep-26")
        assert sep["actual_production"] == 18159.0

    def test_ppc_traceability_endpoint(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/ppc/traceability")
        assert resp.status_code == 200
        data = resp.json()
        assert "funnel_summary" in data
        assert data["funnel_summary"]["total_forming_ok_nos"] > 1000000
        assert len(data["heats"]) == 40
        assert len(data["reconciliation_alerts"]) == 1
        assert data["reconciliation_alerts"][0]["heat_number"] == "H-2409-118"
        assert data["reconciliation_alerts"][0]["status"] == RECONCILIATION_TAG

    def test_summary_includes_ppc_summary(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "ppc_summary" in data
        assert data["ppc_summary"]["total_ordered_qty"] == 3943015
        assert data["ppc_summary"]["overall_fulfillment_pct"] == 14.22

    # -----------------------------------------------------------------------
    # Phase 3 Tests: Machine-wise, Work-center, Shift OEE & Cycle Time
    # -----------------------------------------------------------------------

    def test_oee_breakdown_endpoint_structure(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/oee/breakdown")
        assert resp.status_code == 200
        data = resp.json()
        assert "overall" in data
        assert "work_centers" in data
        assert "machines" in data
        assert "shifts" in data
        assert "speed_loss_pareto" in data
        assert "cycle_time_analysis" in data
        assert "formula_documentation" in data
        assert data["overall"]["count"] == 10

    def test_component_weighted_oee_work_centers(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/oee/breakdown")
        assert resp.status_code == 200
        data = resp.json()

        wc_map = {wc["work_center"]: wc for wc in data["work_centers"]}
        assert "Turning" in wc_map
        assert "Forming" in wc_map
        assert "BC" in wc_map

        # Turning: 7 shift entries, OEE = 30.06%
        turning = wc_map["Turning"]
        assert turning["metrics"]["count"] == 7
        assert turning["metrics"]["availability_pct"] == 100.0
        assert turning["metrics"]["performance_pct"] == 30.55
        assert turning["metrics"]["quality_pct"] == 98.41
        assert turning["metrics"]["oee_pct"] == 30.06
        assert turning["distinct_machines_count"] == 6

        # Forming: 2 shift entries, OEE = 67.53%
        forming = wc_map["Forming"]
        assert forming["metrics"]["count"] == 2
        assert forming["metrics"]["availability_pct"] == 100.0
        assert forming["metrics"]["performance_pct"] == 67.81
        assert forming["metrics"]["quality_pct"] == 99.59
        assert forming["metrics"]["oee_pct"] == 67.53

        # BC: 1 shift entry, OEE = 32.21%
        bc = wc_map["BC"]
        assert bc["metrics"]["count"] == 1
        assert bc["metrics"]["availability_pct"] == 100.0
        assert bc["metrics"]["performance_pct"] == 32.25
        assert bc["metrics"]["quality_pct"] == 99.86
        assert bc["metrics"]["oee_pct"] == 32.21

        # Overall Line OEE = 37.96%
        assert data["overall"]["oee_pct"] == 37.96
        assert data["overall"]["availability_pct"] == 100.0
        assert data["overall"]["performance_pct"] == 38.17
        assert data["overall"]["quality_pct"] == 99.45

    def test_cycle_time_analysis_and_speed_loss(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/oee/breakdown")
        assert resp.status_code == 200
        data = resp.json()

        analysis = data["cycle_time_analysis"]
        assert analysis["total_speed_loss_minutes"] == 4080.8
        assert analysis["total_speed_loss_hours"] == 68.01
        assert analysis["overall_speed_loss_pct_of_runtime"] == 61.83
        assert analysis["slower_than_rated_count"] == 9
        assert analysis["nominal_or_faster_count"] == 0

        # Verify speed loss pareto is sorted descending
        pareto = data["speed_loss_pareto"]
        assert len(pareto) == 9
        for i in range(len(pareto) - 1):
            assert pareto[i]["speed_loss_min"] >= pareto[i + 1]["speed_loss_min"]

    def test_shift_level_performance_comparison(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/oee/breakdown")
        assert resp.status_code == 200
        data = resp.json()

        shifts = {s["shift"]: s for s in data["shifts"]}
        assert "Shift 1 (Day)" in shifts
        assert "Shift 2 (Night)" in shifts

        shift1 = shifts["Shift 1 (Day)"]
        assert shift1["metrics"]["count"] == 1
        assert shift1["metrics"]["sum_output_qty"] == 367
        assert shift1["metrics"]["sum_reject_qty"] == 16
        assert shift1["metrics"]["oee_pct"] == 22.16

        shift2 = shifts["Shift 2 (Night)"]
        assert shift2["metrics"]["count"] == 9
        assert shift2["metrics"]["sum_output_qty"] == 17893
        assert shift2["metrics"]["sum_reject_qty"] == 85
        assert shift2["metrics"]["oee_pct"] == 39.65

    def test_oee_breakdown_filtering(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/oee/breakdown?work_center=Forming")
        assert resp.status_code == 200
        data = resp.json()
        assert data["overall"]["count"] == 2
        assert data["overall"]["oee_pct"] == 67.53
        assert len(data["machines"]) == 2
        assert set(m["machine"] for m in data["machines"]) == {"Press line E1", "Press line P2"}

    def test_entries_endpoint_slice_filtering(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/entries?work_center=Turning")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 7
        assert data["oee_aggregate"]["count"] == 7
        assert data["oee_aggregate"]["oee_pct"] == 30.06


# ---------------------------------------------------------------------------
# 7. Phase 4: Reliability & Downtime Pareto Tests
# ---------------------------------------------------------------------------

class TestReliabilityParetoAndMTTR:
    """Verify historical downtime Pareto, planned vs unplanned breakdown, MTTR/MTBF, and data provenance."""

    def test_reliability_summary_metrics(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/reliability/pareto")
        assert resp.status_code == 200
        data = resp.json()
        summary = data["summary"]

        assert summary["total_records"] == 14567
        assert summary["total_downtime_minutes"] == 2192536.1
        assert summary["total_downtime_hours"] == 36542.3
        assert summary["planned_downtime_hours"] == 3413.4
        assert summary["planned_downtime_pct"] == 9.34
        assert summary["unplanned_downtime_hours"] == 33128.9
        assert summary["unplanned_downtime_pct"] == 90.66
        assert summary["breakdown_events_count"] == 1482
        assert summary["breakdown_downtime_hours"] == 5644.8
        assert summary["mirrored_rows_excluded"] == 302
        assert summary["overall_mttr_hours"] == 3.81
        assert summary["overall_mtbf_approx_hours"] == 12.1

    def test_category_pareto_sorting_and_shares(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/reliability/pareto")
        assert resp.status_code == 200
        data = resp.json()

        pareto = data["category_pareto"]
        assert len(pareto) >= 10
        # 1st: Dimensions & Length Issue
        assert pareto[0]["category"] == "Dimensions & Length Issue"
        assert pareto[0]["total_hours"] == 14303.1
        assert pareto[0]["share_pct"] == 39.14
        assert pareto[0]["event_count"] == 3428

        # 2nd: Breakdown
        assert pareto[1]["category"] == "Breakdown"
        assert pareto[1]["total_hours"] == 5644.8
        assert pareto[1]["share_pct"] == 15.45
        assert pareto[1]["event_count"] == 1482

        # Verify descending order & cumulative share
        for i in range(len(pareto) - 1):
            assert pareto[i]["total_minutes"] >= pareto[i + 1]["total_minutes"]
            assert pareto[i]["cumulative_share_pct"] <= pareto[i + 1]["cumulative_share_pct"]
        assert pareto[-1]["cumulative_share_pct"] == 100.0

    def test_machine_reliability_mttr_and_mtbf(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/reliability/pareto")
        assert resp.status_code == 200
        data = resp.json()

        machines = {m["machine"]: m for m in data["machine_ranking"]}

        # Check Autocopying-5: 148 events, MTTR = 6.60 hrs, MTBF = 121.3 hrs (17952 / 148)
        assert "Autocopying-5" in machines
        ac5 = machines["Autocopying-5"]
        assert ac5["breakdown_event_count"] == 148
        assert ac5["mttr_hours"] == 6.60
        assert ac5["mtbf_approx_hours"] == 121.3

        # Check Autocopying-2: 123 events, MTTR = 6.62 hrs, MTBF = 146.0 hrs
        assert "Autocopying-2" in machines
        ac2 = machines["Autocopying-2"]
        assert ac2["breakdown_event_count"] == 123
        assert ac2["mttr_hours"] == 6.62
        assert ac2["mtbf_approx_hours"] == 146.0

        # Check Sikka1: 73 events, MTTR = 9.23 hrs, MTBF = 245.9 hrs
        assert "Sikka1" in machines
        sikka1 = machines["Sikka1"]
        assert sikka1["breakdown_event_count"] == 73
        assert sikka1["mttr_hours"] == 9.23
        assert sikka1["mtbf_approx_hours"] == 245.9

    def test_november_2024_gap_handled(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/reliability/pareto")
        assert resp.status_code == 200
        data = resp.json()

        nov_item = next((m for m in data["monthly_trends"] if m["month"] == "2024-11"), None)
        assert nov_item is not None
        assert nov_item["has_data"] is False
        assert nov_item["downtime_hours"] == 0.0
        assert "Nov-2024" in nov_item["note"]

    def test_slice_filtering_on_reliability(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/reliability/pareto?machine=Autocopying-5")
        assert resp.status_code == 200
        data = resp.json()
        assert data["filters_applied"]["machine"] == "Autocopying-5"
        assert len(data["machine_ranking"]) == 1
        assert data["machine_ranking"][0]["machine"] == "Autocopying-5"
        assert data["summary"]["breakdown_events_count"] == 148

    def test_historical_records_paginated_and_search(self, client: TestClient):
        resp = client.get("/api/v1/line-tracker/reliability/records?page=1&page_size=25")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_count"] == 14567
        assert data["page"] == 1
        assert data["page_size"] == 25
        assert len(data["records"]) == 25

        # Search test
        search_resp = client.get("/api/v1/line-tracker/reliability/records?search=Hydraulic&page_size=10")
        assert search_resp.status_code == 200
        s_data = search_resp.json()
        assert s_data["total_count"] > 0
        for rec in s_data["records"]:
            combined = (
                (rec.get("machine") or "")
                + " "
                + (rec.get("category") or "")
                + " "
                + (rec.get("downtime_type") or "")
                + " "
                + (rec.get("description") or "")
            ).lower()
            assert "hydraulic" in combined


# ---------------------------------------------------------------------------
# 9. Source Provenance & Google Sheets Switching Tests
# ---------------------------------------------------------------------------

class TestLineTrackerProvenance:
    """Verify that every Line Tracker endpoint exposes source provenance metadata."""

    def test_summary_and_status_expose_provenance(self, client: TestClient):
        resp_sum = client.get("/api/v1/line-tracker/summary")
        assert resp_sum.status_code == 200
        data_sum = resp_sum.json()
        assert "source_type" in data_sum
        assert "source_notice" in data_sum
        assert "is_live_google_sheets" in data_sum
        assert "file_name" in data_sum
        assert "last_modified" in data_sum

        resp_stat = client.get("/api/v1/line-tracker/status")
        assert resp_stat.status_code == 200
        data_stat = resp_stat.json()
        assert "source_type" in data_stat
        assert "is_live_google_sheets" in data_stat

    def test_sub_endpoints_expose_provenance(self, client: TestClient):
        endpoints = [
            "/api/v1/line-tracker/ppc/orders",
            "/api/v1/line-tracker/ppc/monthly-plan",
            "/api/v1/line-tracker/ppc/traceability",
            "/api/v1/line-tracker/oee/breakdown",
            "/api/v1/line-tracker/reliability/pareto",
            "/api/v1/line-tracker/reliability/records?page=1&page_size=5",
        ]
        for ep in endpoints:
            resp = client.get(ep)
            assert resp.status_code == 200, f"Endpoint {ep} failed: {resp.text}"
            data = resp.json()
            assert "source_type" in data, f"{ep} missing source_type"
            assert "source_notice" in data, f"{ep} missing source_notice"
            assert "is_live_google_sheets" in data, f"{ep} missing is_live_google_sheets"
            assert "last_modified" in data, f"{ep} missing last_modified"

    def test_google_sheets_unavailable_fallback_warning(self, client: TestClient):
        with patch.object(settings, "line_tracker_source", "google_sheets"):
            with patch(
                "app.services.line_tracker_service.fetch_google_sheets_workbook",
                side_effect=RuntimeError("Simulated 403 Forbidden"),
            ):
                data = get_line_tracker_dataset(refresh=True)
                assert data["source_type"] == "local_excel"
                assert data["is_live_google_sheets"] is False
                assert any(
                    w.get("code") == "GOOGLE_SHEETS_UNAVAILABLE"
                    for w in data.get("data_quality_warnings", [])
                )
                # Cleanup cache after test
                get_line_tracker_dataset(refresh=True)




