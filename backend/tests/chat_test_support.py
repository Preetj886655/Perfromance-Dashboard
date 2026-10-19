"""Local source rows for chat tests; these fixtures never call a live provider."""

from __future__ import annotations

from typing import Any

from app.services import chat_analytics_tools


def manufacturing_records() -> list[dict[str, Any]]:
    return [
        {
            "date": "2026-10-09",
            "line": "LINE-1",
            "shift": "Day",
            "part": "MK5",
            "stage": "Clip",
            "machine": "M-1",
            "totalProduction": 500,
            "productionTarget": 1000,
            "rejection": 10,
            "downtimeMinutes": 60,
            "productionLoss": 25,
            "downtimeType": "Mechanical",
        },
        {
            "date": "2026-10-09",
            "line": "LINE-2",
            "shift": "Night",
            "part": "MK3",
            "stage": "Clamp",
            "machine": "M-2",
            "totalProduction": 600,
            "productionTarget": 800,
            "rejection": 8,
            "downtimeMinutes": 30,
            "productionLoss": 10,
            "downtimeType": "Material Change",
        },
        {
            "date": "2026-10-11",
            "line": "LINE-1",
            "shift": "Night",
            "part": "MK5",
            "stage": "Clip",
            "machine": "M-1",
            "totalProduction": 700,
            "productionTarget": 900,
            "rejection": 9,
            "downtimeMinutes": 45,
            "productionLoss": 15,
            "downtimeType": "Mechanical",
        },
        {
            "date": "2026-10-13",
            "line": "LINE-2",
            "shift": "Day",
            "part": "MK3",
            "stage": "Clamp",
            "machine": "M-2",
            "totalProduction": 400,
            "productionTarget": 600,
            "rejection": 6,
            "downtimeMinutes": 20,
            "productionLoss": 5,
            "downtimeType": "Electrical",
        },
        {
            "date": "2026-10-05",
            "line": "LINE-1",
            "shift": "Day",
            "part": "MK3",
            "stage": "Clip",
            "machine": "M-1",
            "totalProduction": 300,
            "productionTarget": 500,
            "rejection": 3,
            "downtimeMinutes": 90,
            "productionLoss": 30,
            "downtimeType": "Mechanical",
        },
    ]


def maintenance_records() -> list[dict[str, Any]]:
    return [
        {
            "date": "2026-10-09",
            "machine": "M-1",
            "shift": "Day",
            "breakdownType": "Mechanical",
            "downtimeMinutes": 120,
            "description": "Bearing replacement",
            "rootCause": "Bearing wear",
            "correctiveAction": "Replaced bearing",
            "attendedBy": "Maintenance team",
        },
        {
            "date": "2026-09-15",
            "machine": "M-2",
            "shift": "Night",
            "breakdownType": "Electrical",
            "downtimeMinutes": 60,
            "description": "Sensor fault",
            "rootCause": "Sensor wiring fault",
            "correctiveAction": "Repaired wiring",
            "attendedBy": "Maintenance team",
        },
    ]


def install_mock_chat_sources(monkeypatch) -> None:
    monkeypatch.setattr(
        chat_analytics_tools, "get_raw_manufacturing_records", manufacturing_records
    )
    monkeypatch.setattr(
        chat_analytics_tools, "get_raw_maintenance_records", maintenance_records
    )
