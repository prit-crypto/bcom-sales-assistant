/** Frozen copy of the POC rate card, used ONLY to make the fictional sample invoices. The app's real pricing lives in the backend. */
export type ServiceLevel = "express" | "economy";

/**
 * FICTIONAL BCOM rate card used for the POC only.
 * Prices are in AED, all-in (fuel surcharge included), excluding 5% VAT and duties.
 */

export const RATE_CARD_CURRENCY = "AED";
export const ORIGIN_COUNTRY = "AE";
export const MAX_WEIGHT_KG = 70;
/** Weights up to this limit are priced per 0.5 kg step; above it, per whole kg. */
export const STEP_PRICING_LIMIT_KG = 30;

export const ZONE_IDS = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6"] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

export interface ZoneDefinition {
  id: ZoneId;
  label: string;
  countries: readonly string[];
}

export const ZONES: readonly ZoneDefinition[] = [
  { id: "Z1", label: "UAE domestic", countries: ["AE"] },
  { id: "Z2", label: "GCC", countries: ["SA", "OM", "QA", "BH", "KW"] },
  {
    id: "Z3",
    label: "Middle East & South Asia",
    countries: ["EG", "JO", "LB", "IQ", "IN", "PK", "BD", "LK", "NP"],
  },
  {
    id: "Z4",
    label: "Europe",
    countries: [
      "GB", "IE", "DE", "FR", "IT", "ES", "NL", "BE", "CH", "AT",
      "SE", "DK", "NO", "PL", "PT", "GR", "TR",
    ],
  },
  { id: "Z5", label: "North America", countries: ["US", "CA"] },
  {
    id: "Z6",
    label: "Asia Pacific",
    countries: ["CN", "HK", "SG", "MY", "TH", "JP", "KR", "AU", "NZ", "PH", "ID", "VN"],
  },
];

export interface ServiceRate {
  /** Price for the first 0.5 kg */
  firstHalfKg: number;
  /** Price for each additional 0.5 kg up to STEP_PRICING_LIMIT_KG */
  additionalHalfKg: number;
  /** Price per whole kg above STEP_PRICING_LIMIT_KG */
  perKgAboveLimit: number;
  transitTime: string;
}

export const SERVICE_LABELS: Record<ServiceLevel, string> = {
  express: "BCOM Express",
  economy: "BCOM Economy",
};

export const RATES: Record<ZoneId, Record<ServiceLevel, ServiceRate>> = {
  Z1: {
    express: { firstHalfKg: 18, additionalHalfKg: 2.5, perKgAboveLimit: 4, transitTime: "Next day" },
    economy: { firstHalfKg: 14, additionalHalfKg: 1.8, perKgAboveLimit: 3, transitTime: "1–2 days" },
  },
  Z2: {
    express: { firstHalfKg: 62, additionalHalfKg: 11, perKgAboveLimit: 18, transitTime: "1–2 days" },
    economy: { firstHalfKg: 42, additionalHalfKg: 7.5, perKgAboveLimit: 12, transitTime: "3–4 days" },
  },
  Z3: {
    express: { firstHalfKg: 85, additionalHalfKg: 16, perKgAboveLimit: 26, transitTime: "2–3 days" },
    economy: { firstHalfKg: 58, additionalHalfKg: 11, perKgAboveLimit: 18, transitTime: "4–6 days" },
  },
  Z4: {
    express: { firstHalfKg: 120, additionalHalfKg: 22, perKgAboveLimit: 36, transitTime: "2–3 days" },
    economy: { firstHalfKg: 82, additionalHalfKg: 15, perKgAboveLimit: 25, transitTime: "5–7 days" },
  },
  Z5: {
    express: { firstHalfKg: 140, additionalHalfKg: 26, perKgAboveLimit: 42, transitTime: "3–4 days" },
    economy: { firstHalfKg: 96, additionalHalfKg: 18, perKgAboveLimit: 29, transitTime: "6–8 days" },
  },
  Z6: {
    express: { firstHalfKg: 110, additionalHalfKg: 20, perKgAboveLimit: 32, transitTime: "2–4 days" },
    economy: { firstHalfKg: 75, additionalHalfKg: 14, perKgAboveLimit: 22, transitTime: "5–8 days" },
  },
};

export function findZone(countryCode: string): ZoneDefinition | undefined {
  const code = countryCode.toUpperCase();
  return ZONES.find((zone) => zone.countries.includes(code));
}

export function zoneLabel(zoneId: ZoneId): string {
  return ZONES.find((zone) => zone.id === zoneId)?.label ?? zoneId;
}
