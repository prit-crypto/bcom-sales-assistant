import type { InvoiceData, RequiredShipmentField, ServiceLevel, Shipment } from "@/types/invoice";
import { FIELD_LABELS, getMissingFields } from "@/lib/invoice/validation";
import { quoteShipment } from "./calculator";
import {
  MAX_WEIGHT_KG,
  RATE_CARD_CURRENCY,
  SERVICE_LABELS,
  ZONE_IDS,
  zoneLabel,
  type ZoneId,
} from "./rate-card";

export type ShipmentStatus = "compared" | "missing_data" | "not_eligible" | "excluded";

export interface ShipmentComparison {
  shipmentId: string;
  status: ShipmentStatus;
  /** Why the shipment was not compared (null when compared) */
  reason: string | null;
  missingFields: RequiredShipmentField[];
  current: number | null;
  proposed: number | null;
  saving: number | null;
  zone: ZoneId | null;
  service: ServiceLevel | null;
  billedWeightKg: number | null;
  transitTime: string | null;
}

export interface GroupTotal {
  key: string;
  label: string;
  shipments: number;
  current: number;
  proposed: number;
  saving: number;
}

export interface ComparisonSummary {
  currency: string;
  totalShipments: number;
  comparedShipments: number;
  /** Compared shipments as a % of all shipments on the invoice */
  shipmentCoveragePct: number;
  /** Sum of all charges on the invoice (rows with a charge) */
  invoiceSpend: number;
  /** Current spend of the compared shipments only */
  currentSpend: number;
  proposedSpend: number;
  saving: number;
  savingPct: number;
  /** Compared spend as a % of the whole invoice spend */
  spendCoveragePct: number;
  periodDays: number | null;
  /** Multiplier that turns the invoice period into one month */
  monthlyFactor: number;
  /** Estimated saving per month, rounded to whole currency units */
  monthlySaving: number;
  yearlySaving: number;
  statusCounts: Record<ShipmentStatus, number>;
  /** Compared shipments where BCOM is more expensive than the current courier */
  higherPricedShipments: number;
  byZone: GroupTotal[];
  byService: GroupTotal[];
  topLanes: GroupTotal[];
  assumptions: string[];
}

export interface ComparisonResult {
  rows: ShipmentComparison[];
  summary: ComparisonSummary;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? round2((part / whole) * 100) : 0;
}

function parseIsoDate(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

/** Number of days the invoice covers: the billing period if given, otherwise first to last shipment date. */
export function getPeriodDays(invoice: InvoiceData): number | null {
  const start = parseIsoDate(invoice.periodStart);
  const end = parseIsoDate(invoice.periodEnd);
  if (start !== null && end !== null && end >= start) {
    return Math.round((end - start) / DAY_MS) + 1;
  }
  const dates = invoice.shipments
    .map((shipment) => parseIsoDate(shipment.date))
    .filter((time): time is number => time !== null);
  if (dates.length < 2) return null;
  return Math.round((Math.max(...dates) - Math.min(...dates)) / DAY_MS) + 1;
}

/** Scales the invoice period to one month. 25–35 days count as one month. */
export function getMonthlyFactor(periodDays: number | null): number {
  if (periodDays === null || (periodDays >= 25 && periodDays <= 35)) return 1;
  return 30 / periodDays;
}

function compareShipment(shipment: Shipment, currencyOk: boolean): ShipmentComparison {
  const base: ShipmentComparison = {
    shipmentId: shipment.id,
    status: "compared",
    reason: null,
    missingFields: [],
    current: shipment.charge,
    proposed: null,
    saving: null,
    zone: null,
    service: shipment.service,
    billedWeightKg: null,
    transitTime: null,
  };

  if (!shipment.included) {
    return { ...base, status: "excluded", reason: "Excluded by the partner" };
  }

  const missingFields = getMissingFields(shipment);
  if (missingFields.length > 0) {
    const names = missingFields.map((field) => FIELD_LABELS[field]).join(", ");
    return { ...base, status: "missing_data", reason: `Missing ${names}`, missingFields };
  }

  if (!currencyOk) {
    return {
      ...base,
      status: "not_eligible",
      reason: `Invoice is not in ${RATE_CARD_CURRENCY}; the sample rate card is in ${RATE_CARD_CURRENCY}`,
    };
  }

  // getMissingFields guarantees these are set.
  const quote = quoteShipment({
    originCountry: shipment.originCountry!,
    destinationCountry: shipment.destinationCountry!,
    weightKg: shipment.weightKg!,
    service: shipment.service!,
  });

  if (!quote.eligible) {
    return { ...base, status: "not_eligible", reason: quote.reason };
  }

  const current = shipment.charge!;
  return {
    ...base,
    proposed: quote.price,
    saving: round2(current - quote.price),
    zone: quote.zone,
    billedWeightKg: quote.billedWeightKg,
    transitTime: quote.transitTime,
  };
}

function addToGroup(groups: Map<string, GroupTotal>, key: string, label: string, row: ShipmentComparison) {
  const group = groups.get(key) ?? { key, label, shipments: 0, current: 0, proposed: 0, saving: 0 };
  group.shipments += 1;
  group.current = round2(group.current + (row.current ?? 0));
  group.proposed = round2(group.proposed + (row.proposed ?? 0));
  group.saving = round2(group.saving + (row.saving ?? 0));
  groups.set(key, group);
}

function laneLabel(shipment: Shipment): string {
  const from = shipment.originCity ?? shipment.originCountry ?? "?";
  const to = shipment.destinationCity ?? shipment.destinationCountry ?? "?";
  return `${from} to ${to}`;
}

/** Compares every shipment on the invoice with the BCOM rate card and summarises the result. */
export function compareInvoice(invoice: InvoiceData): ComparisonResult {
  const currency = (invoice.currency ?? RATE_CARD_CURRENCY).toUpperCase();
  const currencyOk = currency === RATE_CARD_CURRENCY;
  const rows = invoice.shipments.map((shipment) => compareShipment(shipment, currencyOk));

  const statusCounts: Record<ShipmentStatus, number> = {
    compared: 0,
    missing_data: 0,
    not_eligible: 0,
    excluded: 0,
  };
  const zones = new Map<string, GroupTotal>();
  const services = new Map<string, GroupTotal>();
  const lanes = new Map<string, GroupTotal>();
  let currentSpend = 0;
  let proposedSpend = 0;
  let higherPricedShipments = 0;

  rows.forEach((row, index) => {
    statusCounts[row.status] += 1;
    if (row.status !== "compared") return;
    const shipment = invoice.shipments[index]!;
    currentSpend += row.current ?? 0;
    proposedSpend += row.proposed ?? 0;
    if ((row.saving ?? 0) < 0) higherPricedShipments += 1;
    addToGroup(zones, row.zone!, zoneLabel(row.zone!), row);
    addToGroup(services, row.service!, SERVICE_LABELS[row.service!], row);
    const lane = laneLabel(shipment);
    addToGroup(lanes, lane.toLowerCase(), lane, row);
  });

  const invoiceSpend = round2(
    invoice.shipments.reduce((sum, shipment) => sum + (shipment.charge ?? 0), 0),
  );
  currentSpend = round2(currentSpend);
  proposedSpend = round2(proposedSpend);
  const saving = round2(currentSpend - proposedSpend);
  const periodDays = getPeriodDays(invoice);
  const monthlyFactor = getMonthlyFactor(periodDays);
  // Whole dirhams: these are estimates, and yearly must equal monthly x 12 exactly as shown.
  const monthlySaving = Math.round(saving * monthlyFactor);

  const byZone = ZONE_IDS.map((id) => zones.get(id)).filter((group): group is GroupTotal => !!group);
  const byService = [...services.values()];
  const topLanes = [...lanes.values()].sort((a, b) => b.current - a.current).slice(0, 8);

  const assumptions = [
    `BCOM prices come from the sample rate card set up in this tool, to be replaced with BCOM's live rates. Rates are all-in including fuel surcharge, and exclude 5% VAT and customs duties.`,
    `Current charges are taken from the invoice, excluding VAT.`,
    `Weights are the chargeable weights on the invoice, rounded up to the next 0.5 kg.`,
    `Only shipments sent from the UAE, up to ${MAX_WEIGHT_KG} kg, to destinations on the rate card are compared. Services are matched like for like (express to express, economy to economy).`,
    periodDays === null
      ? `The invoice period is unknown, so it is treated as one month of shipping.`
      : monthlyFactor === 1
        ? `The invoice covers ${periodDays} days and is treated as one month of shipping.`
        : `The invoice covers ${periodDays} days; figures are scaled to a 30-day month.`,
    `Future savings assume the coming months look like this invoice. Yearly saving = monthly saving x 12.`,
  ];
  if (!currencyOk) {
    assumptions.push(`The invoice currency is ${currency}, so no shipments could be compared with the AED rate card.`);
  }

  return {
    rows,
    summary: {
      currency: RATE_CARD_CURRENCY,
      totalShipments: rows.length,
      comparedShipments: statusCounts.compared,
      shipmentCoveragePct: pct(statusCounts.compared, rows.length),
      invoiceSpend,
      currentSpend,
      proposedSpend,
      saving,
      savingPct: pct(saving, currentSpend),
      spendCoveragePct: pct(currentSpend, invoiceSpend),
      periodDays,
      monthlyFactor,
      monthlySaving,
      yearlySaving: monthlySaving * 12,
      statusCounts,
      higherPricedShipments,
      byZone,
      byService,
      topLanes,
      assumptions,
    },
  };
}
