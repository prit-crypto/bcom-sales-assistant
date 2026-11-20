/**
 * The partner's own details ("Prepared by", logo, booking link, language, validity), remembered on this
 * device so every new proposal starts filled in. There are no accounts yet, so this lives in localStorage;
 * every access is guarded because storage can be blocked.
 */
import type { PartnerDetailsInput } from "@/types/api";

const KEY = "bcom-partner-defaults-v1";

export type PartnerDefaults = Omit<PartnerDetailsInput, "prospect_name">;

/** Clearly placeholder details for a first visit; edited on the proposal step. */
export const EXAMPLE_PARTNER: PartnerDefaults = {
  partner_name: "Rahul Mehta",
  partner_company: "Sharjah Logistics Partners",
  partner_phone: "+971 50 000 0000",
  partner_email: "rahul@example.com",
  validity_days: 30,
  language: "en",
  booking_url: "",
  partner_logo: null,
};

export function loadPartnerDefaults(): PartnerDefaults {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EXAMPLE_PARTNER;
    return { ...EXAMPLE_PARTNER, ...(JSON.parse(raw) as Partial<PartnerDefaults>) };
  } catch {
    return EXAMPLE_PARTNER;
  }
}

export function savePartnerDefaults(partner: PartnerDetailsInput): void {
  const defaults: Partial<PartnerDetailsInput> = { ...partner };
  delete defaults.prospect_name;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(defaults));
  } catch {
    // Full or blocked storage: the next proposal starts from the example details.
  }
}
