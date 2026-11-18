import { z } from "zod";

/**
 * The shape every invoice reader (mock, Gemini, OpenAI) must return.
 * Values are kept loose here (numbers may arrive as strings) and are cleaned up by `normalizeInvoice`.
 */
const looseText = z.string().nullable();
const looseNumber = z.union([z.number(), z.string()]).nullable();

export const rawShipmentSchema = z.object({
  date: looseText,
  reference: looseText,
  originCity: looseText,
  originCountry: looseText,
  destinationCity: looseText,
  destinationCountry: looseText,
  weightKg: looseNumber,
  pieces: looseNumber,
  service: looseText,
  charge: looseNumber,
});

export const rawInvoiceSchema = z.object({
  carrierName: looseText,
  customerName: looseText,
  invoiceNumber: looseText,
  invoiceDate: looseText,
  periodStart: looseText,
  periodEnd: looseText,
  currency: looseText,
  shipments: z.array(rawShipmentSchema),
  notes: z.array(z.string()),
});

export type RawShipment = z.infer<typeof rawShipmentSchema>;
export type RawInvoice = z.infer<typeof rawInvoiceSchema>;

const nullableString = (description: string) => ({ type: ["string", "null"], description });
const nullableNumber = (description: string) => ({ type: ["number", "null"], description });

/**
 * JSON Schema sent to the AI providers for structured output.
 * Written by hand so it stays within the subset both Gemini and OpenAI (strict mode) accept:
 * every property required, nullable via a type array, no extra properties.
 */
export const INVOICE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    carrierName: nullableString("Company that issued the invoice (the courier)"),
    customerName: nullableString("Company the invoice is billed to"),
    invoiceNumber: nullableString("Invoice number as printed"),
    invoiceDate: nullableString("Invoice date as YYYY-MM-DD"),
    periodStart: nullableString("First day of the billing period as YYYY-MM-DD"),
    periodEnd: nullableString("Last day of the billing period as YYYY-MM-DD"),
    currency: nullableString("ISO 4217 currency code of the amounts, e.g. AED"),
    shipments: {
      type: "array",
      description: "One entry per shipment line. Exclude subtotal, VAT and total lines.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: nullableString("Shipment date as YYYY-MM-DD"),
          reference: nullableString("Air waybill or tracking number"),
          originCity: nullableString("Origin city"),
          originCountry: nullableString("Origin country as ISO 3166-1 alpha-2 code, e.g. AE"),
          destinationCity: nullableString("Destination city"),
          destinationCountry: nullableString("Destination country as ISO 3166-1 alpha-2 code, e.g. SA"),
          weightKg: nullableNumber("Chargeable weight in kilograms"),
          pieces: nullableNumber("Number of pieces"),
          service: nullableString("Service name exactly as printed, e.g. Express Worldwide"),
          charge: nullableNumber("Line amount excluding VAT, as a plain number"),
        },
        required: [
          "date",
          "reference",
          "originCity",
          "originCountry",
          "destinationCity",
          "destinationCountry",
          "weightKg",
          "pieces",
          "service",
          "charge",
        ],
      },
    },
    notes: {
      type: "array",
      description: "Short notes about anything unreadable, unclear or converted",
      items: { type: "string" },
    },
  },
  required: [
    "carrierName",
    "customerName",
    "invoiceNumber",
    "invoiceDate",
    "periodStart",
    "periodEnd",
    "currency",
    "shipments",
    "notes",
  ],
} as const;
