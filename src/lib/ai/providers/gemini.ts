import "server-only";
import { GoogleGenAI, ThinkingLevel, type GenerateContentParameters } from "@google/genai";
import { AppError } from "@/lib/http/errors";
import { parseRawInvoiceJson, toBase64 } from "../parse-output";
import {
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_USER_PROMPT,
  SALES_MESSAGE_SYSTEM_PROMPT,
  buildSalesMessagePrompt,
} from "../prompts";
import { INVOICE_JSON_SCHEMA } from "../schema";
import type { AIProvider } from "../types";
import type { GeminiThinkingLevel } from "./gemini-options";

const LABEL = "Google Gemini";

/** Waits before retrying the same model when Gemini is busy (503) or fails (500). */
const RETRY_DELAYS_MS = [2_000, 5_000];

const THINKING: Record<Exclude<GeminiThinkingLevel, "default">, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

export interface GeminiSettings {
  apiKey: string;
  model: string;
  /** Used when the main model stays busy or out of quota; null = no fallback */
  fallbackModel: string | null;
  /** Reading a table needs little reasoning; "low" is much faster than the model default */
  thinkingLevel: GeminiThinkingLevel;
}

function statusOf(error: unknown): number {
  return typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
}

/** Busy (503), server error (500) and quota (429) are worth trying again or on another model. */
function isTemporary(status: number): boolean {
  return status === 503 || status === 500 || status === 429;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Maps SDK/network errors to messages a partner can act on. */
function toAppError(error: unknown): AppError {
  const status = statusOf(error);
  console.error("[gemini] request failed", error);
  if (status === 503 || status === 500) {
    return new AppError(
      "The AI reader is busy right now. Wait a minute and try again.",
      503,
      "ai_busy",
    );
  }
  if (status === 429) {
    return new AppError("The AI reader's usage limit was reached. Wait a minute and try again.", 429, "ai_rate_limited");
  }
  if (status === 401 || status === 403) {
    return new AppError("Gemini rejected the API key. Check GEMINI_API_KEY in .env.local.", 502, "ai_auth_failed");
  }
  if (status === 404) {
    return new AppError("Gemini model not found. Check GEMINI_MODEL in .env.local.", 502, "ai_model_not_found");
  }
  return new AppError("Gemini could not process the request. Please try again.", 502, "ai_request_failed");
}

export function createGeminiProvider(settings: GeminiSettings): AIProvider {
  const client = new GoogleGenAI({ apiKey: settings.apiKey });
  const models = [settings.model, ...(settings.fallbackModel ? [settings.fallbackModel] : [])];
  const thinkingConfig =
    settings.thinkingLevel === "default" ? undefined : { thinkingLevel: THINKING[settings.thinkingLevel] };

  /**
   * Calls Gemini, retrying the main model while it is busy, then trying the fallback model.
   * Returns the response text and which model produced it.
   */
  async function generate(request: Omit<GenerateContentParameters, "model">): Promise<{ text: string | undefined; model: string }> {
    let lastError: unknown;
    for (const model of models) {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          const response = await client.models.generateContent({ ...request, model });
          return { text: response.text, model };
        } catch (error) {
          lastError = error;
          const status = statusOf(error);
          if (!isTemporary(status)) throw toAppError(error);
          console.warn(`[gemini] ${model} returned ${status} (attempt ${attempt + 1})`);
          // Quota (429) will not clear in seconds: move straight to the fallback model.
          if (status === 429 || attempt === RETRY_DELAYS_MS.length) break;
          await wait(RETRY_DELAYS_MS[attempt]!);
        }
      }
    }
    throw toAppError(lastError);
  }

  return {
    info: { id: "gemini", label: LABEL, model: settings.model, readsImages: true },

    async extractInvoice(file) {
      const { text, model } = await generate({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: file.mimeType, data: toBase64(file.bytes) } },
              { text: EXTRACTION_USER_PROMPT },
            ],
          },
        ],
        config: {
          systemInstruction: EXTRACTION_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema: INVOICE_JSON_SCHEMA,
          temperature: 0,
          thinkingConfig,
        },
      });
      const raw = parseRawInvoiceJson(text, LABEL);
      if (model !== settings.model) {
        raw.notes.push(`${settings.model} was busy, so this invoice was read with ${model}. Please double-check the values.`);
      }
      return raw;
    },

    async writeSalesMessage(facts) {
      const { text } = await generate({
        contents: [{ role: "user", parts: [{ text: buildSalesMessagePrompt(facts) }] }],
        config: { systemInstruction: SALES_MESSAGE_SYSTEM_PROMPT, temperature: 0.4, thinkingConfig },
      });
      const message = text?.trim();
      if (!message) throw new AppError("Gemini returned an empty message. Please try again.", 502, "ai_empty_response");
      return message;
    },
  };
}
