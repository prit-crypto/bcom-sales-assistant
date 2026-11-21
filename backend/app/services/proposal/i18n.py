"""Text for the proposal PDF in English and Arabic.

The Arabic was written for this tool and should be reviewed by a native speaker before real customers see it.
Numbers stay in Western digits with "AED", as is usual in UAE business documents; city names stay as printed.
English reuses the comparison's own sentences; Arabic builds the same sentences from the same figures.
"""

import re
from typing import Literal

from app.schemas.comparison import ComparisonSummary, ShipmentComparison
from app.services.pricing.rate_card import MAX_WEIGHT_KG
from app.services.proposal.terms import SERVICE_DESCRIPTIONS, commercial_conditions

Language = Literal["en", "ar"]

LABELS: dict[Language, dict[str, str]] = {
    "en": {
        "subtitle": "Shipping savings proposal",
        "ref": "Ref",
        "issued": "Issued",
        "valid_until": "Valid until",
        "prepared_for": "Prepared for",
        "prepared_by": "Prepared by",
        "based_on": "Based on invoice {number} from {carrier}",
        "invoice_fallback": "provided",
        "carrier_fallback": "your current courier",
        "partner_line": "{company}, BCOM Global partner",
        "in_partnership": "In partnership with",
        "book_call": "Book a call",
        "headline": "Save about {amount} every month",
        "economy_line": "{like} like for like, or {amount} when non-urgent parcels go Economy.",
        "sub": "About {yearly} a year, {pct} less than you pay today. Based on {compared} of the {total} shipments on your invoice for {period}.",
        "volume_note": " Assumes {change} monthly volume.",
        "period_range": "{start} to {end}",
        "period_fallback": "the period on the invoice",
        "kpi_today": "You pay today / month",
        "kpi_bcom": "With BCOM / month",
        "kpi_saving": "Monthly saving",
        "examples_title": "From your own invoice",
        "col_shipment": "Shipment",
        "kpi_compared": "Shipments compared",
        "recommended": "Recommended services",
        "by_region": "Cost comparison by region",
        "busiest": "Your busiest routes",
        "col_service": "Service",
        "col_region": "Region",
        "col_route": "Route",
        "col_shipments": "Shipments",
        "col_today": "Today",
        "col_bcom": "With BCOM",
        "col_saving": "Saving",
        "delivery": "Delivery times when non-urgent parcels go Economy",
        "col_express": "Express",
        "col_economy": "Economy",
        "not_included": "Shipments not included in the saving",
        "quote_separately": "We are happy to quote these separately.",
        "conditions": "Commercial conditions",
        "how": "How we calculated this",
        "footer": "BCOM Global · Prepared by {name}, {company}",
        "page": "Page",
        "of": "of",
    },
    "ar": {
        "subtitle": "عرض توفير تكاليف الشحن",
        "ref": "المرجع",
        "issued": "تاريخ الإصدار",
        "valid_until": "صالح حتى",
        "prepared_for": "مُعدّ لـ",
        "prepared_by": "مُعدّ من قِبل",
        "based_on": "استناداً إلى الفاتورة {number} من {carrier}",
        "invoice_fallback": "المقدَّمة",
        "carrier_fallback": "شركة الشحن الحالية",
        "partner_line": "{company}، شريك BCOM Global",
        "in_partnership": "بالشراكة مع",
        "book_call": "احجز مكالمة",
        "headline": "وفّر حوالي {amount} شهرياً",
        "economy_line": "{like} مع نفس الخدمات، أو {amount} عند شحن الطرود غير العاجلة بالخدمة الاقتصادية.",
        "sub": "حوالي {yearly} سنوياً، أي أقل بنسبة {pct} مما تدفعه اليوم. استناداً إلى {compared} من أصل {total} شحنة في فاتورتك عن {period}.",
        "volume_note": " على افتراض تغيّر حجم الشحن الشهري بنسبة {change}.",
        "period_range": "من {start} إلى {end}",
        "period_fallback": "الفترة المذكورة في الفاتورة",
        "kpi_today": "ما تدفعه اليوم / شهرياً",
        "kpi_bcom": "مع BCOM / شهرياً",
        "kpi_saving": "التوفير الشهري",
        "examples_title": "أمثلة من فاتورتكم",
        "col_shipment": "الشحنة",
        "kpi_compared": "الشحنات التي تمت مقارنتها",
        "recommended": "الخدمات المقترحة",
        "by_region": "مقارنة التكاليف حسب المنطقة",
        "busiest": "أكثر مساراتك نشاطاً",
        "col_service": "الخدمة",
        "col_region": "المنطقة",
        "col_route": "المسار",
        "col_shipments": "الشحنات",
        "col_today": "اليوم",
        "col_bcom": "مع BCOM",
        "col_saving": "التوفير",
        "delivery": "مواعيد التسليم عند شحن الطرود غير العاجلة بالخدمة الاقتصادية",
        "col_express": "السريع",
        "col_economy": "الاقتصادي",
        "not_included": "شحنات غير مشمولة في التوفير",
        "quote_separately": "يسعدنا تقديم عرض سعر منفصل لها.",
        "conditions": "الشروط التجارية",
        "how": "كيف قمنا بالحساب",
        "footer": "BCOM Global · أعدّه {name}، {company}",
        "page": "صفحة",
        "of": "من",
    },
}

_MONTHS_AR = (
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
)
_MONTHS_EN = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

ZONES_AR = {
    "UAE domestic": "داخل الإمارات",
    "GCC": "دول الخليج",
    "Middle East & South Asia": "الشرق الأوسط وجنوب آسيا",
    "Europe": "أوروبا",
    "North America": "أمريكا الشمالية",
    "Asia Pacific": "آسيا والمحيط الهادئ",
}
SERVICES_AR = {"express": "BCOM السريع", "economy": "BCOM الاقتصادي"}
SERVICE_DESCRIPTIONS_AR = {
    "express": "توصيل من الباب إلى الباب في وقت محدد مع تتبع مباشر.",
    "economy": "توصيل بتكلفة أقل للشحنات غير العاجلة مع تتبع مباشر.",
}
_FIELDS_AR = {
    "origin country": "بلد المنشأ",
    "destination country": "بلد الوجهة",
    "weight": "الوزن",
    "service": "الخدمة",
    "charge": "الرسوم",
}


def label(language: Language, key: str, **values: object) -> str:
    return LABELS[language][key].format(**values)


def date_text(iso: str | None, language: Language) -> str:
    if not iso:
        return "–"
    year, month, day = iso.split("-")
    months = _MONTHS_AR if language == "ar" else _MONTHS_EN
    return f"{day} {months[int(month) - 1]} {year}"


def transit_text(text: str, language: Language) -> str:
    """'Next day' / '1–2 days' from the rate card, in the chosen language."""
    if language == "en":
        return text
    return text.replace("Next day", "اليوم التالي").replace("days", "أيام")


def zone_text(name: str, language: Language) -> str:
    return ZONES_AR.get(name, name) if language == "ar" else name


def lane_text(name: str, language: Language) -> str:
    # "Dubai to Riyadh": city names stay as printed; a dash reads naturally in both directions.
    return name.replace(" to ", " – ") if language == "ar" else name


def service_text(service: str, language: Language, english_label: str) -> str:
    return SERVICES_AR.get(service, english_label) if language == "ar" else english_label


def service_description(service: str, language: Language) -> str:
    if language == "ar":
        return SERVICE_DESCRIPTIONS_AR.get(service, "")
    for key, text in SERVICE_DESCRIPTIONS.items():
        if key == service:
            return text
    return ""


def reason_text(row: ShipmentComparison, language: Language) -> str:
    reason = row.reason or "Not compared"
    if language == "en":
        return reason
    if row.status == "excluded":
        return "مستبعدة من قِبل الشريك"
    if row.status == "missing_data":
        fields = reason.removeprefix("Missing ").split(", ")
        return "بيانات ناقصة: " + "، ".join(_FIELDS_AR.get(field, field) for field in fields)
    if reason.startswith("Not sent from the UAE"):
        return "غير مرسلة من الإمارات (الواردات غير مدرجة في جدول الأسعار)"
    if reason.startswith("Over "):
        return f"أكثر من {MAX_WEIGHT_KG} كغ – تحتاج إلى عرض سعر شحن منفصل"
    if match := re.match(r"Destination (\w+) is not", reason):
        return f"الوجهة {match.group(1)} غير مدرجة في جدول الأسعار"
    if reason.startswith("Invoice is not in"):
        return "عملة الفاتورة غير مدعومة في جدول الأسعار"
    if reason.startswith("Weight must"):
        return "يجب أن يكون الوزن أكبر من 0 كغ"
    return reason


def conditions(valid_until_iso: str, language: Language) -> list[str]:
    if language == "en":
        return commercial_conditions(date_text(valid_until_iso, "en"))
    return [
        f"الأسعار صالحة حتى {date_text(valid_until_iso, 'ar')}.",
        "الأسعار بالدرهم الإماراتي، وتشمل رسوم الوقود بمستواها الحالي، ولا تشمل ضريبة القيمة المضافة 5% والرسوم الجمركية والضرائب.",
        "تتم مراجعة رسوم الوقود شهرياً، وقد تتغير الأسعار إذا تغيّرت تكاليف الوقود بشكل كبير.",
        "تُحتسب الشحنات على أساس الوزن الفعلي أو الحجمي أيهما أكبر (الطول × العرض × الارتفاع بالسنتيمتر ÷ 5000)، مقرّباً للأعلى إلى أقرب 0.5 كغ.",
        f"الشحنات الفردية التي تزيد عن {MAX_WEIGHT_KG} كغ والبضائع الخطرة والطرود كبيرة الحجم يتم تسعيرها بشكل منفصل.",
        "شروط الدفع: 15 يوماً من تاريخ الفاتورة على حساب ائتماني معتمد.",
        "التوفير المعروض تقديري ومبني على الفاتورة المقدَّمة؛ ويعتمد التوفير الفعلي على أحجام الشحن ووجهاته مستقبلاً.",
    ]


def assumptions(summary: ComparisonSummary, currency_found: bool, language: Language) -> list[str]:
    if language == "en":
        return summary.assumptions
    lines = [
        "أسعار BCOM مأخوذة من جدول الأسعار التجريبي في هذه الأداة، وسيتم استبدالها بأسعار BCOM الفعلية. الأسعار شاملة رسوم الوقود ولا تشمل ضريبة القيمة المضافة 5% والرسوم الجمركية.",
        "الرسوم الحالية مأخوذة من الفاتورة، دون ضريبة القيمة المضافة.",
        "الأوزان هي الأوزان المحتسبة في الفاتورة، مقرّبة للأعلى إلى أقرب 0.5 كغ.",
        f"تتم مقارنة الشحنات المرسلة من الإمارات فقط، حتى {MAX_WEIGHT_KG} كغ، وإلى وجهات مدرجة في جدول الأسعار. وتتم مطابقة الخدمات بالمثل (السريع بالسريع، والاقتصادي بالاقتصادي).",
    ]
    if summary.period_days is None:
        lines.append("فترة الفوترة غير مذكورة في الفاتورة، لذا تُعامَل كشهر واحد من الشحن.")
    elif summary.monthly_factor == 1:
        lines.append(f"تغطي الفاتورة {summary.period_days} يوماً وتُعامَل كشهر واحد من الشحن.")
    else:
        lines.append(
            f"تغطي الفاتورة {summary.period_days} يوماً، وتم تحويل الأرقام إلى شهر من 30 يوماً."
        )
    if summary.scenario.economy_for_non_urgent:
        switched = sum(t.shipments for t in summary.transit_tradeoffs)
        lines.append(
            f"افتراض: تسعير {switched} شحنة دولية سريعة بالخدمة الاقتصادية من BCOM، وهي أرخص لكنها أبطأ (انظر مواعيد التسليم). وتبقى الرسوم الحالية كما في الفاتورة."
        )
    if summary.scenario.volume_factor != 1:
        lines.append(
            f"افتراض: تغيّر حجم الشحن الشهري بنسبة {volume_change(summary)} مقارنة بهذه الفاتورة، بنفس مزيج المسارات والخدمات."
        )
    lines.append(
        "يفترض التوفير المستقبلي أن الأشهر القادمة مشابهة لهذه الفاتورة. التوفير السنوي = التوفير الشهري × 12."
    )
    if not currency_found:
        lines.append("لم يتم العثور على عملة الفاتورة، لذا تُعتبر المبالغ بالدرهم الإماراتي.")
    elif summary.converted_from is not None:
        conversion = summary.converted_from
        peg = " (سعر الربط الثابت للدرهم)" if conversion.currency == "USD" else ""
        lines.append(
            f"المبالغ في الفاتورة بعملة {conversion.currency} وتم تحويلها بسعر {conversion.rate:g} درهم لكل {conversion.currency}{peg} قبل المقارنة."
        )
    return lines


def volume_change(summary: ComparisonSummary) -> str:
    change = round((summary.scenario.volume_factor - 1) * 100)
    return f"{'+' if change > 0 else '−'}{abs(change)}%"
