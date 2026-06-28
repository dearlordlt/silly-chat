"""Per-user sliding-window rate limit (in-memory, single-process).

Adequate for family scale. For multi-worker/multi-host, swap the store for Redis.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def allow(key: str, per_minute: int) -> bool:
    """Record a hit and return False if the key exceeded per_minute in the last 60s."""
    now = time.monotonic()
    cutoff = now - 60.0
    with _lock:
        dq = _hits[key]
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= per_minute:
            return False
        dq.append(now)
        return True
