import type { RawInvoice, RawShipment } from "@/lib/ai/schema";

/**
 * Rule-based reader for OUR sample invoice format only (public/samples, fictional "SwiftLine Express").
 * Used by the `mock` provider so the whole app can be built and tested without any AI or cost.
 * It is deliberately strict: any other invoice layout returns no shipments.
 */

const DATE = String.raw`\d{2} [A-Z][a-z]{2} \d{4}`;
const PLACE = String.raw`([A-Za-z][A-Za-z .'-]*?), ([A-Z]{2})`;
const SERVICE = String.raw`(Express Worldwide|Economy Select|Domestic Express|Domestic Economy)`;

const ROW_PATTERN = new RegExp(
  String.raw`(${DATE}) (SWL \d{4} \d{4} \d{2}) ${PLACE} ${PLACE} ${SERVICE} (\d+) (\d+(?:\.\d+)?|—|-) ([\d,]+\.\d{2})`,
  "g",
);

function firstMatch(text: string, pattern: RegExp): string | null {
  return text.match(pattern)?.[1]?.trim() ?? null;
}

/** Collapses all whitespace (including line breaks inside table cells) to single spaces. */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ");
}

export function parseSampleInvoiceText(pages: string[]): RawInvoice {
  const fullText = pages.join("\n");
  const flat = flatten(fullText);

  const shipments: RawShipment[] = [...flat.matchAll(ROW_PATTERN)].map((match) => ({
    date: match[1]!,
    reference: match[2]!,
    originCity: match[3]!,
    originCountry: match[4]!,
    destinationCity: match[5]!,
    destinationCountry: match[6]!,
    service: match[7]!,
    pieces: Number(match[8]),
    weightKg: match[9] === "—" || match[9] === "-" ? null : Number(match[9]),
    charge: Number(match[10]!.replace(/,/g, "")),
  }));

  const period = flat.match(new RegExp(String.raw`Billing Period: (${DATE}) - (${DATE})`));
  const notes: string[] = [];
  const missingWeights = shipments.filter((shipment) => shipment.weightKg === null).length;
  if (missingWeights > 0) {
    notes.push(`${missingWeights} line${missingWeights === 1 ? "" : "s"} show a dash instead of a weight.`);
  }

  return {
    // The company line under the logo: "<Name> LLC · <address>"
    carrierName: firstMatch(fullText, /^([^\n·]+?\bLLC) · /m),
    customerName: firstMatch(fullText, /BILL TO\s*\n\s*(.+)/i),
    invoiceNumber: firstMatch(flat, /Invoice No: (\S+)/),
    invoiceDate: firstMatch(flat, new RegExp(String.raw`Invoice Date: (${DATE})`)),
    periodStart: period?.[1] ?? null,
    periodEnd: period?.[2] ?? null,
    currency: firstMatch(flat, /Currency: ([A-Z]{3})/),
    shipments,
    notes,
  };
}
