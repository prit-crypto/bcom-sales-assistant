"""WhatsApp message facts and the fixed template used by the mock provider (and as a fallback)."""

from app.clients.ai.base import SalesMessageFacts
from app.schemas.api import PartnerInput
from app.schemas.comparison import ComparisonSummary
from app.services.proposal.i18n import lane_text, volume_change
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
    economy = summary.scenario.economy_for_non_urgent
    like_for_like = summary.like_for_like_monthly_saving if economy else summary.monthly_saving
    return SalesMessageFacts(
        prospect_name=partner.prospect_name,
        partner_name=partner.partner_name,
        partner_company=partner.partner_company,
        monthly_saving=format_money(like_for_like),
        yearly_saving=format_money(like_for_like * 12),
        saving_percent=format_percent(summary.saving_pct),
        compared_shipments=summary.compared_shipments,
        total_shipments=summary.total_shipments,
        proposal_validity_days=partner.validity_days,
        top_saving_routes=[lane_text(lane.label, partner.language) for lane in top_routes],
        language=partner.language,
        booking_url=partner.booking_url,
        economy_monthly_saving=format_money(summary.monthly_saving) if economy else None,
        volume_change=volume_change(summary) if summary.scenario.volume_factor != 1 else "",
    )


def render_template_message(facts: SalesMessageFacts) -> str:
    """Fixed message used without AI (and as the fallback). Arabic is for review by a native speaker."""
    return _arabic_message(facts) if facts.language == "ar" else _english_message(facts)


def _english_message(facts: SalesMessageFacts) -> str:
    routes = (
        f"\n\nYour biggest savings are on {', '.join(facts.top_saving_routes)}."
        if facts.top_saving_routes
        else ""
    )
    volume = f" with {facts.volume_change} monthly volume" if facts.volume_change else ""
    saving = (
        f"you could save around {facts.monthly_saving} every month on the same services, or around "
        f"{facts.economy_monthly_saving} if non-urgent parcels go Economy (slower delivery)"
        if facts.economy_monthly_saving
        else f"you could save around {facts.monthly_saving} every month (about {facts.yearly_saving} a year, "
        f"{facts.saving_percent} less) on the same express and economy services"
    )
    booking = f"\nYou can book a time here: {facts.booking_url}" if facts.booking_url else ""
    return "\n".join(
        [
            f"Hello {facts.prospect_name} team 👋",
            "",
            f"Thank you for sharing your recent courier invoice. I compared {facts.compared_shipments} of your {facts.total_shipments} shipments with BCOM Global rates.",
            "",
            f"Based on last month's shipments{volume}, {saving}.{routes}",
            "",
            f"I've attached the full proposal. These rates are valid for {facts.proposal_validity_days} days. Could we have a quick 15-minute call this week to get you set up?{booking}",
            "",
            facts.partner_name,
            f"{facts.partner_company} – BCOM Global partner",
        ]
    )


def _arabic_message(facts: SalesMessageFacts) -> str:
    routes = (
        f"\n\nأكبر توفير لديكم على المسارات التالية: {'، '.join(facts.top_saving_routes)}."
        if facts.top_saving_routes
        else ""
    )
    volume = f" مع تغيّر حجم الشحن بنسبة {facts.volume_change}" if facts.volume_change else ""
    saving = (
        f"يمكنكم توفير حوالي {facts.monthly_saving} شهرياً مع نفس الخدمات، أو حوالي "
        f"{facts.economy_monthly_saving} عند شحن الطرود غير العاجلة بالخدمة الاقتصادية (توصيل أبطأ)"
        if facts.economy_monthly_saving
        else f"يمكنكم توفير حوالي {facts.monthly_saving} شهرياً (حوالي {facts.yearly_saving} سنوياً، أي أقل بنسبة "
        f"{facts.saving_percent}) على نفس خدمات الشحن السريع والاقتصادي"
    )
    booking = f"\nيمكنكم حجز موعد من هنا: {facts.booking_url}" if facts.booking_url else ""
    return "\n".join(
        [
            f"مرحباً فريق {facts.prospect_name} 👋",
            "",
            f"شكراً لمشاركتنا فاتورة الشحن الأخيرة. قارنتُ {facts.compared_shipments} من أصل {facts.total_shipments} شحنة لديكم مع أسعار BCOM Global.",
            "",
            f"استناداً إلى شحنات الشهر الماضي{volume}، {saving}.{routes}",
            "",
            f"أرفقتُ العرض الكامل، وهذه الأسعار صالحة لمدة {facts.proposal_validity_days} يوماً. هل يمكننا ترتيب مكالمة قصيرة مدتها 15 دقيقة هذا الأسبوع للبدء؟{booking}",
            "",
            facts.partner_name,
            f"{facts.partner_company} – شريك BCOM Global",
        ]
    )
