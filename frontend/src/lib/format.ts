/** "AED 2,920" (no decimals) – for headline numbers. */
export function formatMoney(value: number, currency = "AED"): string {
  return `${currency} ${Math.round(value).toLocaleString("en-US")}`;
}

/** "AED 2,920.50" – for table cells. */
export function formatMoneyExact(value: number, currency = "AED"): string {
  return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 12.345 -> "12.3%" */
export function formatPercent(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 2026-10-02 -> "02 Oct 2026" */
export function formatDate(iso: string | null): string {
  if (!iso) return "–";
  const [year, month, day] = iso.split("-");
  const monthName = MONTHS[Number(month) - 1];
  return monthName ? `${day} ${monthName} ${year}` : iso;
}
