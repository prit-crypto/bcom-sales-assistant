import type { SampleInvoice } from "./definitions";
import { renderCards } from "./layouts/cards";
import { renderDesert } from "./layouts/desert";
import { renderFalcon } from "./layouts/falcon";
import { renderOryx } from "./layouts/oryx";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 2026-10-02 -> "02 Oct 2026" (the format the mock parser reads) */
export function formatInvoiceDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
}

function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Renders a fictional courier invoice as a printable A4 HTML page. */
export function renderInvoiceHtml(invoice: SampleInvoice): string {
  const subtotal = invoice.rows.reduce((sum, row) => sum + row.amount, 0);
  const vat = Math.round(subtotal * 0.05 * 100) / 100;

  const rows = invoice.rows
    .map(
      (row) => `
      <tr>
        <td>${formatInvoiceDate(row.date)}</td>
        <td>${row.awb}</td>
        <td>${escapeHtml(row.originCity)}, ${row.originCountry}</td>
        <td>${escapeHtml(row.destinationCity)}, ${row.destinationCountry}</td>
        <td>${row.serviceName}</td>
        <td class="num">${row.pieces}</td>
        <td class="num">${row.weightKg === null ? "—" : row.weightKg.toFixed(1)}</td>
        <td class="num">${money(row.amount)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${invoice.invoiceNumber}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 8.6pt; color: #1d2733; margin: 0; }
  .banner { background: #fff4d6; border: 1px dashed #c8962e; color: #7a5410; text-align: center;
            font-size: 7.5pt; padding: 3px; margin-bottom: 10px; letter-spacing: .04em; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0e5a8a; padding-bottom: 8px; }
  .brand { font-size: 17pt; font-weight: 700; color: #0e5a8a; }
  .brand small { display: block; font-size: 7.5pt; font-weight: 400; color: #5b6673; }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 14pt; letter-spacing: .08em; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }
  .box { border: 1px solid #d5dbe2; padding: 6px 8px; }
  .box b { display: block; font-size: 7pt; color: #5b6673; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #0e5a8a; color: #fff; text-align: left; font-weight: 600; padding: 4px 5px; font-size: 7.6pt; white-space: nowrap; }
  td { padding: 3.2px 5px; border-bottom: 1px solid #e3e8ee; white-space: nowrap; font-size: 8.2pt; }
  tr { break-inside: avoid; }
  tr:nth-child(even) td { background: #f6f8fa; }
  .num { text-align: right; }
  .totals { margin-left: auto; width: 46%; margin-top: 10px; }
  .totals td { border: none; padding: 2px 5px; }
  .totals tr.grand td { font-weight: 700; border-top: 2px solid #1d2733; font-size: 9.5pt; }
  .foot { margin-top: 14px; font-size: 7pt; color: #5b6673; }
</style>
</head>
<body>
  <div class="banner">SAMPLE INVOICE FOR DEMO PURPOSES ONLY · FICTIONAL COMPANY AND DATA</div>
  <div class="head">
    <div class="brand">SwiftLine Express<small>${escapeHtml(invoice.carrierName)} · ${escapeHtml(invoice.carrierAddress)}</small></div>
    <div class="doc"><h1>TAX INVOICE</h1>Invoice No: ${invoice.invoiceNumber}<br>Invoice Date: ${formatInvoiceDate(invoice.invoiceDate)}</div>
  </div>
  <div class="meta">
    <div class="box"><b>Bill to</b>${escapeHtml(invoice.customerName)}<br>${escapeHtml(invoice.customerAddress)}<br>Account No: ${invoice.accountNumber}</div>
    <div class="box"><b>Billing details</b>Billing Period: ${formatInvoiceDate(invoice.periodStart)} - ${formatInvoiceDate(invoice.periodEnd)}<br>Currency: ${invoice.currency}<br>Shipments: ${invoice.rows.length}</div>
  </div>
  <table>
    <thead>
      <tr><th>Date</th><th>AWB No.</th><th>Origin</th><th>Destination</th><th>Service</th><th class="num">Pcs</th><th class="num">Weight (kg)</th><th class="num">Amount (${invoice.currency})</th></tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal (excl. VAT)</td><td class="num">${money(subtotal)}</td></tr>
    <tr><td>VAT 5%</td><td class="num">${money(vat)}</td></tr>
    <tr class="grand"><td>Total due (${invoice.currency})</td><td class="num">${money(subtotal + vat)}</td></tr>
  </table>
  <div class="foot">Amounts include fuel surcharge and exclude VAT unless stated. Weight shown is chargeable weight. Payment due within 30 days.</div>
</body>
</html>`;
}

/** Renders a sample invoice in its courier's own layout. */
export function renderSampleHtml(invoice: SampleInvoice): string {
  switch (invoice.layout) {
    case "swiftline":
      return renderInvoiceHtml(invoice);
    case "falcon":
      return renderFalcon(invoice);
    case "desert":
      return renderDesert(invoice);
    case "cards":
      return renderCards(invoice);
    case "oryx":
      return renderOryx(invoice);
  }
}
