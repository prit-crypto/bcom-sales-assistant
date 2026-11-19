import { REQUIRED_SHIPMENT_FIELDS, type RequiredShipmentField, type Shipment } from "@/types/invoice";

/**
 * Highlights empty cells while the partner edits the table. This is form feedback only: the backend
 * applies the same rule when it compares the invoice.
 */
export function getMissingFields(shipment: Shipment): RequiredShipmentField[] {
  return REQUIRED_SHIPMENT_FIELDS.filter((field) => {
    if (field === "origin_country" || field === "destination_country") {
      const value = shipment[field];
      return value === null || !/^[A-Z]{2}$/.test(value);
    }
    return shipment[field] === null;
  });
}
