import type { SampleInvoice, SampleRow } from "../definitions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const COUNTRY_NAMES: Record<string, string> = {
  AE: "United Arab Emirates", SA: "Saudi Arabia", OM: "Oman", QA: "Qatar", BH: "Bahrain", KW: "Kuwait",
  EG: "Egypt", JO: "Jordan", LB: "Lebanon", IN: "India", PK: "Pakistan", LK: "Sri Lanka", GB: "United Kingdom",
  DE: "Germany", FR: "France", NL: "Netherlands", TR: "Turkey", US: "United States", CA: "Canada",
  SG: "Singapore", HK: "Hong Kong", AU: "Australia", CN: "China", BR: "Brazil",
};

function parts(iso: string) {
  const [year, month, day] = iso.split("-") as [string, string, string];
  return { year, month, day };
}

/** 02 Oct 2026 */
export function dateDayMonthName(iso: string): string {
  const { year, month, day } = parts(iso);
  return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** 02/10/2026 (day first) */
export function dateDmy(iso: string): string {
  const { year, month, day } = parts(iso);
  return `${day}/${month}/${year}`;
}

/** 10/02/2026 (month first, US) */
export function dateMdy(iso: string): string {
  const { year, month, day } = parts(iso);
  return `${month}/${day}/${year}`;
}

/** 2026/10/02 */
export function dateYmd(iso: string): string {
  return iso.replace(/-/g, "/");
}

/** Oct 2, 2026 */
export function dateMonthNameFirst(iso: string): string {
  const { year, month, day } = parts(iso);
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
}

export function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function weight(row: SampleRow): string {
  return row.weightKg === null ? "—" : row.weightKg.toFixed(1);
}

export function subtotal(rows: SampleRow[]): number {
  return Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
}

/** Shown on every sample so nobody mistakes it for a real invoice. */
export const DEMO_BANNER =
  '<div class="demo-banner">SAMPLE INVOICE FOR DEMO PURPOSES ONLY · FICTIONAL COMPANY AND DATA</div>';

export function page(invoice: SampleInvoice, css: string, body: string): string {
  const size = invoice.landscape ? "A4 landscape" : "A4";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(invoice.invoiceNumber)}</title>
<style>
  @page { size: ${size}; margin: 12mm; }
  body { margin: 0; }
  .demo-banner { border: 1px dashed #b08a3e; background: #fff6dc; color: #7a5410; text-align: center;
                 font: 7.5pt Arial, sans-serif; letter-spacing: .04em; padding: 3px; margin-bottom: 10px; }
  table { border-collapse: collapse; width: 100%; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  td, th { white-space: nowrap; }
  .num { text-align: right; }
${css}
</style>
</head>
<body>
${DEMO_BANNER}
${body}
</body>
</html>`;
}
