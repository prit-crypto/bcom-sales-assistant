/**
 * The partner's own details ("Prepared by", logo, booking link, language, validity), remembered on this
 * device so every new proposal starts filled in. There are no accounts yet, so this lives in localStorage;
 * every access is guarded because storage can be blocked. Nothing is filled in until the partner types it.
 */
import type { PartnerDetailsInput } from "@/types/api";

const KEY = "bcom-partner-defaults-v1";

export type PartnerDefaults = Omit<PartnerDetailsInput, "prospect_name">;

/** A first visit starts with empty fields; the partner fills them in on the proposal step. */
export const EMPTY_PARTNER: PartnerDefaults = {
  partner_name: "",
  partner_company: "",
  partner_phone: "",
  partner_email: "",
  validity_days: 30,
  language: "en",
  booking_url: "",
  partner_logo: null,
};

export function loadPartnerDefaults(): PartnerDefaults {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_PARTNER;
    return { ...EMPTY_PARTNER, ...(JSON.parse(raw) as Partial<PartnerDefaults>) };
  } catch {
    return EMPTY_PARTNER;
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
