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

/** A moment in the past, short: "Today 14:05", "Yesterday 09:12", "12 Nov", "12 Nov 2025". */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const when = new Date(iso);
  const time = when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(when)) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  const day = `${String(when.getDate()).padStart(2, "0")} ${MONTHS[when.getMonth()]}`;
  return when.getFullYear() === now.getFullYear() ? day : `${day} ${when.getFullYear()}`;
}

/** A calendar date relative to today: "today", "tomorrow", "in 3 days", "2 days ago", else "02 Oct 2026". */
export function formatDueDate(iso: string, now: Date = new Date()): string {
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(year!, month! - 1, day!).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((target - today) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 1 && days <= 7) return `in ${days} days`;
  if (days < -1 && days >= -7) return `${-days} days ago`;
  return formatDate(iso);
}
