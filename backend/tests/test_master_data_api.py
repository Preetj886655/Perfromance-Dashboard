from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import get_db, get_engine
from app.main import app
from app.models.department import Department
from app.models.line import Line
from app.models.machine import Machine
from app.models.machine_status import MachineStatus
from app.models.machine_type import MachineType
from app.models.operator import Operator
from app.models.part import Part
from app.models.plant import Plant
from app.models.shift import Shift
from tests.auth_helpers import make_auth_headers


@pytest.fixture
def db_session() -> Session:
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


def _seed_master_data(session: Session) -> dict[str, object]:
    inactive_plant = Plant(
        code="PLT-INV",
        name="Inactive Plant",
        timezone="Asia/Kolkata",
        is_active=False,
    )
    active_plant = Plant(
        code="PLT-ACT",
        name="Active Plant",
        timezone="Asia/Kolkata",
        is_active=True,
    )
    session.add_all([inactive_plant, active_plant])
    session.flush()

    line_a = Line(plant_id=active_plant.id, code="LN-A", name="Line A")
    line_b = Line(plant_id=inactive_plant.id, code="LN-B", name="Line B")
    session.add_all([line_a, line_b])
    session.flush()

    mtype = MachineType(code="MT-01", name="Press", is_active=True)
    active_status = MachineStatus(code="MS-ACT", name="Active", is_active=True)
    inactive_status = MachineStatus(code="MS-INV", name="Idle", is_active=False)
    session.add_all([mtype, active_status, inactive_status])
    session.flush()

    machine_active = Machine(
        plant_id=active_plant.id,
        line_id=line_a.id,
        code="M-001",
        name="Machine One",
        machine_type_id=mtype.id,
        status_id=active_status.id,
    )
    machine_inactive = Machine(
        plant_id=active_plant.id,
        line_id=line_a.id,
        code="M-002",
        name="Machine Two",
        machine_type_id=mtype.id,
        status_id=inactive_status.id,
    )
    session.add_all([machine_active, machine_inactive])
    session.flush()

    part = Part(code="PT-001", name="Part A")
    session.add(part)
    session.flush()

    shift = Shift(
        plant_id=active_plant.id,
        code="S1",
        name="Shift 1",
        start_time="06:00:00",
        end_time="14:00:00",
        crosses_midnight=False,
    )
    session.add(shift)
    session.flush()

    dept = Department(code="ENG", name="Engineering")
    session.add(dept)
    session.flush()

    operator = Operator(employee_code="EMP-001", name="Operator One", department_id=dept.id)
    session.add(operator)
    session.flush()

    return {
        "active_plant": active_plant,
        "inactive_plant": inactive_plant,
        "line_a": line_a,
        "line_b": line_b,
        "machine_active": machine_active,
        "machine_inactive": machine_inactive,
        "part": part,
        "shift": shift,
        "operator": operator,
        "department": dept,
    }


def test_master_data_plants_and_inactive_state(client: TestClient, db_session: Session) -> None:
    _seed_master_data(db_session)

    response = client.get("/api/v1/plants")
    assert response.status_code == 200, response.text
    body = response.json()
    ids = {item["id"] for item in body["items"]}
    assert len(ids) >= 2
    plant_map = {item["code"]: item for item in body["items"]}
    assert plant_map["PLT-ACT"]["is_active"] is True
    assert plant_map["PLT-INV"]["is_active"] is False


def test_master_data_lines_filtered_by_plant(client: TestClient, db_session: Session) -> None:
    data = _seed_master_data(db_session)
    active_plant_id = str(data["active_plant"].id)

    response = client.get("/api/v1/lines", params={"plant_id": active_plant_id})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["count"] == 1
    assert body["items"][0]["plant_id"] == active_plant_id
    assert body["items"][0]["code"] == "LN-A"

    bad = client.get("/api/v1/lines", params={"plant_id": str(uuid.uuid4())})
    assert bad.status_code == 404


def test_master_data_machines_filtered_by_line(client: TestClient, db_session: Session) -> None:
    data = _seed_master_data(db_session)
    line_id = str(data["line_a"].id)

    response = client.get("/api/v1/machines", params={"line_id": line_id})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["count"] == 2
    codes = {item["code"] for item in body["items"]}
    assert codes == {"M-001", "M-002"}
    status_map = {item["code"]: item for item in body["items"]}
    assert status_map["M-001"]["status_is_active"] is True
    assert status_map["M-002"]["status_is_active"] is False

    bad = client.get("/api/v1/machines", params={"line_id": str(uuid.uuid4())})
    assert bad.status_code == 404


def test_master_data_parts_shifts_operators(client: TestClient, db_session: Session) -> None:
    _seed_master_data(db_session)

    parts = client.get("/api/v1/parts")
    assert parts.status_code == 200, parts.text
    part_codes = {item["code"] for item in parts.json()["items"]}
    assert "PT-001" in part_codes

    shifts = client.get("/api/v1/shifts")
    assert shifts.status_code == 200, shifts.text
    shift_codes = {item["code"] for item in shifts.json()["items"]}
    assert "S1" in shift_codes

    operators = client.get("/api/v1/operators")
    assert operators.status_code == 200, operators.text
    op_names = {item["name"] for item in operators.json()["items"]}
    assert "Operator One" in op_names


def test_master_data_endpoint_404_for_unknown_plant_or_line(client: TestClient, db_session: Session) -> None:
    _seed_master_data(db_session)
    assert client.get("/api/v1/plants").status_code == 200
    assert client.get("/api/v1/lines", params={"plant_id": str(uuid.uuid4())}).status_code == 404
    assert client.get("/api/v1/machines", params={"line_id": str(uuid.uuid4())}).status_code == 404
