/**
 * Request and response bodies of the backend API, generated from its OpenAPI description
 * (`make openapi` in backend/, then `npm run generate:api`). Only the error envelope is written here,
 * because FastAPI's exception handlers are not part of the OpenAPI description.
 */
import type { PartnerInput, ShipmentComparison as GeneratedShipmentComparison } from "@/lib/api/generated";

export type {
  ComparisonResult,
  ComparisonSummary,
  ConfigResponse,
  CurrencyConversion,
  ExtractResponse,
  GroupTotal,
  MessageResponse,
  ProviderInfo,
  ShipmentComparison,
} from "@/lib/api/generated";

export type ShipmentStatus = GeneratedShipmentComparison["status"];

/** Partner details as the proposal form keeps them: every field present (the API makes some optional). */
export type PartnerDetailsInput = Required<PartnerInput>;

/** Error body returned by every endpoint */
export interface ApiErrorBody {
  error: { code: string; message: string };
}
