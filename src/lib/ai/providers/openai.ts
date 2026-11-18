import "server-only";
import OpenAI from "openai";
import { AppError } from "@/lib/http/errors";
import { parseRawInvoiceJson, toBase64 } from "../parse-output";
import {
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_USER_PROMPT,
  SALES_MESSAGE_SYSTEM_PROMPT,
  buildSalesMessagePrompt,
} from "../prompts";
import { INVOICE_JSON_SCHEMA } from "../schema";
import type { AIProvider, InvoiceFile } from "../types";

const LABEL = "OpenAI";

function toAppError(error: unknown): AppError {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return new AppError("OpenAI rate limit or quota reached. Check your plan and try again.", 429, "ai_rate_limited");
    }
    if (error.status === 401 || error.status === 403) {
      return new AppError("OpenAI rejected the API key. Check OPENAI_API_KEY in .env.local.", 502, "ai_auth_failed");
    }
    if (error.status === 404) {
      return new AppError("OpenAI model not found. Check OPENAI_MODEL in .env.local.", 502, "ai_model_not_found");
    }
  }
  console.error("[openai] request failed", error);
  return new AppError("OpenAI could not process the request. Please try again.", 502, "ai_request_failed");
}

/** PDFs go in as a file, photos as an image – both inline as base64 data URLs. */
function fileInput(file: InvoiceFile) {
  const dataUrl = `data:${file.mimeType};base64,${toBase64(file.bytes)}`;
  if (file.mimeType === "application/pdf") {
    return { type: "input_file" as const, filename: file.fileName, file_data: dataUrl };
  }
  return { type: "input_image" as const, image_url: dataUrl, detail: "high" as const };
}

export function createOpenAIProvider(apiKey: string, model: string): AIProvider {
  const client = new OpenAI({ apiKey });

  return {
    info: { id: "openai", label: LABEL, model, readsImages: true },

    async extractInvoice(file) {
      try {
        const response = await client.responses.create({
          model,
          instructions: EXTRACTION_SYSTEM_PROMPT,
          input: [
            {
              role: "user",
              content: [fileInput(file), { type: "input_text", text: EXTRACTION_USER_PROMPT }],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "courier_invoice",
              strict: true,
              schema: INVOICE_JSON_SCHEMA as unknown as Record<string, unknown>,
            },
          },
        });
        return parseRawInvoiceJson(response.output_text, LABEL);
      } catch (error) {
        throw error instanceof AppError ? error : toAppError(error);
      }
    },

    async writeSalesMessage(facts) {
      try {
        const response = await client.responses.create({
          model,
          instructions: SALES_MESSAGE_SYSTEM_PROMPT,
          input: buildSalesMessagePrompt(facts),
        });
        const text = response.output_text.trim();
        if (!text) throw new AppError("OpenAI returned an empty message. Please try again.", 502, "ai_empty_response");
        return text;
      } catch (error) {
        throw error instanceof AppError ? error : toAppError(error);
      }
    },
  };
}
