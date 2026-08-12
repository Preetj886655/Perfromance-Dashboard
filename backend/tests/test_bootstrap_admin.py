from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.db.bootstrap_admin import ensure_local_super_admin


@patch("app.db.bootstrap_admin.seed_role_catalog")
def test_ensure_local_super_admin_creates_when_missing(_mock_seed) -> None:
    db = MagicMock()
    role = SimpleNamespace(id="role-1", code="SUPER_ADMIN")
    db.scalar.side_effect = [role, None, None, None]

    created = ensure_local_super_admin(
        db,
        email="admin@example.com",
        employee_code="ADM001",
        password="StrongPass123",
    )

    assert created is True
    assert db.add.called is True
    assert db.flush.called is True


@patch("app.db.bootstrap_admin.seed_role_catalog")
def test_ensure_local_super_admin_skips_if_already_present(_mock_seed) -> None:
    db = MagicMock()
    role = SimpleNamespace(id="role-1", code="SUPER_ADMIN")
    existing_user = SimpleNamespace(id="user-1")
    db.scalar.side_effect = [role, existing_user]

    created = ensure_local_super_admin(
        db,
        email="admin@example.com",
        employee_code="ADM001",
        password="StrongPass123",
    )

    assert created is False
    assert db.add.called is False
