"""How accurately does the active invoice reader read the sample invoices?

    make eval                      # uses AI_PROVIDER etc. from .env
    AI_PROVIDER=gemini make eval   # or override for one run

Reads every file in tests/fixtures/samples with the configured provider, matches each shipment to the
expected one by waybill number, and reports per file and per field how many values were read exactly.
Writes the same report to eval-report.md. Needs an API key for gemini/openai; the mock reader only
reads the two SwiftLine PDFs (the rest show as "not read").
"""

import asyncio
import json
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.clients.ai.factory import get_ai_provider  # noqa: E402
from app.core.exceptions import AppError  # noqa: E402
from app.schemas.invoice import InvoiceData, Shipment  # noqa: E402
from app.services.invoice.normalize import normalize_invoice  # noqa: E402
from app.services.invoice.upload import InvoiceFile, detect_mime_type  # noqa: E402

SAMPLES = ROOT / "tests" / "fixtures" / "samples"
EXPECTED = ROOT / "tests" / "fixtures" / "expected_samples.json"
REPORT = ROOT / "eval-report.md"

# Fields compared on every shipment: (label, our field, expected field).
FIELDS = [
    ("date", "date", "date"),
    ("origin", "origin_country", "origin_country"),
    ("destination", "destination_country", "destination_country"),
    ("weight", "weight_kg", "weight_kg"),
    ("service", "service", "service"),
    ("charge", "charge", "amount"),
]
HEADER = [
    ("period start", "period_start"),
    ("period end", "period_end"),
    ("invoice number", "invoice_number"),
]


def waybill_key(value: str | None) -> str:
    return re.sub(r"\s+", "", value or "").upper()


def expected_for(file_name: str, expected: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    """Photo and scan files share their PDF's expected values (sample-2-gulf-spice-photo.jpg -> sample-2-gulf-spice)."""
    stem = Path(file_name).stem
    for candidate in sorted(expected, key=len, reverse=True):
        if stem == candidate or stem.startswith(candidate + "-"):
            return expected[candidate]
    return None


def same(field_name: str, ours: Any, theirs: Any) -> bool:
    if field_name in ("weight_kg", "charge"):
        if ours is None or theirs is None:
            # A value printed as a dash is expected to be read as missing.
            return ours is None and theirs is None
        return abs(float(ours) - float(theirs)) < 0.005
    return bool(ours == theirs)


@dataclass
class FileResult:
    name: str
    seconds: float = 0
    error: str | None = None
    expected_rows: int = 0
    found_rows: int = 0
    extra_rows: int = 0
    field_hits: dict[str, int] = field(default_factory=dict)
    header_hits: int = 0

    @property
    def values_total(self) -> int:
        return self.expected_rows * len(FIELDS)

    @property
    def values_right(self) -> int:
        return sum(self.field_hits.values())


def score(invoice: InvoiceData, expected: dict[str, Any], result: FileResult) -> None:
    by_waybill: dict[str, Shipment] = {waybill_key(s.reference): s for s in invoice.shipments}
    result.expected_rows = len(expected["rows"])
    result.field_hits = {label: 0 for label, _, _ in FIELDS}
    matched = 0
    for row in expected["rows"]:
        shipment = by_waybill.get(waybill_key(row["awb"]))
        if shipment is None:
            continue
        matched += 1
        for label, ours, theirs in FIELDS:
            if same(ours, getattr(shipment, ours), row[theirs]):
                result.field_hits[label] += 1
    result.found_rows = matched
    result.extra_rows = max(0, len(invoice.shipments) - matched)
    result.header_hits = sum(1 for _, name in HEADER if getattr(invoice, name) == expected[name])


async def evaluate() -> list[FileResult]:
    expected = {item["file_stem"]: item for item in json.loads(EXPECTED.read_text())}
    provider = get_ai_provider()
    results: list[FileResult] = []
    for path in sorted(SAMPLES.iterdir()):
        data = path.read_bytes()
        mime = detect_mime_type(data)
        target = expected_for(path.name, expected)
        result = FileResult(name=path.name)
        results.append(result)
        if mime is None or target is None:
            result.error = "no expected values for this file"
            continue
        started = time.perf_counter()
        try:
            raw = await provider.extract_invoice(
                InvoiceFile(data=data, mime_type=mime, file_name=path.name)
            )
            score(normalize_invoice(raw), target, result)
        except AppError as error:
            result.error = f"not read: {error.code}"
            result.expected_rows = len(target["rows"])
        result.seconds = time.perf_counter() - started
        print(
            f"  {path.name}: {result.error or f'{result.values_right}/{result.values_total} values'}",
            file=sys.stderr,
        )
    return results


def pct(part: int, whole: int) -> str:
    if not whole:
        return "–"
    value = part / whole * 100
    # Never round a near miss up to a perfect score.
    return "100%" if part == whole else f"{min(value, 99.9):.1f}%"


def render(results: list[FileResult]) -> str:
    provider = get_ai_provider().info
    lines = [
        "# Invoice reading accuracy",
        "",
        f"Provider: **{provider.label}**"
        + (f" · model `{provider.model}`" if provider.model else ""),
        "",
        "| File | Rows found | Values exact | Header | Extra rows | Time |",
        "|---|---|---|---|---|---|",
    ]
    for r in results:
        if r.error:
            lines.append(f"| {r.name} | {r.error} | – | – | – | {r.seconds:.1f} s |")
            continue
        lines.append(
            f"| {r.name} | {r.found_rows}/{r.expected_rows} | {pct(r.values_right, r.values_total)} "
            f"| {r.header_hits}/{len(HEADER)} | {r.extra_rows} | {r.seconds:.1f} s |"
        )
    read = [r for r in results if not r.error]
    lines += ["", "## By field (files that were read)", "", "| Field | Exact |", "|---|---|"]
    for label, _, _ in FIELDS:
        hits = sum(r.field_hits.get(label, 0) for r in read)
        total = sum(r.expected_rows for r in read)
        lines.append(f"| {label} | {pct(hits, total)} ({hits}/{total}) |")
    overall_right = sum(r.values_right for r in read)
    overall_total = sum(r.values_total for r in read)
    lines += [
        "",
        f"**Overall: {pct(overall_right, overall_total)} of values exact** across {len(read)} of {len(results)} files.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    results = asyncio.run(evaluate())
    report = render(results)
    REPORT.write_text(report)
    print(report)


if __name__ == "__main__":
    main()
