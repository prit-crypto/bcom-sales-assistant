import type { SampleInvoice } from "../definitions";
import { COUNTRY_NAMES, dateMonthNameFirst, escapeHtml, money, page, subtotal } from "./shared";

/** Gulf Runner layout: no table – each shipment is a small card, two per row. */
export function renderCards(invoice: SampleInvoice): string {
  const cards = invoice.rows
    .map(
      (row, index) => `<div class="card">
        <div class="head"><span>Shipment ${index + 1}</span><span>${dateMonthNameFirst(row.date)}</span></div>
        <div>AWB <b>${row.awb}</b></div>
        <div>${escapeHtml(row.originCity)}, ${COUNTRY_NAMES[row.originCountry]} → ${escapeHtml(row.destinationCity)}, ${COUNTRY_NAMES[row.destinationCountry]}</div>
        <div>${row.service === "express" ? "Express Delivery" : "Saver (economy)"} · ${row.pieces} pc · ${row.weightKg === null ? "weight n/a" : `${row.weightKg} kg`}</div>
        <div class="amount">AED ${money(row.amount)}</div>
      </div>`,
    )
    .join("");
  const net = subtotal(invoice.rows);

  const css = `
  body { font-family: "Verdana", "DejaVu Sans", sans-serif; font-size: 11px; color: #102a43; width: 1180px; padding: 10px 20px; }
  .top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0b7285; padding-bottom: 8px; }
  .brand { font-size: 22px; font-weight: bold; color: #0b7285; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
  .card { border: 1px solid #b9d7dd; border-radius: 6px; padding: 8px 10px; line-height: 1.6; }
  .card .head { display: flex; justify-content: space-between; color: #0b7285; font-weight: bold; }
  .amount { text-align: right; font-weight: bold; font-size: 12px; }
  .sum { margin-top: 12px; text-align: right; font-size: 13px; }`;

  const body = `
  <div class="top">
    <div><div class="brand">GULF RUNNER</div>${escapeHtml(invoice.carrierName)} · ${escapeHtml(invoice.carrierAddress)}</div>
    <div style="text-align:right">Monthly shipment summary · No. ${invoice.invoiceNumber}<br>Issued ${dateMonthNameFirst(invoice.invoiceDate)}<br>For: <b>${escapeHtml(invoice.customerName)}</b><br>Period: ${dateMonthNameFirst(invoice.periodStart)} – ${dateMonthNameFirst(invoice.periodEnd)}</div>
  </div>
  <div class="grid">${cards}</div>
  <div class="sum">Total excl. VAT: <b>AED ${money(net)}</b> · VAT 5% added on the tax invoice</div>`;

  return page(invoice, css, body);
}
