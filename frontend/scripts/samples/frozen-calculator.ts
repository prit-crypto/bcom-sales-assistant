/** Frozen copy of the POC calculator, used ONLY to make the fictional sample invoices. The app's real pricing lives in the backend. */
import {
  MAX_WEIGHT_KG,
  ORIGIN_COUNTRY,
  RATES,
  STEP_PRICING_LIMIT_KG,
  findZone,
  type ServiceLevel,
  type ZoneId,
} from "./frozen-rate-card";

export interface QuoteRequest {
  originCountry: string;
  destinationCountry: string;
  weightKg: number;
  service: ServiceLevel;
}

export type QuoteResult =
  | {
      eligible: true;
      zone: ZoneId;
      service: ServiceLevel;
      billedWeightKg: number;
      price: number;
      transitTime: string;
    }
  | { eligible: false; reason: string };

/** Rounds a weight up to the next 0.5 kg, as couriers bill it. */
export function roundUpToHalfKg(weightKg: number): number {
  return Math.ceil(weightKg * 2) / 2;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic BCOM price for one shipment, using the fictional rate card.
 * No AI is involved: the same input always gives the same price.
 */
export function quoteShipment(request: QuoteRequest): QuoteResult {
  const origin = request.originCountry.toUpperCase();
  const destination = request.destinationCountry.toUpperCase();

  if (origin !== ORIGIN_COUNTRY) {
    return { eligible: false, reason: "Not sent from the UAE (imports are not on the sample rate card)" };
  }
  if (!Number.isFinite(request.weightKg) || request.weightKg <= 0) {
    return { eligible: false, reason: "Weight must be more than 0 kg" };
  }
  if (request.weightKg > MAX_WEIGHT_KG) {
    return { eligible: false, reason: `Over ${MAX_WEIGHT_KG} kg – needs a freight quote` };
  }

  const zone = findZone(destination);
  if (!zone) {
    return { eligible: false, reason: `Destination ${destination} is not on the sample rate card` };
  }

  const rate = RATES[zone.id][request.service];
  const billedWeightKg = roundUpToHalfKg(request.weightKg);

  let price: number;
  if (billedWeightKg <= STEP_PRICING_LIMIT_KG) {
    const extraHalfKgSteps = (billedWeightKg - 0.5) / 0.5;
    price = rate.firstHalfKg + extraHalfKgSteps * rate.additionalHalfKg;
  } else {
    const priceAtLimit =
      rate.firstHalfKg + ((STEP_PRICING_LIMIT_KG - 0.5) / 0.5) * rate.additionalHalfKg;
    const extraKg = Math.ceil(billedWeightKg) - STEP_PRICING_LIMIT_KG;
    price = priceAtLimit + extraKg * rate.perKgAboveLimit;
  }

  return {
    eligible: true,
    zone: zone.id,
    service: request.service,
    billedWeightKg,
    price: roundMoney(price),
    transitTime: rate.transitTime,
  };
}
