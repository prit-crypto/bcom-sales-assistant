import type { ProviderInfo } from "@/types/provider";
import type { RawInvoice } from "./schema";

/** An uploaded invoice file. */
export interface InvoiceFile {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}

/** The numbers and names a WhatsApp message may use. All money values are pre-formatted strings. */
export interface SalesMessageFacts {
  prospectName: string;
  partnerName: string;
  partnerCompany: string;
  monthlySaving: string;
  yearlySaving: string;
  savingPercent: string;
  comparedShipments: number;
  totalShipments: number;
  topSavingRoutes: string[];
  proposalValidityDays: number;
}

/** Every AI engine (or the mock) implements this interface. */
export interface AIProvider {
  info: ProviderInfo;
  /** Reads a courier invoice into the shared raw schema (validated by the caller). */
  extractInvoice(file: InvoiceFile): Promise<RawInvoice>;
  /** Writes a WhatsApp message from pre-computed facts. */
  writeSalesMessage(facts: SalesMessageFacts): Promise<string>;
}
