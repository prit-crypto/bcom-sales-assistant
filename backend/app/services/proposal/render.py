"""Builds the customer proposal PDF from the recalculated comparison (HTML template -> WeasyPrint)."""

import re
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup

from app.core.exceptions import AppError
from app.schemas.api import PartnerInput
from app.schemas.comparison import ComparisonResult, GroupTotal, Scenario
from app.schemas.invoice import InvoiceData, ServiceLevel
from app.services.pricing.comparison import compare_invoice
from app.services.pricing.rate_card import RATES, SERVICE_LABELS, ZONE_IDS
from app.services.proposal.i18n import (
    LABELS,
    Language,
    assumptions,
    conditions,
    date_text,
    label,
    lane_text,
    reason_text,
    service_description,
    service_text,
    transit_text,
    volume_change,
    zone_text,
)
from app.utils.formatting import format_date, format_money, format_money_exact, format_percent

LATIN_FONT = "Helvetica, Arial, sans-serif"
# Arabic needs a font with Arabic letters: Noto (fonts-noto-core in the Docker image).
ARABIC_FONT = "'Noto Naskh Arabic', 'Noto Sans Arabic', 'DejaVu Sans', sans-serif"

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


def _transit_range(service: ServiceLevel, language: Language) -> str:
    """'Next day in the UAE, 1–4 days international', built from the rate card's transit times."""
    domestic = transit_text(RATES["Z1"][service].transit_time, language)
    days = [
        int(number)
        for zone in ZONE_IDS
        if zone != "Z1"
        for number in re.findall(r"\d+", RATES[zone][service].transit_time)
    ]
    if language == "ar":
        return f"{domestic} داخل الإمارات، {min(days)}–{max(days)} أيام للشحن الدولي"
    return f"{domestic} in the UAE, {min(days)}–{max(days)} days international"


def service_rows(groups: list[GroupTotal], language: Language) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for group in groups:
        service: ServiceLevel = "express" if group.key == "express" else "economy"
        rows.append(
            {
                "group": group,
                "title": service_text(service, language, SERVICE_LABELS[service]),
                "description": f"{service_description(service, language)} {_transit_range(service, language)}.",
            }
        )
    return rows


def relabel(groups: list[GroupTotal], language: Language, lanes: bool) -> list[GroupTotal]:
    return [
        group.model_copy(
            update={
                "label": lane_text(group.label, language)
                if lanes
                else zone_text(group.label, language)
            }
        )
        for group in groups
    ]


def _isolated(language: Language, key: str, **values: str) -> Markup:
    """A label with names wrapped in <bdi>, so Latin names keep their order inside Arabic text.
    Labels are our own text; the names are escaped by Markup.format."""
    template = Markup(LABELS[language][key])
    return template.format(
        **{name: Markup("<bdi>{}</bdi>").format(value) for name, value in values.items()}
    )


def make_reference(invoice: InvoiceData, today: date) -> str:
    invoice_part = re.sub(r"[^A-Za-z0-9]", "", invoice.invoice_number or "INV")[-6:] or "INV"
    return f"BCOM-P-{today:%Y%m%d}-{invoice_part}"


def render_proposal_html(
    invoice: InvoiceData,
    partner: PartnerInput,
    comparison: ComparisonResult,
    today: date,
    reference: str | None = None,
) -> tuple[str, str]:
    language: Language = partner.language
    labels = LABELS[language]
    summary = comparison.summary
    valid_until = (today + timedelta(days=partner.validity_days)).isoformat()
    reference = reference or make_reference(invoice, today)
    reasons = Counter(
        reason_text(row, language) for row in comparison.rows if row.status != "compared"
    )
    period = (
        label(
            language,
            "period_range",
            start=date_text(invoice.period_start, language),
            end=date_text(invoice.period_end, language),
        )
        if invoice.period_start and invoice.period_end
        else labels["period_fallback"]
    )
    sub = label(
        language,
        "sub",
        yearly=format_money(summary.yearly_saving),
        pct=format_percent(summary.saving_pct),
        compared=summary.compared_shipments,
        total=summary.total_shipments,
        period=period,
    )
    if summary.scenario.volume_factor != 1:
        sub += label(language, "volume_note", change=volume_change(summary))
    economy_line = (
        label(
            language,
            "economy_line",
            like=format_money(summary.like_for_like_monthly_saving),
            amount=format_money(summary.monthly_saving),
        )
        if summary.scenario.economy_for_non_urgent
        else None
    )
    headline_before, headline_after = labels["headline"].split("{amount}")
    html = _env.get_template("proposal.html").render(
        lang=language,
        dir="rtl" if language == "ar" else "ltr",
        # Markup: a fixed font list from this file, which must reach the CSS unescaped (quotes intact).
        font=Markup(ARABIC_FONT if language == "ar" else LATIN_FONT),
        L=labels,
        invoice=invoice,
        partner=partner,
        summary=summary,
        reference=reference,
        issued_on=date_text(today.isoformat(), language),
        valid_until=date_text(valid_until, language),
        based_on=_isolated(
            language,
            "based_on",
            number=invoice.invoice_number or labels["invoice_fallback"],
            carrier=invoice.carrier_name or labels["carrier_fallback"],
        ),
        partner_line=_isolated(language, "partner_line", company=partner.partner_company),
        footer=_isolated(
            language, "footer", name=partner.partner_name, company=partner.partner_company
        ),
        headline_before=headline_before,
        headline_after=headline_after,
        economy_line=economy_line,
        sub=sub,
        service_rows=service_rows(summary.by_service, language),
        zones=relabel(summary.by_zone, language, lanes=False),
        lanes=relabel(summary.top_lanes, language, lanes=True),
        tradeoffs=[
            {
                "zone": zone_text(t.zone_label, language),
                "shipments": t.shipments,
                "express": transit_text(t.express, language),
                "economy": transit_text(t.economy, language),
            }
            for t in summary.transit_tradeoffs
        ],
        not_compared=[f"{count} × {reason}" for reason, count in reasons.items()],
        conditions=conditions(valid_until, language),
        assumptions=assumptions(summary, invoice.currency is not None, language),
    )
    return html, reference


def render_proposal_pdf(
    invoice: InvoiceData,
    partner: PartnerInput,
    scenario: Scenario | None = None,
    today: date | None = None,
    reference: str | None = None,
) -> ProposalPdf:
    """Recalculates the comparison (never trusting numbers from the browser) and renders the PDF."""
    comparison = compare_invoice(invoice, scenario=scenario)
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
        invoice, partner, comparison, today or datetime.now(UTC).date(), reference
    )
    content = HTML(string=html, base_url=str(_ASSETS)).write_pdf()
    suffix = "-ar" if partner.language == "ar" else ""
    return ProposalPdf(content=content, reference=f"{reference}{suffix}")
