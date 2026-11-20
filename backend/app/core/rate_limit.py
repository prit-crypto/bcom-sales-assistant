"""A small per-client rate limit for the endpoints that cost money (they call the AI provider).

In memory, so it is per server process: right for this POC and a single instance. Swap the store for
Redis when the app runs on more than one instance (Phase 3).
"""

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import Request

from app.core.config import get_settings
from app.core.exceptions import AppError

WINDOW_SECONDS = 60.0


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, now: float | None = None) -> tuple[bool, int]:
        """Records a hit for `key`. Returns (allowed, seconds until the next hit is allowed)."""
        current = time.monotonic() if now is None else now
        with self._lock:
            hits = self._hits[key]
            while hits and current - hits[0] >= WINDOW_SECONDS:
                hits.popleft()
            if len(hits) >= limit:
                return False, max(1, int(WINDOW_SECONDS - (current - hits[0])) + 1)
            hits.append(current)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limited(scope: str) -> Callable[[Request], None]:
    """FastAPI dependency: `dependencies=[Depends(rate_limited("extract"))]`."""

    def check(request: Request) -> None:
        limit = get_settings().rate_limit_per_minute
        if limit <= 0:
            return
        allowed, retry_after = limiter.allow(f"{scope}:{client_key(request)}", limit)
        if not allowed:
            raise AppError(
                f"Too many requests. Please wait {retry_after} seconds and try again.",
                status_code=429,
                code="rate_limited",
            )

    return check
