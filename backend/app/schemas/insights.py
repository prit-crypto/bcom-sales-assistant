"""The team's report on how well invoices are read (not a partner screen)."""

from app.schemas.base import ApiModel


class ReaderTotal(ApiModel):
    provider: str
    model: str | None
    # Saved proposals read by this reader, and the shipments in them as first read
    readings: int
    shipments: int
    corrections: int
    corrections_per_100_shipments: float


class CorrectionGroup(ApiModel):
    provider: str
    model: str | None
    courier: str | None
    field: str
    count: int
    examples: list[str]


class ReadingReport(ApiModel):
    readers: list[ReaderTotal]
    most_corrected: list[CorrectionGroup]
    # What the AI is told on its next reads
    hints: list[str]
