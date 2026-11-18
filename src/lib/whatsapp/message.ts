import type { SalesMessageFacts } from "@/lib/ai/types";
import { formatMoney, formatPercent } from "@/lib/format";
import type { ComparisonSummary } from "@/lib/pricing/comparison";

export interface PartnerDetails {
  partnerName: string;
  partnerCompany: string;
  prospectName: string;
  validityDays: number;
}

/** Builds the only facts a WhatsApp message is allowed to use (all numbers come from the calculator). */
export function buildSalesMessageFacts(summary: ComparisonSummary, partner: PartnerDetails): SalesMessageFacts {
  const topSavingRoutes = [...summary.topLanes]
    .filter((lane) => lane.saving > 0)
    .sort((a, b) => b.saving - a.saving)
    .slice(0, 3)
    .map((lane) => lane.label);

  return {
    prospectName: partner.prospectName,
    partnerName: partner.partnerName,
    partnerCompany: partner.partnerCompany,
    monthlySaving: formatMoney(summary.monthlySaving),
    yearlySaving: formatMoney(summary.yearlySaving),
    savingPercent: formatPercent(summary.savingPct),
    comparedShipments: summary.comparedShipments,
    totalShipments: summary.totalShipments,
    topSavingRoutes,
    proposalValidityDays: partner.validityDays,
  };
}

/** Fixed template used by the mock provider (and as a safe fallback). */
export function renderTemplateMessage(facts: SalesMessageFacts): string {
  const routes =
    facts.topSavingRoutes.length > 0 ? `\n\nYour biggest savings are on ${facts.topSavingRoutes.join(", ")}.` : "";

  return [
    `Hello ${facts.prospectName} team 👋`,
    ``,
    `Thank you for sharing your recent courier invoice. I compared ${facts.comparedShipments} of your ${facts.totalShipments} shipments with BCOM Global rates.`,
    ``,
    `Based on last month's shipments, you could save around ${facts.monthlySaving} every month (about ${facts.yearlySaving} a year, ${facts.savingPercent} less) on the same express and economy services.${routes}`,
    ``,
    `I've attached the full proposal. These rates are valid for ${facts.proposalValidityDays} days. Could we have a quick 15-minute call this week to get you set up?`,
    ``,
    `${facts.partnerName}`,
    `${facts.partnerCompany} – BCOM Global partner`,
  ].join("\n");
}

/** WhatsApp click-to-chat link. Without a number, WhatsApp asks the user to pick a chat. */
export function buildWhatsAppLink(message: string, phoneNumber?: string): string {
  const digits = phoneNumber?.replace(/\D/g, "") ?? "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
