import "server-only";
import { getServerEnv } from "@/lib/config/env";
import { AppError } from "@/lib/http/errors";
import { createGeminiProvider } from "./providers/gemini";
import { createMockProvider } from "./providers/mock";
import { createOpenAIProvider } from "./providers/openai";
import type { AIProvider } from "./types";

let cached: AIProvider | undefined;

/** Returns the AI provider selected by AI_PROVIDER in .env.local (mock | gemini | openai). */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const env = getServerEnv();

  switch (env.AI_PROVIDER) {
    case "gemini":
      if (!env.GEMINI_API_KEY) {
        throw new AppError("AI_PROVIDER is gemini but GEMINI_API_KEY is empty in .env.local.", 500, "ai_not_configured");
      }
      cached = createGeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
        fallbackModel:
          env.GEMINI_FALLBACK_MODEL === "none" || env.GEMINI_FALLBACK_MODEL === env.GEMINI_MODEL
            ? null
            : env.GEMINI_FALLBACK_MODEL,
        thinkingLevel: env.GEMINI_THINKING_LEVEL,
      });
      break;
    case "openai":
      if (!env.OPENAI_API_KEY) {
        throw new AppError("AI_PROVIDER is openai but OPENAI_API_KEY is empty in .env.local.", 500, "ai_not_configured");
      }
      cached = createOpenAIProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
      break;
    case "mock":
      cached = createMockProvider();
      break;
  }
  return cached;
}

export type { AIProvider, InvoiceFile, SalesMessageFacts } from "./types";
