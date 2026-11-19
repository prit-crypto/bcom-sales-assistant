import type { ShipmentStatus } from "@/types/api";

const STATUS: Record<ShipmentStatus, { label: string; className: string }> = {
  compared: { label: "Compared", className: "bg-accent-tint text-accent" },
  missing_data: { label: "Missing data", className: "bg-attention-tint text-attention-ink" },
  not_eligible: { label: "Not on rate card", className: "bg-fill text-secondary" },
  excluded: { label: "Left out", className: "bg-fill text-secondary" },
};

export function StatusPill({ status }: { status: ShipmentStatus }) {
  const { label, className } = STATUS[status];
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${className}`}>
      {label}
    </span>
  );
}
