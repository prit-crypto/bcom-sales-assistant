"""Remembers recent readings so the same file uploaded again doesn't call the AI (and cost money) twice.

Keyed by the file's SHA-256 plus the provider and model, so switching models reads again. In memory,
least-recently-used, with a time limit. Only the cleaned invoice data is kept, never the file itself.
"""

import hashlib
import threading
import time
from collections import OrderedDict

from app.schemas.invoice import InvoiceData


class ExtractionCache:
    def __init__(self) -> None:
        self._items: OrderedDict[str, tuple[float, InvoiceData]] = OrderedDict()
        self._lock = threading.Lock()

    @staticmethod
    def key(data: bytes, provider_id: str, model: str | None) -> str:
        return f"{provider_id}:{model or '-'}:{hashlib.sha256(data).hexdigest()}"

    def get(self, key: str, ttl_seconds: int) -> InvoiceData | None:
        with self._lock:
            item = self._items.get(key)
            if item is None:
                return None
            stored_at, invoice = item
            if ttl_seconds and time.monotonic() - stored_at > ttl_seconds:
                del self._items[key]
                return None
            self._items.move_to_end(key)
            # A copy, so a caller can never change what is stored.
            return invoice.model_copy(deep=True)

    def put(self, key: str, invoice: InvoiceData, max_items: int) -> None:
        if max_items <= 0:
            return
        with self._lock:
            self._items[key] = (time.monotonic(), invoice.model_copy(deep=True))
            self._items.move_to_end(key)
            while len(self._items) > max_items:
                self._items.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


extraction_cache = ExtractionCache()
