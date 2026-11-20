/**
 * Several months in one proposal: the backend numbers each combined invoice's shipments "m1-…", "m2-…"
 * (in the order the files were added). These read that numbering back.
 */
import type { InvoiceData } from "@/types/invoice";

/** Invoices from up to this many months can go into one proposal. */
export const MAX_INVOICES = 3;

/** 1, 2 or 3 for a row of a combined invoice; null for a single invoice. */
export function partOf(shipmentId: string): number | null {
  const match = /^m(\d)-/.exec(shipmentId);
  return match ? Number(match[1]) : null;
}

/** How many invoices are combined in this one (1 for a single invoice). */
export function invoiceParts(invoice: InvoiceData): number {
  return invoice.shipments.reduce((most, shipment) => Math.max(most, partOf(shipment.id) ?? 1), 1);
}
