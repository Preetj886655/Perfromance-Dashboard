"""API tests for the DPR_OEE CSV commit route — CSV Import Phase 1.

Uses Compose Postgres (127.0.0.1:5433 / pril_analytics) inside a rolled-back
outer transaction so no temporary masters/production/import rows remain.

Mirrors test_dpr_oee_api.py's structure/assertions for the Excel route so the
two commit endpoints are held to the same bar, not a weaker CSV-only story.
"""

from __future__ import annotations

import io
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import get_db, get_engine
from app.main import app
from app.models.import_job import ImportJob
from app.models.plant import Plant
from tests.auth_helpers import make_auth_headers
from tests.test_dpr_oee_csv_ingestion import _write_minimal_csv
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
    """TestClient with get_db overridden and valid auth headers for protected APIs."""
    _, auth_headers = make_auth_headers(db_session, role_code="SUPER_ADMIN")

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        original_get = test_client.get
        original_post = test_client.post

        def _with_auth(method):
            def wrapped(url, *args, **kwargs):
                kwargs_headers = dict(kwargs.pop("headers", {}) or {})
                if not str(url).startswith("/api/v1/auth") and str(url) != "/api/v1/health":
                    kwargs_headers.setdefault("Authorization", auth_headers["Authorization"])
                kwargs["headers"] = kwargs_headers
                return method(url, *args, **kwargs)

            return wrapped

        test_client.get = _with_auth(original_get)
        test_client.post = _with_auth(original_post)
        yield test_client
    app.dependency_overrides.clear()


def _upload_csv(
    client: TestClient,
    *,
    content: bytes,
    plant_id: UUID,
    filename: str = "dpr_oee.csv",
    uploaded_by: UUID | None = None,
):
    data: dict[str, str] = {"plant_id": str(plant_id)}
    if uploaded_by is not None:
        data["uploaded_by"] = str(uploaded_by)
    return client.post(
        "/api/v1/imports/dpr-oee/csv",
        data=data,
        files={"file": (filename, content, "text/csv")},
    )


# --- 1: successful CSV upload ---


def test_csv_api_1_successful_upload(client: TestClient, db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    _seed_second_machine(db_session, masters)

    content = _write_minimal_csv(
        rows=[_row5_cells(machine="M001"), _row6_cells(machine="M002")]
    )
    response = _upload_csv(client, content=content, plant_id=plant.id)
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
    assert "production_record_ids" not in body
    assert "rows" not in body
    assert "items" not in body

    job = db_session.get(ImportJob, UUID(body["import_job_id"]))
    assert job is not None
    assert job.success_count == 2
    assert job.source_type == "csv"


# --- 2: invalid file / empty file ---


def test_csv_api_2_invalid_file_extension(client: TestClient, db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    response = _upload_csv(
        client,
        content=b"not-a-csv-really",
        plant_id=plant.id,
        filename="notes.txt",
    )
    assert response.status_code == 400
    assert "CSV" in response.json()["detail"]


def test_csv_api_2_rejects_xlsx_extension(client: TestClient, db_session: Session) -> None:
    """The CSV route should not silently accept an Excel upload — use /imports/dpr-oee for that."""
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    response = _upload_csv(
        client,
        content=b"PK\x03\x04fake-xlsx-bytes",
        plant_id=plant.id,
        filename="dpr_oee.xlsx",
    )
    assert response.status_code == 400
    assert "CSV" in response.json()["detail"]


def test_csv_api_2_empty_file(client: TestClient, db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    response = _upload_csv(client, content=b"", plant_id=plant.id)
    assert response.status_code == 400


# --- 3: missing required plant_id ---


def test_csv_api_3_missing_plant_id(client: TestClient, db_session: Session) -> None:
    _seed_masters_for_real_xlsx(db_session)
    content = _write_minimal_csv(rows=[_row5_cells()])
    response = client.post(
        "/api/v1/imports/dpr-oee/csv",
        files={"file": ("dpr_oee.csv", content, "text/csv")},
    )
    assert response.status_code == 422


# --- 4: structurally invalid CSV (wrong header layout) ---


def test_csv_api_4_wrong_header_layout(client: TestClient, db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    content = _write_minimal_csv(
        rows=[_row5_cells()], row3_overrides={"C": "Production Hour"}
    )
    response = _upload_csv(client, content=content, plant_id=plant.id)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["success_count"] == 0
    assert "Shift" in (body["message"] or "")


# --- 5: import job status retrieval (same GET /imports/{id} as Excel) ---


def test_csv_api_5_import_job_status(client: TestClient, db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    content = _write_minimal_csv(rows=[_row5_cells()])
    upload = _upload_csv(client, content=content, plant_id=plant.id)
    assert upload.status_code == 200
    import_id = upload.json()["import_job_id"]

    response = client.get(f"/api/v1/imports/{import_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == import_id
    assert body["source_type"] == "csv"
    assert body["status"] == "committed"
    assert body["total_rows"] == 1
    assert body["success_count"] == 1
    assert body["error_count"] == 0


# --- 6: import rows retrieval (same GET /imports/{id}/rows as Excel) ---


def test_csv_api_6_import_rows_paginated(client: TestClient, db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    _seed_second_machine(db_session, masters)
    content = _write_minimal_csv(
        rows=[_row5_cells(machine="M001"), _row6_cells(machine="M002")]
    )
    upload = _upload_csv(client, content=content, plant_id=plant.id)
    import_id = upload.json()["import_job_id"]

    response = client.get(f"/api/v1/imports/{import_id}/rows")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2
    assert all(item["status"] == "success" for item in body["items"])


# --- 7: Excel route unaffected by CSV route existing ---


def test_csv_api_7_excel_route_still_works_unaffected(
    client: TestClient, db_session: Session
) -> None:
    """Sanity: adding /imports/dpr-oee/csv did not disturb /imports/dpr-oee."""
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]

    buf = io.BytesIO()
    _write_minimal_workbook(buf, rows=[_row5_cells()])
    response = client.post(
        "/api/v1/imports/dpr-oee",
        data={"plant_id": str(plant.id)},
        files={
            "file": (
                "dpr_oee.xlsx",
                buf.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "committed"
    assert body["success_count"] == 1

    job = db_session.get(ImportJob, UUID(body["import_job_id"]))
    assert job is not None
    assert job.source_type == "excel"
