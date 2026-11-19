import type { SampleInvoice } from "../definitions";
import { COUNTRY_NAMES, dateMdy, escapeHtml, money, page, subtotal, weight } from "./shared";

/** Oryx Express layout: US-style invoice in USD with MM/DD/YYYY dates. */
export function renderOryx(invoice: SampleInvoice): string {
  const rows = invoice.rows
    .map(
      (row) => `<tr>
        <td>${dateMdy(row.date)}</td>
        <td>${row.awb}</td>
        <td>${escapeHtml(row.originCity)}, ${row.originCountry}</td>
        <td>${escapeHtml(row.destinationCity)}, ${COUNTRY_NAMES[row.destinationCountry] ?? row.destinationCountry}</td>
        <td>${row.service === "express" ? "Priority International" : "Economy International"}</td>
        <td class="num">${weight(row)}</td>
        <td class="num">$${money(row.amount)}</td>
      </tr>`,
    )
    .join("");
  const net = subtotal(invoice.rows);

  const css = `
  body { font-family: "Helvetica", "Liberation Sans", Arial, sans-serif; font-size: 9pt; color: #111; }
  .head { display: flex; justify-content: space-between; }
  .brand { font-size: 20pt; font-weight: 800; font-style: italic; color: #1d4ed8; }
  .box { border: 1px solid #ccc; padding: 6px 8px; margin: 10px 0; display: flex; justify-content: space-between; }
  th { border-bottom: 2px solid #1d4ed8; text-align: left; padding: 4px; }
  td { padding: 4px; border-bottom: 1px solid #e5e7eb; }
  .total { text-align: right; margin-top: 10px; font-size: 11pt; }`;

  const body = `
  <div class="head">
    <div><div class="brand">ORYX EXPRESS</div>${escapeHtml(invoice.carrierName)}<br>${escapeHtml(invoice.carrierAddress)}</div>
    <div style="text-align:right"><b>INVOICE</b> ${invoice.invoiceNumber}<br>Date: ${dateMdy(invoice.invoiceDate)}<br>Account: ${invoice.accountNumber}</div>
  </div>
  <div class="box">
    <div><b>Bill to:</b> ${escapeHtml(invoice.customerName)}, ${escapeHtml(invoice.customerAddress)}</div>
    <div><b>Billing period:</b> ${dateMdy(invoice.periodStart)} – ${dateMdy(invoice.periodEnd)}</div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Airbill</th><th>Origin</th><th>Destination</th><th>Service</th><th class="num">Weight (kg)</th><th class="num">Charges (USD)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total">Total due: <b>USD $${money(net)}</b> (no sales tax applied)</div>
  <p style="font-size:7.5pt;color:#555">All amounts in U.S. dollars. Dates are MM/DD/YYYY.</p>`;

  return page(invoice, css, body);
}
