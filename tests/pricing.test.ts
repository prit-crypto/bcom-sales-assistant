import { describe, expect, it } from "vitest";
import { quoteShipment, roundUpToHalfKg } from "@/lib/pricing/calculator";
import { compareInvoice, getMonthlyFactor } from "@/lib/pricing/comparison";
import type { InvoiceData, Shipment } from "@/types/invoice";

function shipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "s1",
    date: "2026-10-02",
    reference: "SWL1",
    originCity: "Dubai",
    originCountry: "AE",
    destinationCity: "Riyadh",
    destinationCountry: "SA",
    weightKg: 2,
    pieces: 1,
    service: "express",
    charge: 120,
    included: true,
    ...overrides,
  };
}

function invoice(shipments: Shipment[], overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    carrierName: "SwiftLine Express",
    customerName: "Test Co",
    invoiceNumber: "INV-1",
    invoiceDate: "2026-11-01",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    currency: "AED",
    shipments,
    warnings: [],
    ...overrides,
  };
}

describe("roundUpToHalfKg", () => {
  it("rounds up to the next half kilo", () => {
    expect(roundUpToHalfKg(0.2)).toBe(0.5);
    expect(roundUpToHalfKg(1.5)).toBe(1.5);
    expect(roundUpToHalfKg(1.51)).toBe(2);
  });
});

describe("quoteShipment", () => {
  it("prices a GCC express shipment per half kilo", () => {
    // Z2 express: 62 for the first 0.5 kg + 3 x 11 for the next 1.5 kg
    const quote = quoteShipment({ originCountry: "AE", destinationCountry: "SA", weightKg: 2, service: "express" });
    expect(quote).toMatchObject({ eligible: true, zone: "Z2", price: 95, billedWeightKg: 2 });
  });

  it("uses the per-kg rate above 30 kg", () => {
    // Z4 economy at 30 kg: 82 + 59 x 15 = 967; 32.2 kg bills as 33 kg -> +3 x 25
    const quote = quoteShipment({ originCountry: "AE", destinationCountry: "GB", weightKg: 32.2, service: "economy" });
    expect(quote).toMatchObject({ eligible: true, price: 1042 });
  });

  it("rejects imports, unknown destinations and heavy shipments", () => {
    expect(quoteShipment({ originCountry: "CN", destinationCountry: "AE", weightKg: 1, service: "express" }).eligible).toBe(false);
    expect(quoteShipment({ originCountry: "AE", destinationCountry: "BR", weightKg: 1, service: "express" }).eligible).toBe(false);
    expect(quoteShipment({ originCountry: "AE", destinationCountry: "SA", weightKg: 85, service: "express" }).eligible).toBe(false);
  });
});

describe("getMonthlyFactor", () => {
  it("treats 25-35 days as one month and scales other periods", () => {
    expect(getMonthlyFactor(31)).toBe(1);
    expect(getMonthlyFactor(null)).toBe(1);
    expect(getMonthlyFactor(15)).toBe(2);
  });
});

describe("compareInvoice", () => {
  it("adds up savings only for compared shipments and counts coverage", () => {
    const result = compareInvoice(
      invoice([
        shipment({ id: "a", charge: 120 }), // BCOM 95 -> saves 25
        shipment({ id: "b", weightKg: null }), // missing weight
        shipment({ id: "c", destinationCountry: "BR", charge: 300 }), // not on card
        shipment({ id: "d", included: false }), // excluded
        // Z1 express 2 kg: 18 + 3 x 2.5 = 25.5 -> costs 5.5 more than the current 20
        shipment({ id: "e", destinationCountry: "AE", destinationCity: "Abu Dhabi", charge: 20 }),
      ]),
    );

    expect(result.summary.statusCounts).toEqual({ compared: 2, missing_data: 1, not_eligible: 1, excluded: 1 });
    expect(result.summary.currentSpend).toBe(140);
    expect(result.summary.proposedSpend).toBe(120.5);
    expect(result.summary.saving).toBe(19.5);
    expect(result.summary.higherPricedShipments).toBe(1);
    expect(result.summary.shipmentCoveragePct).toBe(40);
    // Monthly saving 19.5 rounds to 20; yearly is exactly 12 x the shown monthly figure.
    expect(result.summary.monthlySaving).toBe(20);
    expect(result.summary.yearlySaving).toBe(240);
    expect(result.rows[1]?.missingFields).toEqual(["weightKg"]);
  });

  it("does not compare invoices in another currency", () => {
    const result = compareInvoice(invoice([shipment()], { currency: "USD" }));
    expect(result.summary.comparedShipments).toBe(0);
    expect(result.rows[0]?.status).toBe("not_eligible");
  });
});
