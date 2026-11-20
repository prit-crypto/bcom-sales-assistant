"""The shape every invoice reader (mock, Gemini, OpenAI) must return, before normalisation.

Values are kept loose here (numbers may arrive as strings) and are cleaned up by
`app.services.invoice.normalize.normalize_invoice`.
"""

from typing import Any

from pydantic import BaseModel

LooseNumber = float | int | str | None


class RawShipment(BaseModel):
    date: str | None
    reference: str | None
    origin_city: str | None
    origin_country: str | None
    destination_city: str | None
    destination_country: str | None
    weight_kg: LooseNumber
    pieces: LooseNumber
    service: str | None
    charge: LooseNumber
    # Field names the reader could not read clearly (AI readers only).
    uncertain_fields: list[str] = []


class RawInvoice(BaseModel):
    carrier_name: str | None
    customer_name: str | None
    invoice_number: str | None
    invoice_date: str | None
    period_start: str | None
    period_end: str | None
    currency: str | None
    shipments: list[RawShipment]
    notes: list[str]
    # Total of the lines excluding VAT as printed (the "Subtotal" line), for the totals check.
    invoice_subtotal: LooseNumber = None


def _nullable(kind: str, description: str) -> dict[str, Any]:
    return {"type": [kind, "null"], "description": description}


def _object(properties: dict[str, Any], description: str | None = None) -> dict[str, Any]:
    schema: dict[str, Any] = {
        "type": "object",
        "additionalProperties": False,
        "properties": properties,
        "required": list(properties),
    }
    if description:
        schema["description"] = description
    return schema


# JSON Schema sent to the AI providers for structured output. Written by hand so it stays within the
# subset both Gemini and OpenAI (strict mode) accept: every property required, nullable via a type
# array, no extra properties. Field names match RawInvoice exactly.
INVOICE_JSON_SCHEMA: dict[str, Any] = _object(
    {
        "carrier_name": _nullable("string", "Company that issued the invoice (the courier)"),
        "customer_name": _nullable("string", "Company the invoice is billed to"),
        "invoice_number": _nullable("string", "Invoice number as printed"),
        "invoice_date": _nullable("string", "Invoice date as YYYY-MM-DD"),
        "period_start": _nullable("string", "First day of the billing period as YYYY-MM-DD"),
        "period_end": _nullable("string", "Last day of the billing period as YYYY-MM-DD"),
        "currency": _nullable("string", "ISO 4217 currency code of the amounts, e.g. AED"),
        "shipments": {
            "type": "array",
            "description": "One entry per shipment line. Exclude subtotal, VAT and total lines.",
            "items": _object(
                {
                    "date": _nullable("string", "Shipment date as YYYY-MM-DD"),
                    "reference": _nullable("string", "Air waybill or tracking number"),
                    "origin_city": _nullable("string", "Origin city"),
                    "origin_country": _nullable(
                        "string", "Origin country as ISO 3166-1 alpha-2 code, e.g. AE"
                    ),
                    "destination_city": _nullable("string", "Destination city"),
                    "destination_country": _nullable(
                        "string", "Destination country as ISO 3166-1 alpha-2 code, e.g. SA"
                    ),
                    "weight_kg": _nullable("number", "Chargeable weight in kilograms"),
                    "pieces": _nullable("number", "Number of pieces"),
                    "service": _nullable(
                        "string", "Service name exactly as printed, e.g. Express Worldwide"
                    ),
                    "charge": _nullable("number", "Line amount excluding VAT, as a plain number"),
                    "uncertain_fields": {
                        "type": "array",
                        "description": "Names of fields on this line you could not read clearly (e.g. weight_kg); empty when sure",
                        "items": {"type": "string"},
                    },
                }
            ),
        },
        "notes": {
            "type": "array",
            "description": "Short notes about anything unreadable, unclear or converted",
            "items": {"type": "string"},
        },
        "invoice_subtotal": _nullable(
            "number",
            "Total of the shipment lines excluding VAT as printed (the subtotal line), plain number",
        ),
    }
)
