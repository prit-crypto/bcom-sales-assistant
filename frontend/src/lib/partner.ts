import type { PartnerDetailsInput } from "@/types/api";

/** A booking link is used only once it is a complete https:// address; until then the PDF goes without it. */
export function usableBookingUrl(value: string): string {
  const trimmed = value.trim();
  return /^https:\/\/[^\s<>"']{3,300}$/.test(trimmed) ? trimmed : "";
}

/** What the backend receives: the half-typed booking link is left out instead of failing the PDF. */
export function partnerForRequest(partner: PartnerDetailsInput): PartnerDetailsInput {
  return { ...partner, booking_url: usableBookingUrl(partner.booking_url) };
}
