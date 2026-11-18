import { REQUIRED_SHIPMENT_FIELDS, type RequiredShipmentField, type Shipment } from "@/types/invoice";

export function isCountryCode(value: string | null): value is string {
  return value !== null && /^[A-Z]{2}$/.test(value);
}

/** Required fields that are still empty (or, for countries, not a 2-letter code) on a shipment. */
export function getMissingFields(shipment: Shipment): RequiredShipmentField[] {
  return REQUIRED_SHIPMENT_FIELDS.filter((field) => {
    if (field === "originCountry" || field === "destinationCountry") return !isCountryCode(shipment[field]);
    return shipment[field] === null;
  });
}

export const FIELD_LABELS: Record<RequiredShipmentField, string> = {
  originCountry: "origin country",
  destinationCountry: "destination country",
  weightKg: "weight",
  service: "service",
  charge: "charge",
};
