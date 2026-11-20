"""How long reads usually take, per provider and model, for "usually about N seconds" on screen."""

import threading
from collections import defaultdict, deque

KEEP = 20


class ReadTimes:
    def __init__(self) -> None:
        self._times: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=KEEP))
        self._lock = threading.Lock()

    @staticmethod
    def key(provider_id: str, model: str | None) -> str:
        return f"{provider_id}:{model or '-'}"

    def record(self, key: str, seconds: float) -> None:
        with self._lock:
            self._times[key].append(seconds)

    def typical(self, key: str) -> float | None:
        """Average of the recent reads, rounded to whole seconds; None until there is one."""
        with self._lock:
            times = self._times.get(key)
            if not times:
                return None
            return float(max(1, round(sum(times) / len(times))))

    def clear(self) -> None:
        with self._lock:
            self._times.clear()


read_times = ReadTimes()
