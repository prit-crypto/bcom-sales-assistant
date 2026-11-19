"""Number, money and date formatting shared by the proposal PDF and the WhatsApp message."""

import math

_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def round_half_up(value: float, digits: int = 0) -> float:
    """Rounds .5 up (towards +infinity), unlike Python's round(), which rounds to even.

    Money must round the same way every time: 19.5 -> 20, 2.345 -> 2.35.
    """
    factor = float(10**digits)
    # Tiny nudge so values stored just below .5 (1.005 is 1.00499999... as a float) round up.
    return math.floor(value * factor + 0.5 + 1e-9) / factor


def round_money(value: float) -> float:
    return round_half_up(value, 2)


def format_money(value: float, currency: str = "AED") -> str:
    """'AED 2,920' (no decimals) for headline numbers."""
    return f"{currency} {int(round_half_up(value)):,}"


def format_money_exact(value: float, currency: str = "AED") -> str:
    """'AED 2,920.50' for table cells."""
    return f"{currency} {round_money(value):,.2f}"


def format_percent(value: float) -> str:
    """12.345 -> '12.3%', 40.0 -> '40%'."""
    rounded = round_half_up(value, 1)
    text = f"{rounded:,.1f}"
    return f"{text.removesuffix('.0')}%"


def format_date(iso: str | None) -> str:
    """'2026-10-02' -> '02 Oct 2026'."""
    if not iso:
        return "–"
    parts = iso.split("-")
    if len(parts) == 3 and parts[1].isdigit() and 1 <= int(parts[1]) <= 12:
        return f"{parts[2]} {_MONTHS[int(parts[1]) - 1]} {parts[0]}"
    return iso
