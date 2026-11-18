export const SERVICE_LEVELS = ["express", "economy"] as const;
export type ServiceLevel = (typeof SERVICE_LEVELS)[number];

/** One shipment line from a prospect's courier invoice, after normalisation. */
export interface Shipment {
  id: string;
  /** ISO date, YYYY-MM-DD */
  date: string | null;
  /** Air waybill / tracking number */
  reference: string | null;
  originCity: string | null;
  /** ISO 3166-1 alpha-2, upper case */
  originCountry: string | null;
  destinationCity: string | null;
  /** ISO 3166-1 alpha-2, upper case */
  destinationCountry: string | null;
  /** Chargeable weight billed by the current courier, in kg */
  weightKg: number | null;
  pieces: number | null;
  service: ServiceLevel | null;
  /** Total charged for the shipment incl. surcharges, excl. VAT, in the invoice currency */
  charge: number | null;
  /** The partner can exclude a row from the comparison */
  included: boolean;
}

/** Everything we read from one invoice. */
export interface InvoiceData {
  carrierName: string | null;
  customerName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** ISO 4217, e.g. AED */
  currency: string | null;
  shipments: Shipment[];
  /** Notes from the reader about things it could not read or was unsure about */
  warnings: string[];
}

/** Fields a shipment needs before it can be priced. */
export const REQUIRED_SHIPMENT_FIELDS = [
  "originCountry",
  "destinationCountry",
  "weightKg",
  "service",
  "charge",
] as const satisfies readonly (keyof Shipment)[];

export type RequiredShipmentField = (typeof REQUIRED_SHIPMENT_FIELDS)[number];
