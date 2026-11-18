export const PROVIDER_IDS = ["mock", "gemini", "openai"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Public, non-secret description of the active AI provider. */
export interface ProviderInfo {
  id: ProviderId;
  label: string;
  model: string | null;
  /** Whether this provider can read images (photos of invoices) */
  readsImages: boolean;
}
