"""Builds the customer proposal PDF from the recalculated comparison (HTML template -> WeasyPrint)."""

import re
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.exceptions import AppError
from app.schemas.api import PartnerInput
from app.schemas.comparison import ComparisonResult, GroupTotal
from app.schemas.invoice import InvoiceData, ServiceLevel
from app.services.pricing.comparison import compare_invoice
from app.services.pricing.rate_card import RATES, SERVICE_LABELS, ZONE_IDS
from app.services.proposal.terms import SERVICE_DESCRIPTIONS, commercial_conditions
from app.utils.formatting import format_date, format_money, format_money_exact, format_percent

_HERE = Path(__file__).parent
_ASSETS = _HERE.parent.parent / "assets"

_env = Environment(
    loader=FileSystemLoader(_HERE / "templates"),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)
_env.filters.update(
    money=format_money, money_exact=format_money_exact, percent=format_percent, date=format_date
)


@dataclass(frozen=True)
class ProposalPdf:
    content: bytes
    reference: str


def _transit_range(service: ServiceLevel) -> str:
    """'Next day in the UAE, 1–4 days international', built from the rate card's transit times."""
    domestic = RATES["Z1"][service].transit_time
    days = [
        int(number)
        for zone in ZONE_IDS
        if zone != "Z1"
        for number in re.findall(r"\d+", RATES[zone][service].transit_time)
    ]
    return f"{domestic} in the UAE, {min(days)}–{max(days)} days international"


def _service_rows(groups: list[GroupTotal]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for group in groups:
        service: ServiceLevel = "express" if group.key == "express" else "economy"
        rows.append(
            {
                "group": group,
                "title": SERVICE_LABELS[service],
                "description": f"{SERVICE_DESCRIPTIONS[service]} {_transit_range(service)}.",
            }
        )
    return rows


def make_reference(invoice: InvoiceData, today: date) -> str:
    invoice_part = re.sub(r"[^A-Za-z0-9]", "", invoice.invoice_number or "INV")[-6:] or "INV"
    return f"BCOM-P-{today:%Y%m%d}-{invoice_part}"


def render_proposal_html(
    invoice: InvoiceData, partner: PartnerInput, comparison: ComparisonResult, today: date
) -> tuple[str, str]:
    summary = comparison.summary
    valid_until = today + timedelta(days=partner.validity_days)
    reference = make_reference(invoice, today)
    reasons = Counter(
        row.reason or "Not compared" for row in comparison.rows if row.status != "compared"
    )
    period_text = (
        f"{format_date(invoice.period_start)} to {format_date(invoice.period_end)}"
        if invoice.period_start and invoice.period_end
        else "the period on the invoice"
    )
    html = _env.get_template("proposal.html").render(
        invoice=invoice,
        partner=partner,
        summary=summary,
        reference=reference,
        issued_on=today.isoformat(),
        valid_until=valid_until.isoformat(),
        period_text=period_text,
        service_rows=_service_rows(summary.by_service),
        not_compared=[f"{count} x {reason}" for reason, count in reasons.items()],
        conditions=commercial_conditions(format_date(valid_until.isoformat())),
    )
    return html, reference


def render_proposal_pdf(
    invoice: InvoiceData, partner: PartnerInput, today: date | None = None
) -> ProposalPdf:
    """Recalculates the comparison (never trusting numbers from the browser) and renders the PDF."""
    comparison = compare_invoice(invoice)
    if comparison.summary.compared_shipments == 0:
        raise AppError(
            "No shipments could be compared, so there is nothing to propose yet.",
            status_code=422,
            code="nothing_to_propose",
        )
    if not comparison.summary.has_saving:
        raise AppError(
            "BCOM is not cheaper than the current courier for these shipments, so there is no saving to propose.",
            status_code=422,
            code="no_saving",
        )

    # Imported here: WeasyPrint loads native libraries, which the rest of the API does not need.
    from weasyprint import HTML

    html, reference = render_proposal_html(
        invoice, partner, comparison, today or datetime.now(UTC).date()
    )
    content = HTML(string=html, base_url=str(_ASSETS)).write_pdf()
    return ProposalPdf(content=content, reference=reference)
