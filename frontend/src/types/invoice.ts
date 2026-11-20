/**
 * Invoice data as the backend returns it from extraction and accepts it back after review.
 * Generated from the backend's OpenAPI description (`npm run generate:api`); never edit by hand.
 */
import type { InvoiceDataOutput, ShipmentComparison, ShipmentOutput } from "@/lib/api/generated";

export type Shipment = ShipmentOutput;
export type InvoiceData = InvoiceDataOutput;
export type ServiceLevel = NonNullable<Shipment["service"]>;
export type RequiredShipmentField = ShipmentComparison["missing_fields"][number];
/** Shipment fields the partner can edit (and the reader can flag as uncertain). */
export type EditableField = Shipment["uncertain_fields"][number];

/** Fields a shipment needs before it can be priced (highlighted on the review step). */
export const REQUIRED_SHIPMENT_FIELDS = [
  "origin_country",
  "destination_country",
  "weight_kg",
  "service",
  "charge",
] as const satisfies readonly RequiredShipmentField[];
