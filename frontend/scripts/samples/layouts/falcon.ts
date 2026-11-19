import type { SampleInvoice } from "../definitions";
import { COUNTRY_NAMES, dateDmy, escapeHtml, money, page, subtotal, weight } from "./shared";

/** Product codes printed instead of service names (with a legend). */
function productCode(service: "express" | "economy", weightKg: number | null): string {
  if (service === "economy") return "ECO";
  return weightKg !== null && weightKg <= 0.5 ? "EXP-DOX" : "EXP-WPX";
}

/**
 * Falcon Air layout: serif fonts, DD/MM/YYYY, full country names, product codes,
 * actual vs chargeable weight, freight + fuel + total. Origin appears only in the header.
 */
export function renderFalcon(invoice: SampleInvoice): string {
  const rows = invoice.rows
    .map((row, index) => {
      const fuel = Math.round(row.amount * (0.16 / 1.16) * 100) / 100;
      const freight = Math.round((row.amount - fuel) * 100) / 100;
      const actual = row.weightKg === null ? "—" : Math.max(0.2, row.weightKg * 0.82).toFixed(1);
      return `<tr>
        <td>${index + 1}</td>
        <td>${row.awb}</td>
        <td>${dateDmy(row.date)}</td>
        <td>${escapeHtml(row.destinationCity)}</td>
        <td>${COUNTRY_NAMES[row.destinationCountry] ?? row.destinationCountry}</td>
        <td>${productCode(row.service, row.weightKg)}</td>
        <td class="num">${actual}</td>
        <td class="num">${weight(row)}</td>
        <td class="num">${money(freight)}</td>
        <td class="num">${money(fuel)}</td>
        <td class="num"><b>${money(row.amount)}</b></td>
      </tr>`;
    })
    .join("");
  const net = subtotal(invoice.rows);
  const vat = Math.round(net * 0.05 * 100) / 100;

  const css = `
  body { font-family: Georgia, "DejaVu Serif", serif; font-size: 8.4pt; color: #222; }
  .top { display: flex; justify-content: space-between; border-bottom: 3px double #7b1e1e; padding-bottom: 6px; }
  .logo { font-size: 18pt; color: #7b1e1e; font-weight: bold; letter-spacing: .03em; }
  .title { text-align: right; font-size: 12pt; font-weight: bold; }
  .info { display: flex; gap: 30px; margin: 10px 0; font-size: 8.4pt; }
  .info div { flex: 1; }
  th { border-top: 1px solid #222; border-bottom: 1px solid #222; padding: 4px; text-align: left; font-size: 7.6pt; }
  td { padding: 3px 4px; border-bottom: 1px dotted #999; }
  .totals { width: 40%; margin: 10px 0 0 auto; }
  .totals td { border: none; padding: 2px 4px; }
  .legend { margin-top: 12px; font-size: 7.4pt; color: #555; }`;

  const body = `
  <div class="top">
    <div><div class="logo">FALCON AIR COURIER</div>${escapeHtml(invoice.carrierName)}, ${escapeHtml(invoice.carrierAddress)}</div>
    <div class="title">STATEMENT OF ACCOUNT<br><span style="font-weight:normal;font-size:8.4pt">Ref ${invoice.invoiceNumber} · Issued ${dateDmy(invoice.invoiceDate)}</span></div>
  </div>
  <div class="info">
    <div><b>Customer:</b> ${escapeHtml(invoice.customerName)}<br>${escapeHtml(invoice.customerAddress)}<br>A/C ${invoice.accountNumber}</div>
    <div><b>Statement period:</b> ${dateDmy(invoice.periodStart)} to ${dateDmy(invoice.periodEnd)}<br><b>All shipments dispatched from:</b> Dubai, U.A.E.<br><b>Currency:</b> UAE Dirham (AED)</div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Waybill</th><th>Ship date</th><th>Consignee city</th><th>Country</th><th>Product</th><th class="num">Actual wt</th><th class="num">Chg wt (kg)</th><th class="num">Freight</th><th class="num">Fuel sur.</th><th class="num">Total excl. VAT</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Net amount</td><td class="num">${money(net)}</td></tr>
    <tr><td>VAT @ 5%</td><td class="num">${money(vat)}</td></tr>
    <tr><td><b>Amount payable (AED)</b></td><td class="num"><b>${money(net + vat)}</b></td></tr>
  </table>
  <div class="legend">Product codes: EXP-DOX = Express documents · EXP-WPX = Express parcels · ECO = Economy. Dates are shown as DD/MM/YYYY. Charges are billed on chargeable weight.</div>`;

  return page(invoice, css, body);
}
