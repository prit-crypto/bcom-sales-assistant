"""WhatsApp message facts and the fixed template used by the mock provider (and as a fallback)."""

from app.clients.ai.base import SalesMessageFacts
from app.schemas.api import PartnerInput
from app.schemas.comparison import ComparisonSummary
from app.utils.formatting import format_money, format_percent


def build_sales_message_facts(
    summary: ComparisonSummary, partner: PartnerInput
) -> SalesMessageFacts:
    """Builds the only facts a WhatsApp message may use (all numbers come from the calculator)."""
    top_routes = sorted(
        (lane for lane in summary.top_lanes if lane.saving > 0),
        key=lambda lane: lane.saving,
        reverse=True,
    )[:3]
    return SalesMessageFacts(
        prospect_name=partner.prospect_name,
        partner_name=partner.partner_name,
        partner_company=partner.partner_company,
        monthly_saving=format_money(summary.monthly_saving),
        yearly_saving=format_money(summary.yearly_saving),
        saving_percent=format_percent(summary.saving_pct),
        compared_shipments=summary.compared_shipments,
        total_shipments=summary.total_shipments,
        proposal_validity_days=partner.validity_days,
        top_saving_routes=[lane.label for lane in top_routes],
    )


def render_template_message(facts: SalesMessageFacts) -> str:
    routes = (
        f"\n\nYour biggest savings are on {', '.join(facts.top_saving_routes)}."
        if facts.top_saving_routes
        else ""
    )
    return "\n".join(
        [
            f"Hello {facts.prospect_name} team 👋",
            "",
            f"Thank you for sharing your recent courier invoice. I compared {facts.compared_shipments} of your {facts.total_shipments} shipments with BCOM Global rates.",
            "",
            f"Based on last month's shipments, you could save around {facts.monthly_saving} every month (about {facts.yearly_saving} a year, {facts.saving_percent} less) on the same express and economy services.{routes}",
            "",
            f"I've attached the full proposal. These rates are valid for {facts.proposal_validity_days} days. Could we have a quick 15-minute call this week to get you set up?",
            "",
            facts.partner_name,
            f"{facts.partner_company} – BCOM Global partner",
        ]
    )
