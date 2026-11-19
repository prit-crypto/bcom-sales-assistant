/** Invoice data as the backend returns it from extraction and accepts it back after review. */

export type ServiceLevel = "express" | "economy";

/** One shipment line from a prospect's courier invoice. */
export interface Shipment {
  id: string;
  /** ISO date, YYYY-MM-DD */
  date: string | null;
  /** Air waybill / tracking number */
  reference: string | null;
  origin_city: string | null;
  /** ISO 3166-1 alpha-2, upper case */
  origin_country: string | null;
  destination_city: string | null;
  /** ISO 3166-1 alpha-2, upper case */
  destination_country: string | null;
  /** Chargeable weight billed by the current courier, in kg */
  weight_kg: number | null;
  pieces: number | null;
  service: ServiceLevel | null;
  /** Total charged for the shipment incl. surcharges, excl. VAT, in the invoice currency */
  charge: number | null;
  /** The partner can exclude a row from the comparison */
  included: boolean;
}

/** Everything read from one invoice. */
export interface InvoiceData {
  carrier_name: string | null;
  customer_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  period_start: string | null;
  period_end: string | null;
  /** ISO 4217, e.g. AED */
  currency: string | null;
  shipments: Shipment[];
  /** Notes from the reader about things it could not read or was unsure about */
  warnings: string[];
}

/** Fields a shipment needs before it can be priced (highlighted on the review step). */
export const REQUIRED_SHIPMENT_FIELDS = [
  "origin_country",
  "destination_country",
  "weight_kg",
  "service",
  "charge",
] as const satisfies readonly (keyof Shipment)[];

export type RequiredShipmentField = (typeof REQUIRED_SHIPMENT_FIELDS)[number];
