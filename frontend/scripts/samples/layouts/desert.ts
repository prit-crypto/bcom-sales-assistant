import type { SampleInvoice, SampleRow } from "../definitions";
import { dateYmd, escapeHtml, money, page, subtotal, weight } from "./shared";

/** Desert Parcel layout: landscape, rows grouped under service headings with section subtotals. */
export function renderDesert(invoice: SampleInvoice): string {
  const section = (title: string, rows: SampleRow[]) => `
    <tr class="section"><td colspan="7">${title}</td></tr>
    ${rows
      .map(
        (row) => `<tr>
          <td>${dateYmd(row.date)}</td>
          <td>${row.awb}</td>
          <td>${escapeHtml(row.originCity)}</td>
          <td>${escapeHtml(row.destinationCity)} (${row.destinationCountry})</td>
          <td class="num">${row.pieces}</td>
          <td class="num">${weight(row)}</td>
          <td class="num">${money(row.amount)}</td>
        </tr>`,
      )
      .join("")}
    <tr class="sub"><td colspan="6">Subtotal – ${title}</td><td class="num">${money(subtotal(rows))}</td></tr>`;

  const express = invoice.rows.filter((row) => row.service === "express");
  const economy = invoice.rows.filter((row) => row.service === "economy");
  const net = subtotal(invoice.rows);
  const vat = Math.round(net * 0.05 * 100) / 100;

  const css = `
  body { font-family: "Trebuchet MS", "DejaVu Sans", sans-serif; font-size: 8.6pt; color: #1f2a1f; }
  .bar { background: #8a5a19; color: #fff; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; }
  .bar b { font-size: 15pt; letter-spacing: .05em; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
  .meta div { border: 1px solid #d9c9ad; padding: 5px 7px; background: #fbf7f0; }
  .meta small { display: block; color: #8a5a19; font-size: 7pt; text-transform: uppercase; }
  th { background: #efe4d1; text-align: left; padding: 4px 6px; font-size: 7.8pt; }
  td { padding: 3px 6px; border-bottom: 1px solid #eee3d2; }
  tr.section td { background: #8a5a19; color: #fff; font-weight: bold; letter-spacing: .06em; padding: 4px 6px; }
  tr.sub td { font-weight: bold; background: #fbf7f0; border-bottom: 2px solid #d9c9ad; }
  .grand { width: 35%; margin: 10px 0 0 auto; }
  .grand td { border: none; }`;

  const body = `
  <div class="bar"><b>DESERT PARCEL CO.</b><span>Commercial Invoice ${invoice.invoiceNumber}</span></div>
  <div class="meta">
    <div><small>Billed to</small>${escapeHtml(invoice.customerName)}</div>
    <div><small>Account</small>${invoice.accountNumber}</div>
    <div><small>Invoice date</small>${dateYmd(invoice.invoiceDate)}</div>
    <div><small>Service period</small>${dateYmd(invoice.periodStart)} – ${dateYmd(invoice.periodEnd)}</div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Tracking no.</th><th>From</th><th>To</th><th class="num">Pieces</th><th class="num">Billed kg</th><th class="num">Amount (AED)</th></tr></thead>
    <tbody>
      ${section("EXPRESS SERVICES", express)}
      ${section("ECONOMY SERVICES", economy)}
    </tbody>
  </table>
  <table class="grand">
    <tr><td>Total before VAT</td><td class="num">${money(net)}</td></tr>
    <tr><td>VAT 5%</td><td class="num">${money(vat)}</td></tr>
    <tr><td><b>Grand total AED</b></td><td class="num"><b>${money(net + vat)}</b></td></tr>
  </table>
  <p style="font-size:7.4pt;color:#6b5a40">${escapeHtml(invoice.carrierName)} · ${escapeHtml(invoice.carrierAddress)} · Amounts include fuel surcharge.</p>`;

  return page(invoice, css, body);
}
