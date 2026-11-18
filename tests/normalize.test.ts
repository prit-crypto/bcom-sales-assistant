import { describe, expect, it } from "vitest";
import {
  normalizeCountry,
  normalizeDate,
  normalizeInvoice,
  normalizeNumber,
  normalizeService,
} from "@/lib/invoice/normalize";
import { buildSalesMessageFacts, buildWhatsAppLink, renderTemplateMessage } from "@/lib/whatsapp/message";
import { compareInvoice } from "@/lib/pricing/comparison";

describe("normalisers", () => {
  it("cleans countries, dates, numbers and services from AI output", () => {
    expect(normalizeCountry("sa")).toBe("SA");
    expect(normalizeCountry("United Arab Emirates")).toBe("AE");
    expect(normalizeCountry("Atlantis")).toBeNull();
    expect(normalizeDate("2 October 2026")).toBe("2026-10-02");
    expect(normalizeDate("02-Oct-2026")).toBe("2026-10-02");
    expect(normalizeDate("yesterday")).toBeNull();
    expect(normalizeNumber("1,485.50")).toBe(1485.5);
    expect(normalizeNumber("—")).toBeNull();
    expect(normalizeNumber(0)).toBeNull();
    expect(normalizeService("Express Worldwide")).toBe("express");
    expect(normalizeService("Economy Select")).toBe("economy");
    expect(normalizeService("EXP-WPX")).toBe("express");
    expect(normalizeService("ECO")).toBe("economy");
    expect(normalizeService("Saver (economy)")).toBe("economy");
    expect(normalizeService("Mystery")).toBeNull();
  });

  it("builds a message and WhatsApp link only from calculated facts", () => {
    const invoice = normalizeInvoice({
      carrierName: "SwiftLine Express LLC",
      customerName: "Test Co",
      invoiceNumber: "1",
      invoiceDate: "2026-11-01",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      currency: "AED",
      notes: [],
      shipments: [
        {
          date: "2026-10-02", reference: "A", originCity: "Dubai", originCountry: "AE",
          destinationCity: "Riyadh", destinationCountry: "SA", weightKg: 2, pieces: 1,
          service: "Express Worldwide", charge: 120,
        },
      ],
    });
    const facts = buildSalesMessageFacts(compareInvoice(invoice).summary, {
      partnerName: "Rahul",
      partnerCompany: "BCOM Sharjah",
      prospectName: "Test Co",
      validityDays: 30,
    });
    expect(facts.monthlySaving).toBe("AED 25");
    expect(facts.yearlySaving).toBe("AED 300");
    const message = renderTemplateMessage(facts);
    expect(message).toContain("AED 25 every month");
    expect(buildWhatsAppLink(message, "+971 50 123 4567")).toMatch(/^https:\/\/wa\.me\/971501234567\?text=/);
  });
});

describe("currency check", () => {
  it("warns straight away when the invoice is not in AED", () => {
    const invoice = normalizeInvoice({
      carrierName: "Oryx Express Inc.", customerName: "Test Co", invoiceNumber: "1", invoiceDate: null,
      periodStart: null, periodEnd: null, currency: "usd", notes: [], shipments: [],
    });
    expect(invoice.currency).toBe("USD");
    expect(invoice.warnings.join(" ")).toContain("This invoice is in USD");
  });
});
