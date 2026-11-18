import type { InvoiceData } from "./invoice";
import type { ProviderInfo } from "./provider";

/** GET /api/config */
export interface ConfigResponse {
  provider: ProviderInfo | null;
  /** Set when the selected provider is not configured correctly */
  problem: string | null;
  maxUploadMb: number;
}

/** POST /api/extract */
export interface ExtractResponse {
  provider: ProviderInfo;
  invoice: InvoiceData;
}

/** POST /api/message */
export interface MessageResponse {
  message: string;
  /** "ai" when written by the AI provider, "template" for the mock or the fallback */
  source: "ai" | "template";
  notice: string | null;
}

/** Error body returned by every API route */
export interface ApiErrorBody {
  error: { code: string; message: string };
}

/** Partner details entered on the proposal step (sent to /api/proposal and /api/message) */
export interface PartnerDetailsInput {
  partnerName: string;
  partnerCompany: string;
  partnerPhone: string;
  partnerEmail: string;
  prospectName: string;
  validityDays: number;
}
