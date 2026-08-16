from __future__ import annotations

import json

from app.services.sse import emit_oee_updated, register_sse_queue, unregister_sse_queue


def test_dashboard_stream_emits_oee_updated_event() -> None:
    queue_key, queue = register_sse_queue()

    emit_oee_updated(
        {
            "type": "oee_updated",
            "scope_type": "plant",
            "scope_id": "11111111-1111-1111-1111-111111111111",
            "period_type": "day",
            "period_start": "2026-08-11",
        }
    )

    assert queue
    raw = queue.popleft()
    assert raw.startswith("event: oee_updated")
    assert "\"type\":\"oee_updated\"" in raw
    payload = json.loads(raw.split("data: ", 1)[1].split("\n\n", 1)[0])
    assert payload["type"] == "oee_updated"
    assert payload["scope_type"] == "plant"
    assert payload["scope_id"] == "11111111-1111-1111-1111-111111111111"

    unregister_sse_queue(queue_key)
