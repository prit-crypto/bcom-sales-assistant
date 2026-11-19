/** Request and response bodies of the backend API (see backend/app/schemas). */
import type { InvoiceData, RequiredShipmentField, ServiceLevel } from "./invoice";

export type ProviderId = "mock" | "gemini" | "openai";

/** Public, non-secret description of the active AI provider. */
export interface ProviderInfo {
  id: ProviderId;
  label: string;
  model: string | null;
  /** Whether this provider can read images (photos of invoices) */
  reads_images: boolean;
}

/** GET /config */
export interface ConfigResponse {
  provider: ProviderInfo | null;
  /** Set when the selected provider is not configured correctly */
  problem: string | null;
  max_upload_mb: number;
}

/** POST /invoices/extract */
export interface ExtractResponse {
  provider: ProviderInfo;
  invoice: InvoiceData;
}

/** POST /messages */
export interface MessageResponse {
  message: string;
  /** "ai" when written by the AI provider, "template" for the mock or the fallback */
  source: "ai" | "template";
  notice: string | null;
}

/** Error body returned by every endpoint */
export interface ApiErrorBody {
  error: { code: string; message: string };
}

/** Partner details entered on the proposal step (sent to /proposals and /messages) */
export interface PartnerDetailsInput {
  partner_name: string;
  partner_company: string;
  partner_phone: string;
  partner_email: string;
  prospect_name: string;
  validity_days: number;
}

/** POST /comparisons */
export type ShipmentStatus = "compared" | "missing_data" | "not_eligible" | "excluded";

export interface ShipmentComparison {
  shipment_id: string;
  status: ShipmentStatus;
  /** Why the shipment was not compared (null when compared) */
  reason: string | null;
  missing_fields: RequiredShipmentField[];
  current: number | null;
  proposed: number | null;
  saving: number | null;
  zone: string | null;
  zone_label: string | null;
  service: ServiceLevel | null;
  service_label: string | null;
  billed_weight_kg: number | null;
  transit_time: string | null;
}

export interface GroupTotal {
  key: string;
  label: string;
  shipments: number;
  current: number;
  proposed: number;
  saving: number;
}

export interface ComparisonSummary {
  currency: string;
  total_shipments: number;
  compared_shipments: number;
  shipment_coverage_pct: number;
  invoice_spend: number;
  current_spend: number;
  proposed_spend: number;
  saving: number;
  saving_pct: number;
  spend_coverage_pct: number;
  /** Days in the billing period on the invoice; null when it is not known */
  period_days: number | null;
  monthly_factor: number;
  monthly_current: number;
  monthly_proposed: number;
  /** Negative when BCOM costs more */
  monthly_saving: number;
  yearly_saving: number;
  /** True only when BCOM is cheaper overall, so there is a saving to propose */
  has_saving: boolean;
  status_counts: Record<ShipmentStatus, number>;
  higher_priced_shipments: number;
  by_zone: GroupTotal[];
  by_service: GroupTotal[];
  top_lanes: GroupTotal[];
  assumptions: string[];
}

export interface ComparisonResult {
  rows: ShipmentComparison[];
  summary: ComparisonSummary;
}
