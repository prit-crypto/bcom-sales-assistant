import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSampleInvoiceText } from "@/lib/invoice/mock-parser";
import { normalizeInvoice } from "@/lib/invoice/normalize";
import { extractPdfPages } from "@/lib/invoice/pdf-text";
import { compareInvoice } from "@/lib/pricing/comparison";
import { buildSampleInvoices } from "../scripts/samples/definitions";

const SAMPLES_DIR = path.resolve(__dirname, "..", "public", "samples");

async function readSample(fileStem: string) {
  const bytes = new Uint8Array(readFileSync(path.join(SAMPLES_DIR, `${fileStem}.pdf`)));
  return normalizeInvoice(parseSampleInvoiceText(await extractPdfPages(bytes)));
}

// Mock mode reads only the SwiftLine layout by design; other layouts need an AI provider.
const swiftlineSamples = buildSampleInvoices().filter((sample) => sample.layout === "swiftline");

describe.each(swiftlineSamples)("mock reader on $fileStem", (expected) => {
  it("reads the header and every shipment line exactly", async () => {
    const invoice = await readSample(expected.fileStem);

    expect(invoice.carrierName).toBe(expected.carrierName);
    expect(invoice.customerName).toBe(expected.customerName);
    expect(invoice.invoiceNumber).toBe(expected.invoiceNumber);
    expect(invoice.invoiceDate).toBe(expected.invoiceDate);
    expect(invoice.periodStart).toBe(expected.periodStart);
    expect(invoice.periodEnd).toBe(expected.periodEnd);
    expect(invoice.currency).toBe("AED");
    expect(invoice.shipments).toHaveLength(expected.rows.length);

    invoice.shipments.forEach((shipment, index) => {
      const row = expected.rows[index]!;
      expect(shipment).toMatchObject({
        date: row.date,
        reference: row.awb,
        originCountry: row.originCountry,
        destinationCountry: row.destinationCountry,
        destinationCity: row.destinationCity,
        weightKg: row.weightKg,
        service: row.service,
        charge: row.amount,
      });
    });
  });
});

describe("sample comparisons", () => {
  it("sample 1 is mostly comparable with one destination off the rate card", async () => {
    const { summary } = compareInvoice(await readSample("sample-1-al-noor-mobile"));
    expect(summary.totalShipments).toBe(46);
    expect(summary.statusCounts.not_eligible).toBe(1);
    expect(summary.saving).toBeGreaterThan(0);
    // UAE domestic lanes are cheaper with the current courier, so some shipments cost more with BCOM.
    expect(summary.higherPricedShipments).toBeGreaterThan(0);
  });

  it("sample 2 flags missing weights, an import and an over-70 kg shipment", async () => {
    const invoice = await readSample("sample-2-gulf-spice");
    const { rows, summary } = compareInvoice(invoice);
    expect(summary.statusCounts.missing_data).toBe(2);
    expect(summary.statusCounts.not_eligible).toBe(2);
    expect(rows.filter((row) => row.status === "not_eligible").map((row) => row.reason)).toEqual([
      expect.stringContaining("Not sent from the UAE"),
      expect.stringContaining("Over 70 kg"),
    ]);
    expect(invoice.warnings.join(" ")).toContain("missing fields");
  });

  it("returns no shipments for text that is not in the sample format", () => {
    expect(parseSampleInvoiceText(["Some other invoice\nTotal 100.00"]).shipments).toHaveLength(0);
  });
});
