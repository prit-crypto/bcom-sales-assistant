"""Learning from partners' corrections: what changed between the first reading and the reviewed invoice,
a report for the team, and short hints for the AI's next reads."""

import uuid
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from app.models.correction import ReadingCorrection
from app.repositories.correction import CorrectionRepository
from app.schemas.insights import CorrectionGroup, ReaderTotal, ReadingReport
from app.schemas.invoice import EDITABLE_FIELDS, InvoiceData

# Readers whose corrections teach the AI nothing (no AI involved).
NOT_AI = ("mock", "spreadsheet")
HINT_MIN_COUNT = 3
HINT_DAYS = 90
MAX_HINTS = 8

FIELD_LABEL = {
    "date": "date",
    "reference": "waybill number",
    "origin_city": "origin city",
    "origin_country": "origin country",
    "destination_city": "destination city",
    "destination_country": "destination country",
    "weight_kg": "weight",
    "pieces": "number of pieces",
    "service": "service (Express or Economy)",
    "charge": "charge",
}


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def differences(
    original: InvoiceData, current: InvoiceData
) -> list[tuple[str, str, str | None, str | None]]:
    """(shipment id, field, before, after) for every value the partner changed. Rows the partner added or
    removed, and the include/leave-out tick, are not reading corrections."""
    before_by_id = {s.id: s for s in original.shipments}
    changes: list[tuple[str, str, str | None, str | None]] = []
    for shipment in current.shipments:
        first = before_by_id.get(shipment.id)
        if first is None:
            continue
        for field in EDITABLE_FIELDS:
            old, new = getattr(first, field), getattr(shipment, field)
            if old != new:
                changes.append((shipment.id, field, _text(old), _text(new)))
    return changes


async def record_corrections(
    repo: CorrectionRepository,
    proposal_id: uuid.UUID,
    original: InvoiceData,
    current: InvoiceData,
    reader: dict[str, Any],
) -> int:
    """Replaces this proposal's corrections with the current differences (undoing a fix removes it)."""
    rows = [
        ReadingCorrection(
            proposal_id=proposal_id,
            provider=str(reader.get("provider") or "unknown")[:20],
            model=(str(reader["model"])[:80] if reader.get("model") else None),
            courier=(original.carrier_name or None),
            shipment_id=shipment_id,
            field=field,
            before=before,
            after=after,
        )
        for shipment_id, field, before, after in differences(original, current)
    ]
    await repo.replace_for(proposal_id, rows)
    return len(rows)


def _example(before: str | None, after: str | None) -> str:
    return f"{before or 'empty'} → {after or 'empty'}"


async def reading_hints(repo: CorrectionRepository, now: datetime | None = None) -> tuple[str, ...]:
    """Up to 8 lessons from the most frequent AI-reading corrections of the last 90 days."""
    moment = (now or datetime.now(UTC)) - timedelta(days=HINT_DAYS)
    rows = [r for r in await repo.since(moment) if r.provider not in NOT_AI]
    groups: dict[tuple[str | None, str], list[ReadingCorrection]] = defaultdict(list)
    for row in rows:
        groups[(row.courier, row.field)].append(row)
    ranked = sorted(
        ((key, items) for key, items in groups.items() if len(items) >= HINT_MIN_COUNT),
        key=lambda pair: len(pair[1]),
        reverse=True,
    )[:MAX_HINTS]
    hints = []
    for (courier, field), items in ranked:
        where = f"on {courier} invoices" if courier else "on invoices"
        common = Counter((r.before, r.after) for r in items).most_common(1)[0][0]
        hints.append(
            f"Partners often corrected the {FIELD_LABEL.get(field, field)} {where} ({len(items)} times), "
            f"e.g. {_example(*common)}."
        )
    return tuple(hints)


async def reading_report(repo: CorrectionRepository) -> ReadingReport:
    totals = await repo.reading_totals()
    rows = await repo.since(datetime(2000, 1, 1, tzinfo=UTC))
    groups: dict[tuple[str, str | None, str | None, str], list[ReadingCorrection]] = defaultdict(
        list
    )
    per_reader: Counter[tuple[str, str | None]] = Counter()
    for row in rows:
        groups[(row.provider, row.model, row.courier, row.field)].append(row)
        per_reader[(row.provider, row.model)] += 1
    readers = [
        ReaderTotal(
            provider=provider,
            model=model,
            readings=readings,
            shipments=shipments,
            corrections=per_reader[(provider, model)],
            corrections_per_100_shipments=round(per_reader[(provider, model)] * 100 / shipments, 1)
            if shipments
            else 0,
        )
        for provider, model, readings, shipments in totals
    ]
    top = sorted(groups.items(), key=lambda pair: len(pair[1]), reverse=True)[:20]
    return ReadingReport(
        readers=sorted(readers, key=lambda r: r.readings, reverse=True),
        most_corrected=[
            CorrectionGroup(
                provider=provider,
                model=model,
                courier=courier,
                field=field,
                count=len(items),
                examples=[_example(r.before, r.after) for r in items[:3]],
            )
            for (provider, model, courier, field), items in top
        ],
        hints=list(await reading_hints(repo)),
    )
