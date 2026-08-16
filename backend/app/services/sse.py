from __future__ import annotations

import json
import threading
from collections import deque
from typing import Any

_STREAM_LOCK = threading.Lock()
_STREAM_QUEUE_MAP: dict[int, deque[str]] = {}


def register_sse_queue() -> tuple[int, deque[str]]:
    """Register a new SSE client queue; return (queue_key, queue).

    The queue_key is used for later unregistration. Deques are unhashable,
    so we use id(queue) as the dict key instead of storing in a set.
    """
    queue: deque[str] = deque()
    key = id(queue)
    with _STREAM_LOCK:
        _STREAM_QUEUE_MAP[key] = queue
    return key, queue


def unregister_sse_queue(queue_key: int) -> None:
    """Unregister an SSE client queue by its key."""
    with _STREAM_LOCK:
        _STREAM_QUEUE_MAP.pop(queue_key, None)


def emit_oee_updated(payload: dict[str, Any]) -> None:
    """Broadcast oee_updated event to all registered SSE queues.

    Thread-safe. Removes stale entries (empty/disconnected queues).
    """
    event = "event: oee_updated\ndata: " + json.dumps(payload, separators=(",", ":")) + "\n\n"
    with _STREAM_LOCK:
        stale: list[int] = []
        for key, queue in list(_STREAM_QUEUE_MAP.items()):
            try:
                queue.append(event)
            except Exception:
                stale.append(key)
        for key in stale:
            _STREAM_QUEUE_MAP.pop(key, None)


__all__ = [
    "emit_oee_updated",
    "register_sse_queue",
    "unregister_sse_queue",
]
