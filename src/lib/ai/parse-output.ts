import { AppError } from "@/lib/http/errors";
import { rawInvoiceSchema, type RawInvoice } from "./schema";

/** Parses and validates the JSON an AI provider returned. */
export function parseRawInvoiceJson(text: string | undefined | null, providerLabel: string): RawInvoice {
  if (!text) {
    throw new AppError(`${providerLabel} returned an empty answer. Please try again.`, 502, "ai_empty_response");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AppError(`${providerLabel} returned data that is not valid JSON. Please try again.`, 502, "ai_bad_json");
  }
  const parsed = rawInvoiceSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError(
      `${providerLabel} returned data in an unexpected shape. Please try again.`,
      502,
      "ai_bad_shape",
    );
  }
  return parsed.data;
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
