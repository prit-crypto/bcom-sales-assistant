import type { ShipmentStatus } from "@/lib/pricing/comparison";

const STATUS: Record<ShipmentStatus, { label: string; className: string }> = {
  compared: { label: "Compared", className: "bg-good-soft text-good" },
  missing_data: { label: "Missing data", className: "bg-warn-soft text-warn" },
  not_eligible: { label: "Not on rate card", className: "bg-band text-muted" },
  excluded: { label: "Excluded", className: "bg-band text-muted" },
};

export function StatusPill({ status }: { status: ShipmentStatus }) {
  const { label, className } = STATUS[status];
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${className}`}>{label}</span>
  );
}
