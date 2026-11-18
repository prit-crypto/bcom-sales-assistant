import { MAX_WEIGHT_KG } from "@/lib/pricing/rate-card";

/** SAMPLE commercial conditions for the demo proposal. Not BCOM's real terms. */
export function commercialConditions(validUntil: string): string[] {
  return [
    `Rates are valid until ${validUntil}.`,
    "Prices are in AED, include fuel surcharge at today's level and exclude 5% VAT, customs duties and taxes.",
    "Fuel surcharge is reviewed monthly; rates may change if fuel costs move significantly.",
    "Shipments are billed on the greater of actual or volumetric weight (L x W x H in cm / 5000), rounded up to the next 0.5 kg.",
    `Single shipments over ${MAX_WEIGHT_KG} kg, dangerous goods and oversized items are quoted separately as freight.`,
    "Payment terms: 15 days from invoice date on an approved credit account.",
    "The saving shown is an estimate based on the invoice provided; actual savings depend on future volumes and destinations.",
  ];
}

export const SERVICE_DESCRIPTIONS: Record<"express" | "economy", string> = {
  express: "Time-definite door-to-door delivery with live tracking.",
  economy: "Lower-cost delivery for shipments that are not urgent, with live tracking.",
};
