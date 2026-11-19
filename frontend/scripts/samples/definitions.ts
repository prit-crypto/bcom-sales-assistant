/**
 * Fictional sample invoices for the POC. Everything here is made up:
 * "SwiftLine Express" is not a real courier and the customers are not real companies.
 * Generation is seeded, so running the generator twice gives the same files.
 */
import { quoteShipment } from "./frozen-calculator";
import type { ServiceLevel } from "./frozen-rate-card";

export interface SampleRow {
  date: string; // YYYY-MM-DD
  awb: string;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  service: ServiceLevel;
  serviceName: string;
  pieces: number;
  /** null = printed as a dash (missing on the invoice) */
  weightKg: number | null;
  amount: number;
}

/** Each layout is a different (fictional) courier's invoice design. */
export type SampleLayout = "swiftline" | "falcon" | "desert" | "cards" | "oryx";

export interface PhotoOptions {
  /** phone = warm, soft JPEG; scan = grey, high-contrast PNG */
  kind: "phone" | "scan";
  tiltDegrees: number;
  /** Browser window height used for the screenshot */
  windowHeight: number;
  fileSuffix: string;
}

export interface SampleInvoice {
  fileStem: string;
  title: string;
  layout: SampleLayout;
  carrierName: string;
  carrierAddress: string;
  customerName: string;
  customerAddress: string;
  accountNumber: string;
  invoiceNumber: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  currency: "AED" | "USD";
  rows: SampleRow[];
  /** Produce a PDF of the invoice */
  pdf: boolean;
  landscape: boolean;
  /** Also produce an image (photo or scan) of the invoice */
  photo: PhotoOptions | null;
}

interface Destination {
  city: string;
  country: string;
}

const DESTINATIONS: Record<string, Destination[]> = {
  Z1: [
    { city: "Abu Dhabi", country: "AE" },
    { city: "Sharjah", country: "AE" },
    { city: "Al Ain", country: "AE" },
  ],
  Z2: [
    { city: "Riyadh", country: "SA" },
    { city: "Jeddah", country: "SA" },
    { city: "Dammam", country: "SA" },
    { city: "Muscat", country: "OM" },
    { city: "Doha", country: "QA" },
    { city: "Manama", country: "BH" },
    { city: "Kuwait City", country: "KW" },
  ],
  Z3: [
    { city: "Cairo", country: "EG" },
    { city: "Amman", country: "JO" },
    { city: "Mumbai", country: "IN" },
    { city: "Delhi", country: "IN" },
    { city: "Karachi", country: "PK" },
    { city: "Colombo", country: "LK" },
  ],
  Z4: [
    { city: "London", country: "GB" },
    { city: "Manchester", country: "GB" },
    { city: "Berlin", country: "DE" },
    { city: "Paris", country: "FR" },
    { city: "Amsterdam", country: "NL" },
    { city: "Istanbul", country: "TR" },
  ],
  Z5: [
    { city: "New York", country: "US" },
    { city: "Toronto", country: "CA" },
  ],
  Z6: [
    { city: "Singapore", country: "SG" },
    { city: "Hong Kong", country: "HK" },
    { city: "Sydney", country: "AU" },
  ],
};

/** How the fictional current courier's prices compare with BCOM's, per zone. Below 1 = cheaper than BCOM. */
const CURRENT_PRICE_FACTOR: Record<string, number> = {
  Z1: 0.92,
  Z2: 1.27,
  Z3: 1.22,
  Z4: 1.24,
  Z5: 1.17,
  Z6: 1.2,
};

/** Small deterministic pseudo-random generator (mulberry32). */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function weightedZone(random: () => number, weights: Record<string, number>): string {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  let roll = random() * total;
  for (const [zone, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) return zone;
  }
  return Object.keys(weights)[0]!;
}

function serviceName(service: ServiceLevel, domestic: boolean): string {
  if (domestic) return service === "express" ? "Domestic Express" : "Domestic Economy";
  return service === "express" ? "Express Worldwide" : "Economy Select";
}

function awb(random: () => number): string {
  const digits = () => String(Math.floor(random() * 10000)).padStart(4, "0");
  return `SWL ${digits()} ${digits()} ${String(Math.floor(random() * 100)).padStart(2, "0")}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function currentPrice(random: () => number, zone: string, row: Omit<SampleRow, "amount">): number {
  const quote = quoteShipment({
    originCountry: row.originCountry,
    destinationCountry: row.destinationCountry,
    weightKg: row.weightKg ?? 1,
    service: row.service,
  });
  const base = quote.eligible ? quote.price : 180 + random() * 400;
  const noise = 0.97 + random() * 0.08;
  return round2(base * (CURRENT_PRICE_FACTOR[zone] ?? 1.2) * noise);
}

interface RowOptions {
  random: () => number;
  /** Waybill number format of the courier (default: SwiftLine) */
  awbStyle?: (random: () => number) => string;
  date: string;
  zone: string;
  destination?: Destination;
  origin?: Destination;
  service: ServiceLevel;
  weightKg: number | null;
  amountOverride?: number;
}

function makeRow(options: RowOptions): SampleRow {
  const { random, date, zone, service, weightKg } = options;
  const origin = options.origin ?? (random() < 0.85 ? { city: "Dubai", country: "AE" } : { city: "Sharjah", country: "AE" });
  const destination = options.destination ?? pick(random, DESTINATIONS[zone]!);
  const domestic = origin.country === "AE" && destination.country === "AE";
  const partial = {
    date,
    awb: (options.awbStyle ?? awb)(random),
    originCity: origin.city,
    originCountry: origin.country,
    destinationCity: destination.city,
    destinationCountry: destination.country,
    service,
    serviceName: serviceName(service, domestic),
    pieces: weightKg !== null && weightKg > 15 ? 2 + Math.floor(random() * 3) : 1,
    weightKg,
  };
  return { ...partial, amount: options.amountOverride ?? currentPrice(random, zone, partial) };
}

function octoberDates(random: () => number, count: number): string[] {
  return Array.from({ length: count }, () => 1 + Math.floor(random() * 31))
    .sort((a, b) => a - b)
    .map((day) => `2026-10-${String(day).padStart(2, "0")}`);
}

function buildAlNoor(): SampleInvoice {
  const random = seededRandom(20261031);
  const dates = octoberDates(random, 46);
  const rows = dates.map((date, index) => {
    if (index === 17) {
      // Destination not on the sample rate card
      return makeRow({
        random,
        date,
        zone: "Z5",
        destination: { city: "Sao Paulo", country: "BR" },
        service: "express",
        weightKg: 1.5,
        amountOverride: 412.4,
      });
    }
    const zone = weightedZone(random, { Z1: 7, Z2: 16, Z3: 7, Z4: 9, Z5: 3, Z6: 4 });
    const service: ServiceLevel = random() < 0.72 ? "express" : "economy";
    const weightKg = random() < 0.85 ? pick(random, [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]) : pick(random, [8, 10, 12.5, 18]);
    return makeRow({ random, date, zone, service, weightKg });
  });

  return {
    fileStem: "sample-1-al-noor-mobile",
    title: "Sample 1 – clean PDF (46 shipments)",
    carrierName: "SwiftLine Express LLC",
    carrierAddress: "Unit 14, Logistics Park, Dubai, UAE",
    customerName: "Al Noor Mobile Accessories Trading LLC",
    customerAddress: "Warehouse 7, Al Quoz Industrial 3, Dubai, UAE",
    accountNumber: "SWL-AC-200481",
    invoiceNumber: "SWL-INV-2610-0457",
    invoiceDate: "2026-11-03",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    currency: "AED",
    rows,
    layout: "swiftline",
    pdf: true,
    landscape: false,
    photo: null,
  };
}

function buildGulfSpice(): SampleInvoice {
  const random = seededRandom(20261102);
  const dates = octoberDates(random, 22);
  const rows = dates.map((date, index) => {
    if (index === 4 || index === 13) {
      // Weight missing on the invoice
      const zone = index === 4 ? "Z2" : "Z4";
      const row = makeRow({ random, date, zone, service: "economy", weightKg: 12 });
      return { ...row, weightKg: null };
    }
    if (index === 8) {
      // Import shipment – not on the export rate card
      return makeRow({
        random,
        date,
        zone: "Z1",
        origin: { city: "Shenzhen", country: "CN" },
        destination: { city: "Dubai", country: "AE" },
        service: "economy",
        weightKg: 22,
        amountOverride: 968.0,
      });
    }
    if (index === 17) {
      // Over 70 kg – needs a freight quote
      return makeRow({ random, date, zone: "Z2", service: "economy", weightKg: 85, amountOverride: 1485.5 });
    }
    const zone = weightedZone(random, { Z1: 3, Z2: 10, Z3: 4, Z4: 4, Z6: 2 });
    const service: ServiceLevel = random() < 0.35 ? "express" : "economy";
    const weightKg = pick(random, [3, 5, 7.5, 10, 12, 15, 20, 25, 32, 40]);
    return makeRow({ random, date, zone, service, weightKg });
  });

  return {
    fileStem: "sample-2-gulf-spice",
    title: "Sample 2 – messy PDF and photo (22 shipments, gaps)",
    carrierName: "SwiftLine Express LLC",
    carrierAddress: "Unit 14, Logistics Park, Dubai, UAE",
    customerName: "Gulf Spice Traders LLC",
    customerAddress: "Shop 22, Spice Souk Road, Deira, Dubai, UAE",
    accountNumber: "SWL-AC-118204",
    invoiceNumber: "SWL-INV-2610-0912",
    invoiceDate: "2026-11-04",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    currency: "AED",
    rows,
    layout: "swiftline",
    pdf: true,
    landscape: false,
    // Mild tilt: ~1 degree made gemini-3.5-flash-lite mix up rows in testing.
    photo: { kind: "phone", tiltDegrees: -0.3, windowHeight: 1000, fileSuffix: "-photo" },
  };
}

const digits = (random: () => number, count: number) =>
  Array.from({ length: count }, () => Math.floor(random() * 10)).join("");

/** Falcon Air: DD/MM/YYYY dates, full country names, product codes, separate fuel column, origin only in header. */
function buildFalcon(): SampleInvoice {
  const random = seededRandom(20261105);
  const dates = octoberDates(random, 30);
  const rows = dates.map((date) => {
    const zone = weightedZone(random, { Z1: 4, Z2: 10, Z3: 6, Z4: 6, Z5: 2, Z6: 4 });
    const service: ServiceLevel = random() < 0.6 ? "express" : "economy";
    const weightKg = pick(random, [0.5, 1, 1.5, 2, 3, 4.5, 6, 8]);
    return makeRow({
      random,
      date,
      zone,
      service,
      weightKg,
      origin: { city: "Dubai", country: "AE" },
      awbStyle: (r) => `FZ${digits(r, 10)}`,
    });
  });
  return {
    fileStem: "sample-3-falcon-air",
    title: "Sample 3 – Falcon Air (codes, fuel column, DD/MM/YYYY)",
    layout: "falcon",
    carrierName: "Falcon Air Courier FZE",
    carrierAddress: "Warehouse B3, Dubai Airport Freezone, Dubai, UAE",
    customerName: "Bayt Al Oud Perfumes LLC",
    customerAddress: "Unit 9, Al Khabaisi, Deira, Dubai, UAE",
    accountNumber: "FAC-77310",
    invoiceNumber: "FA/2026/10/3318",
    invoiceDate: "2026-11-02",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    currency: "AED",
    rows,
    pdf: true,
    landscape: false,
    photo: { kind: "scan", tiltDegrees: 0.2, windowHeight: 960, fileSuffix: "-scan" },
  };
}

/** Desert Parcel: landscape, rows grouped under service headings with subtotals, YYYY/MM/DD dates. */
function buildDesert(): SampleInvoice {
  const random = seededRandom(20261106);
  const dates = octoberDates(random, 38);
  const rows = dates.map((date) => {
    const zone = weightedZone(random, { Z1: 8, Z2: 12, Z3: 6, Z4: 5, Z6: 3 });
    const service: ServiceLevel = random() < 0.45 ? "express" : "economy";
    const weightKg = pick(random, [2, 3.5, 5, 8, 10, 14, 18, 25, 30, 45]);
    return makeRow({ random, date, zone, service, weightKg, awbStyle: (r) => `DP-${digits(r, 8)}` });
  });
  return {
    fileStem: "sample-4-desert-parcel",
    title: "Sample 4 – Desert Parcel (grouped by service, landscape)",
    layout: "desert",
    carrierName: "Desert Parcel Co. LLC",
    carrierAddress: "Plot 41, Al Qusais Industrial 2, Dubai, UAE",
    customerName: "Al Waha Home Furnishings LLC",
    customerAddress: "Showroom 5, Sheikh Zayed Road, Al Barsha, Dubai, UAE",
    accountNumber: "DPC-004918",
    invoiceNumber: "DPC-INV-88412",
    invoiceDate: "2026-11-05",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    currency: "AED",
    rows,
    pdf: true,
    landscape: true,
    photo: null,
  };
}

/** Gulf Runner: no table – one card per shipment, image only. */
function buildCards(): SampleInvoice {
  const random = seededRandom(20261107);
  const dates = octoberDates(random, 14);
  const rows = dates.map((date) => {
    const zone = weightedZone(random, { Z1: 3, Z2: 6, Z3: 3, Z4: 3, Z6: 2 });
    const service: ServiceLevel = random() < 0.65 ? "express" : "economy";
    const weightKg = pick(random, [0.5, 1, 1.5, 2.5, 3, 5]);
    return makeRow({ random, date, zone, service, weightKg, awbStyle: (r) => `GR-${digits(r, 8)}` });
  });
  return {
    fileStem: "sample-5-gulf-runner",
    title: "Sample 5 – Gulf Runner (shipment cards, image)",
    layout: "cards",
    carrierName: "Gulf Runner Logistics LLC",
    carrierAddress: "Office 702, Al Nahda Tower, Sharjah, UAE",
    customerName: "Noor Al Sahra Cosmetics LLC",
    customerAddress: "Shop 3, Al Majaz 2, Sharjah, UAE",
    accountNumber: "GRL-3391",
    invoiceNumber: "GRL-2610-0207",
    invoiceDate: "2026-11-03",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    currency: "AED",
    rows,
    pdf: false,
    landscape: false,
    photo: { kind: "scan", tiltDegrees: 0, windowHeight: 1500, fileSuffix: "" },
  };
}

const AED_PER_USD = 3.6725;

/** Oryx Express: billed in USD with MM/DD/YYYY dates – the app must flag it as not comparable with AED rates. */
function buildOryx(): SampleInvoice {
  const random = seededRandom(20261108);
  const dates = octoberDates(random, 12);
  const rows = dates.map((date) => {
    const zone = weightedZone(random, { Z2: 5, Z4: 4, Z5: 3 });
    const service: ServiceLevel = random() < 0.7 ? "express" : "economy";
    const weightKg = pick(random, [0.5, 1, 2, 3, 5]);
    const row = makeRow({ random, date, zone, service, weightKg, awbStyle: (r) => `OX${digits(r, 9)}` });
    return { ...row, amount: round2(row.amount / AED_PER_USD) };
  });
  return {
    fileStem: "sample-6-oryx-usd",
    title: "Sample 6 – Oryx Express (US dollars)",
    layout: "oryx",
    carrierName: "Oryx Express Inc.",
    carrierAddress: "1200 Harbor Blvd, Suite 410, Newark, NJ, USA",
    customerName: "Blue Lagoon Electronics LLC",
    customerAddress: "Office 1504, Business Bay, Dubai, UAE",
    accountNumber: "ORX-US-55102",
    invoiceNumber: "OX-1026-4471",
    invoiceDate: "2026-11-01",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    currency: "USD",
    rows,
    pdf: true,
    landscape: false,
    photo: null,
  };
}

export function buildSampleInvoices(): SampleInvoice[] {
  return [buildAlNoor(), buildGulfSpice(), buildFalcon(), buildDesert(), buildCards(), buildOryx()];
}
