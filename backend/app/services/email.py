"""Sending the proposal by email, through any SMTP server (settings SMTP_*). Python's own smtplib, run in a
worker thread. Mailpit in docker-compose.yml catches every email during development."""

import html
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.schemas.api import PartnerInput
from app.utils.formatting import format_date, format_money

log = get_logger("bcom.email")

_URL = re.compile(r"(https?://[^\s<]+)")


def email_off() -> AppError:
    return AppError(
        "Email isn't set up on this server yet (SMTP_HOST is empty), so proposals can't be emailed.",
        status_code=503,
        code="email_off",
    )


def draft(
    partner: PartnerInput,
    monthly: float,
    yearly: float,
    currency: str,
    valid_until_iso: str,
    compared: int = 0,
    total: int = 0,
    period: str = "",
) -> tuple[str, str]:
    """Default subject and message, in the customer's language. The partner can change both."""
    contact = "\n".join(
        line
        for line in (
            partner.partner_name,
            partner.partner_company,
            partner.partner_phone,
            partner.partner_email,
        )
        if line
    )
    # What the estimate is based on, so the figure is not read as the whole bill.
    over_en = f" from {period}" if period else ""
    over_ar = f" في الفترة {period}" if period else ""
    basis_en = f"This is an estimate based on {compared} of the {total} shipments on your invoice{over_en}."
    basis_ar = f"هذا تقدير مبني على {compared} من أصل {total} شحنة في فاتورتكم{over_ar}."
    if partner.language == "ar":
        subject = f"عرض توفير تكاليف الشحن من BCOM Global – {partner.prospect_name}"
        message = (
            f"فريق {partner.prospect_name} المحترم،\n\n"
            "شكراً لمشاركتنا فاتورة الشحن الأخيرة. بناءً عليها، يمكنكم مع BCOM Global توفير حوالي "
            f"{format_money(monthly, currency)} شهرياً ({format_money(yearly, currency)} سنوياً).\n\n"
            f"{basis_ar}\n\n"
            f"تجدون العرض الكامل مرفقاً. الأسعار سارية حتى {format_date(valid_until_iso)}.\n\n"
            f"مع أطيب التحيات،\n{contact}"
        )
    else:
        subject = f"Your shipping savings proposal from BCOM Global – {partner.prospect_name}"
        message = (
            f"Dear {partner.prospect_name} team,\n\n"
            "Thank you for sharing your recent courier invoice. Based on it, switching to BCOM Global could save "
            f"you about {format_money(monthly, currency)} a month ({format_money(yearly, currency)} a year).\n\n"
            f"{basis_en}\n\n"
            f"The full proposal is attached. The rates are valid until {format_date(valid_until_iso)}.\n\n"
            f"Kind regards,\n{contact}"
        )
    return subject, message


def link_paragraph(url: str, language: str) -> str:
    if language == "ar":
        return f"يمكنكم الاطلاع على العرض وقبوله عبر الإنترنت: {url}"
    return f"View and accept the proposal online: {url}"


def _as_html(text: str, rtl: bool) -> str:
    paragraphs = []
    for block in text.split("\n\n"):
        escaped = html.escape(block).replace("\n", "<br>")
        linked = _URL.sub(
            lambda m: (
                f'<a href="{m.group(1)}" style="color:#8a6416;font-weight:600">{m.group(1)}</a>'
            ),
            escaped,
        )
        paragraphs.append(f"<p>{linked}</p>")
    direction = ' dir="rtl"' if rtl else ""
    return (
        f'<!doctype html><html><body{direction} style="font-family:Arial,Helvetica,sans-serif;'
        f'font-size:15px;line-height:1.5;color:#1d1d1f">{"".join(paragraphs)}</body></html>'
    )


def build_message(
    *,
    to: str,
    cc: list[str],
    reply_to: str | None,
    subject: str,
    text: str,
    rtl: bool,
    attachment: tuple[str, bytes] | None,
) -> EmailMessage:
    settings = get_settings()
    message = EmailMessage()
    message["From"] = formataddr((settings.email_from_name, settings.email_from))
    message["To"] = to
    if cc:
        message["Cc"] = ", ".join(cc)
    if reply_to:
        message["Reply-To"] = reply_to
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain=settings.email_from.split("@")[-1] or None)
    message.set_content(text)
    message.add_alternative(_as_html(text, rtl), subtype="html")
    if attachment:
        file_name, content = attachment
        message.add_attachment(content, maintype="application", subtype="pdf", filename=file_name)
    return message


def deliver(message: EmailMessage) -> None:
    """Sends one message. Blocking: call it in a worker thread."""
    settings = get_settings()
    context = ssl.create_default_context()
    try:
        if settings.smtp_security == "ssl":
            server: smtplib.SMTP = smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port, timeout=20, context=context
            )
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
        with server:
            if settings.smtp_security == "starttls":
                server.starttls(context=context)
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    except (smtplib.SMTPException, OSError) as error:
        # The partner gets a plain message; the server's own error stays in the logs.
        log.warning("email_failed", error=type(error).__name__)
        raise AppError(
            "The email could not be sent. Check the address, or try again in a minute.",
            status_code=502,
            code="email_failed",
        ) from error
