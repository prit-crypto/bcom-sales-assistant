import type { ProposalStatus } from "@/types/api";

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  won: "Won",
  lost: "Lost",
};

const STYLE: Record<ProposalStatus, string> = {
  draft: "bg-fill text-secondary",
  sent: "bg-accent-tint text-accent",
  won: "bg-accent text-on-accent",
  lost: "bg-bad-tint text-bad",
};

export function ProposalStatusPill({ status }: { status: ProposalStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
