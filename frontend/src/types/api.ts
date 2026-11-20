/**
 * Request and response bodies of the backend API, generated from its OpenAPI description
 * (`make openapi` in backend/, then `npm run generate:api`). Only the error envelope is written here,
 * because FastAPI's exception handlers are not part of the OpenAPI description.
 */
import type {
  PartnerInput,
  ScenarioInput,
  ShipmentComparison as GeneratedShipmentComparison,
} from "@/lib/api/generated";

export type {
  CheckResponse,
  ComparisonResult,
  ComparisonSummary,
  ConfigResponse,
  CurrencyConversion,
  EmailDraft,
  ExtractResponse,
  GroupTotal,
  InvoiceCheck,
  MessageResponse,
  ProposalDetail,
  ProposalItem,
  ProposalList,
  ProviderInfo,
  PublicProposal,
  ShareLink,
  ShipmentComparison,
  TransitTradeoff,
} from "@/lib/api/generated";

export type ProposalStatus = import("@/lib/api/generated").ProposalItem["status"];

export type ShipmentStatus = GeneratedShipmentComparison["status"];

/** Partner details as the proposal form keeps them: every field present (the API makes some optional). */
export type PartnerDetailsInput = Required<PartnerInput>;

export type CustomerLanguage = PartnerDetailsInput["language"];

/** A what-if on the savings: every field present, as the screens keep it. */
export type Scenario = Required<ScenarioInput>;

/** Today's volume, same services: the comparison everything starts from. */
export const LIKE_FOR_LIKE: Scenario = { volume_factor: 1, economy_for_non_urgent: false };

export function isLikeForLike(scenario: Scenario): boolean {
  return scenario.volume_factor === 1 && !scenario.economy_for_non_urgent;
}

/** Error body returned by every endpoint */
export interface ApiErrorBody {
  error: { code: string; message: string };
}
