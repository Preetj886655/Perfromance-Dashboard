"""API tests for DPR_OEE import + row-level production inspection.

Uses Compose Postgres (127.0.0.1:5433 / pril_analytics) inside a rolled-back
outer transaction so no temporary masters/production/import rows remain.

Covers validation items 1–12. Prior calculator/persistence/ingestion/health
suites must continue to pass.
"""

from __future__ import annotations

import io
import uuid
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db, get_engine
from app.main import app
from app.models.import_job import ImportJob
from app.models.plant import Plant
from app.models.production_record_metrics import ProductionRecordMetrics
from tests.test_dpr_oee_ingestion import (
    _row5_cells,
    _row6_cells,
    _seed_masters_for_real_xlsx,
    _seed_second_machine,
    _write_minimal_workbook,
)


@pytest.fixture
def db_session() -> Session:
    """Session bound to an outer transaction that always rolls back."""
    engine = get_engine()
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, autoflush=False, expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session) -> TestClient:
    """TestClient with get_db overridden — no commit (outer txn rolls back)."""

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _xlsx_bytes(*, rows: list[dict]) -> bytes:
    buf = io.BytesIO()
    _write_minimal_workbook(buf, rows=rows)
    return buf.getvalue()


def _upload(
    client: TestClient,
    *,
    content: bytes,
    plant_id: UUID,
    filename: str = "dpr_oee.xlsx",
    uploaded_by: UUID | None = None,
):
    data: dict[str, str] = {"plant_id": str(plant_id)}
    if uploaded_by is not None:
        data["uploaded_by"] = str(uploaded_by)
    return client.post(
        "/api/v1/imports/dpr-oee",
        data=data,
        files={
            "file": (
                filename,
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )


# --- 1: successful DPR_OEE upload ---


def test_api_1_successful_dpr_oee_upload(
    client: TestClient, db_session: Session
) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    _seed_second_machine(db_session, masters)

    content = _xlsx_bytes(
        rows=[
            _row5_cells(machine="M001"),
            _row6_cells(machine="M002"),
        ]
    )
    response = _upload(client, content=content, plant_id=plant.id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body.keys()) >= {
        "import_job_id",
        "status",
        "total_rows",
        "success_count",
        "error_count",
        "message",
    }
    assert body["status"] == "committed"
    assert body["total_rows"] == 2
    assert body["success_count"] == 2
    assert body["error_count"] == 0
    # Do not return full dataset
    assert "production_record_ids" not in body
    assert "rows" not in body
    assert "items" not in body

    job = db_session.get(ImportJob, UUID(body["import_job_id"]))
    assert job is not None
    assert job.success_count == 2


# --- 2: invalid file ---


def test_api_2_invalid_file_extension(
    client: TestClient, db_session: Session
) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    response = _upload(
        client,
        content=b"not-an-excel",
        plant_id=plant.id,
        filename="notes.txt",
    )
    assert response.status_code == 400
    assert "Excel" in response.json()["detail"]


def test_api_2_empty_file(client: TestClient, db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    response = _upload(client, content=b"", plant_id=plant.id)
    assert response.status_code == 400


# --- 3: missing required plant_id ---


def test_api_3_missing_plant_id(client: TestClient, db_session: Session) -> None:
    _seed_masters_for_real_xlsx(db_session)
    content = _xlsx_bytes(rows=[_row5_cells()])
    response = client.post(
        "/api/v1/imports/dpr-oee",
        files={
            "file": (
                "dpr_oee.xlsx",
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == 422


# --- 4: invalid workbook/sheet ---


def test_api_4_invalid_workbook_sheet(
    client: TestClient, db_session: Session
) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    wb = Workbook()
    wb.active.title = "NOT_DPR"
    buf = io.BytesIO()
    wb.save(buf)
    response = _upload(client, content=buf.getvalue(), plant_id=plant.id)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["success_count"] == 0
    assert "DPR_OEE" in (body["message"] or "")


# --- 5: import job status retrieval ---


def test_api_5_import_job_status(client: TestClient, db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    content = _xlsx_bytes(rows=[_row5_cells()])
    upload = _upload(client, content=content, plant_id=plant.id)
    assert upload.status_code == 200
    import_id = upload.json()["import_job_id"]

    response = client.get(f"/api/v1/imports/{import_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == import_id
    assert body["source_type"] == "excel"
    assert body["status"] == "committed"
    assert body["total_rows"] == 1
    assert body["processed_rows"] == 1
    assert body["success_count"] == 1
    assert body["error_count"] == 0
    assert "created_at" in body
    assert "updated_at" in body


# --- 6: import rows retrieval ---


def test_api_6_import_rows_paginated(
    client: TestClient, db_session: Session
) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    _seed_second_machine(db_session, masters)
    content = _xlsx_bytes(
        rows=[
            _row5_cells(machine="M001"),
            _row6_cells(machine="M002"),
        ]
    )
    upload = _upload(client, content=content, plant_id=plant.id)
    import_id = upload.json()["import_job_id"]

    response = client.get(
        f"/api/v1/imports/{import_id}/rows",
        params={"limit": 1, "offset": 0},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["limit"] == 1
    assert body["offset"] == 0
    assert len(body["items"]) == 1
    row = body["items"][0]
    assert "row_number" in row
    assert "external_row_key" in row
    assert "validation_errors" in row
    assert "production_record_id" in row
    assert row["status"] == "success"
    assert "raw_row_payload" not in row  # avoid dumping full payload by default

    page = client.get(
        f"/api/v1/imports/{import_id}/rows",
        params={"page": 2, "size": 1},
    )
    assert page.status_code == 200
    assert page.json()["offset"] == 1
    assert len(page.json()["items"]) == 1


# --- 7–10: production record / metrics / null / events ---


def test_api_7_to_10_production_record_metrics_events_null(
    client: TestClient, db_session: Session
) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    content = _xlsx_bytes(rows=[_row5_cells()])
    upload = _upload(client, content=content, plant_id=plant.id)
    assert upload.status_code == 200
    import_id = upload.json()["import_job_id"]

    rows_resp = client.get(f"/api/v1/imports/{import_id}/rows")
    pr_id = rows_resp.json()["items"][0]["production_record_id"]
    assert pr_id is not None

    # 7: RAW production record
    raw = client.get(f"/api/v1/production-records/{pr_id}")
    assert raw.status_code == 200
    raw_body = raw.json()
    assert raw_body["id"] == pr_id
    assert raw_body["plant_id"] == str(plant.id)
    assert "produced_qty" in raw_body
    assert "planned_downtime_min" in raw_body
    assert "source_import_id" in raw_body
    assert "external_row_key" in raw_body
    # No calculated OEE fields on raw root
    for forbidden in (
        "oee",
        "availability",
        "performance",
        "quality",
        "shift_time_min",
        "run_time_min",
        "machine_utilisation",
    ):
        assert forbidden not in raw_body

    # 8: metrics
    metrics = client.get(f"/api/v1/production-records/{pr_id}/metrics")
    assert metrics.status_code == 200
    m = metrics.json()
    for key in (
        "shift_time_min",
        "available_time_min",
        "total_idle_time_min",
        "run_time_min",
        "target_qty_per_hr",
        "actual_qty_per_hr",
        "availability",
        "performance",
        "machine_utilisation",
        "total_rejection_qty",
        "rejection_ppm",
        "quality",
        "oee",
        "computed_at",
        "formula_version",
    ):
        assert key in m
    assert m["formula_version"] == 1
    assert m["oee"] is not None
    assert abs(m["oee"] - 0.8977272727) < 1e-6

    # 10: events
    events = client.get(f"/api/v1/production-records/{pr_id}/events")
    assert events.status_code == 200
    ev = events.json()
    assert "downtime_events" in ev
    assert "rejection_events" in ev
    assert isinstance(ev["downtime_events"], list)
    assert isinstance(ev["rejection_events"], list)
    assert len(ev["downtime_events"]) >= 1  # U=20 M/c Under BD
    assert len(ev["rejection_events"]) >= 1

    # 9: SQL NULL → JSON null (force nullable metric columns to NULL)
    metrics_row = db_session.get(ProductionRecordMetrics, UUID(pr_id))
    assert metrics_row is not None
    metrics_row.shift_time_min = None
    metrics_row.available_time_min = None
    metrics_row.run_time_min = None
    metrics_row.target_qty_per_hr = None
    metrics_row.actual_qty_per_hr = None
    metrics_row.availability = None
    metrics_row.performance = None
    metrics_row.machine_utilisation = None
    metrics_row.rejection_ppm = None
    metrics_row.quality = None
    metrics_row.oee = None
    db_session.flush()

    null_metrics = client.get(f"/api/v1/production-records/{pr_id}/metrics")
    assert null_metrics.status_code == 200
    nm = null_metrics.json()
    for key in (
        "shift_time_min",
        "available_time_min",
        "run_time_min",
        "target_qty_per_hr",
        "actual_qty_per_hr",
        "availability",
        "performance",
        "machine_utilisation",
        "rejection_ppm",
        "quality",
        "oee",
    ):
        assert key in nm
        assert nm[key] is None, f"{key} should be JSON null, got {nm[key]!r}"
    # Non-nullable totals remain numbers (not coerced from NULL)
    assert nm["total_idle_time_min"] is not None
    assert nm["total_rejection_qty"] is not None


# --- 11: 404 behavior ---


def test_api_11_not_found(client: TestClient, db_session: Session) -> None:
    _seed_masters_for_real_xlsx(db_session)
    missing = uuid.uuid4()
    assert client.get(f"/api/v1/imports/{missing}").status_code == 404
    assert client.get(f"/api/v1/imports/{missing}/rows").status_code == 404
    assert client.get(f"/api/v1/production-records/{missing}").status_code == 404
    assert (
        client.get(f"/api/v1/production-records/{missing}/metrics").status_code
        == 404
    )
    assert (
        client.get(f"/api/v1/production-records/{missing}/events").status_code
        == 404
    )

    # plant_id not found on upload
    content = _xlsx_bytes(rows=[_row5_cells()])
    response = _upload(client, content=content, plant_id=missing)
    assert response.status_code == 404


# --- 12 + cleanliness: leftover counts ---


def test_api_12_health_still_ok(client: TestClient) -> None:
    """Smoke: health route remains wired (mocked DB path covered in test_health)."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["health"] == "/api/v1/health"


def test_api_no_leftover_operational_rows_after_rollback(
    db_session: Session,
) -> None:
    """Within the rolled-back session, counts of this txn's inserts are rolled back.

    Also verify the real DB (separate connection) has zero leftover operational
    rows from prior failed commits — same cleanliness gate as ingestion suite.
    """
    # Touch session so fixture runs; then check live DB outside the txn.
    _ = db_session
    engine = get_engine()
    with engine.connect() as conn:
        for table in (
            "production_records",
            "downtime_events",
            "rejection_events",
            "import_jobs",
            "import_job_rows",
        ):
            count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            assert count == 0, f"expected 0 leftover rows in {table}, got {count}"


def test_api_security_marked_development_internal(client: TestClient) -> None:
    root = client.get("/").json()
    assert "development/internal" in root.get("security", "").lower()
