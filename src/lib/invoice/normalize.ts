import type { RawInvoice, RawShipment } from "@/lib/ai/schema";
import type { InvoiceData, ServiceLevel, Shipment } from "@/types/invoice";
import { RATE_CARD_CURRENCY } from "@/lib/pricing/rate-card";
import { getMissingFields } from "./validation";

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Country names an AI or an invoice may use instead of an ISO code. */
const COUNTRY_ALIASES: Record<string, string> = {
  UAE: "AE", "UNITED ARAB EMIRATES": "AE", KSA: "SA", "SAUDI ARABIA": "SA", OMAN: "OM", QATAR: "QA",
  BAHRAIN: "BH", KUWAIT: "KW", EGYPT: "EG", JORDAN: "JO", LEBANON: "LB", INDIA: "IN", PAKISTAN: "PK",
  "SRI LANKA": "LK", UK: "GB", "UNITED KINGDOM": "GB", "GREAT BRITAIN": "GB", GERMANY: "DE", FRANCE: "FR",
  NETHERLANDS: "NL", TURKEY: "TR", TURKIYE: "TR", USA: "US", "UNITED STATES": "US", CANADA: "CA",
  CHINA: "CN", "HONG KONG": "HK", SINGAPORE: "SG", AUSTRALIA: "AU", JAPAN: "JP",
};

function cleanText(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeCountry(value: string | null): string | null {
  const text = cleanText(value)?.toUpperCase().replace(/\./g, "");
  if (!text) return null;
  if (/^[A-Z]{2}$/.test(text)) return text;
  return COUNTRY_ALIASES[text] ?? null;
}

/** Accepts YYYY-MM-DD, "02 Oct 2026" or "2 October 2026"; returns YYYY-MM-DD or null. */
export function normalizeDate(value: string | null): string | null {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{4})$/);
  if (match) {
    const month = MONTHS[match[2]!.toLowerCase()];
    if (month) return `${match[3]}-${month}-${match[1]!.padStart(2, "0")}`;
  }
  return null;
}

export function normalizeNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const number = typeof value === "number" ? value : Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function normalizeService(value: string | null): ServiceLevel | null {
  const text = cleanText(value)?.toLowerCase();
  if (!text) return null;
  if (/(econom|saver|standard|deferred|ground|road|^eco\b)/.test(text)) return "economy";
  if (/(express|priority|next day|same day|worldwide|premium|^exp\b)/.test(text)) return "express";
  return null;
}

function normalizeShipment(raw: RawShipment, index: number): Shipment {
  const pieces = normalizeNumber(raw.pieces);
  return {
    id: `s${index + 1}`,
    date: normalizeDate(raw.date),
    reference: cleanText(raw.reference),
    originCity: cleanText(raw.originCity),
    originCountry: normalizeCountry(raw.originCountry),
    destinationCity: cleanText(raw.destinationCity),
    destinationCountry: normalizeCountry(raw.destinationCountry),
    weightKg: normalizeNumber(raw.weightKg),
    pieces: pieces === null ? null : Math.round(pieces),
    service: normalizeService(raw.service),
    charge: normalizeNumber(raw.charge),
    included: true,
  };
}

/** Turns any reader's raw output into clean, typed invoice data the app can edit and price. */
export function normalizeInvoice(raw: RawInvoice): InvoiceData {
  const shipments = raw.shipments.map(normalizeShipment);
  const warnings = raw.notes.map((note) => note.trim()).filter(Boolean);

  const incomplete = shipments.filter((shipment) => getMissingFields(shipment).length > 0).length;
  if (incomplete > 0) {
    warnings.push(
      `${incomplete} shipment${incomplete === 1 ? " has" : "s have"} missing fields. Fill them in or exclude the rows before comparing.`,
    );
  }
  if (shipments.length === 0) {
    warnings.push("No shipment lines were found on this invoice.");
  }

  const currency = cleanText(raw.currency)?.toUpperCase() ?? null;
  if (currency && currency !== RATE_CARD_CURRENCY) {
    warnings.push(
      `This invoice is in ${currency}. The BCOM rate card is in ${RATE_CARD_CURRENCY}, so its shipments cannot be compared yet.`,
    );
  }
  return {
    carrierName: cleanText(raw.carrierName),
    customerName: cleanText(raw.customerName),
    invoiceNumber: cleanText(raw.invoiceNumber),
    invoiceDate: normalizeDate(raw.invoiceDate),
    periodStart: normalizeDate(raw.periodStart),
    periodEnd: normalizeDate(raw.periodEnd),
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    shipments,
    warnings,
  };
}
