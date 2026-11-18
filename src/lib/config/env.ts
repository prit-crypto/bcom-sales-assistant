import "server-only";
import { z } from "zod";
import { GEMINI_THINKING_LEVELS } from "@/lib/ai/providers/gemini-options";
import { PROVIDER_IDS } from "@/types/provider";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z.object({
  AI_PROVIDER: z.preprocess(emptyToUndefined, z.enum(PROVIDER_IDS).default("mock")),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GEMINI_MODEL: z.preprocess(emptyToUndefined, z.string().default("gemini-3.5-flash-lite")),
  /** "none" turns the fallback off */
  GEMINI_FALLBACK_MODEL: z.preprocess(emptyToUndefined, z.string().default("gemini-3.8-flash")),
  GEMINI_THINKING_LEVEL: z.preprocess(emptyToUndefined, z.enum(GEMINI_THINKING_LEVELS).default("low")),
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  OPENAI_MODEL: z.preprocess(emptyToUndefined, z.string().default("gpt-6.1-terra")),
  MAX_UPLOAD_MB: z.preprocess(emptyToUndefined, z.coerce.number().positive().max(30).default(10)),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | undefined;

/** Server-side settings from .env.local. Never import this from client components. */
export function getServerEnv(): ServerEnv {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
      throw new Error(`Invalid environment settings: ${fields}. Check .env.local against .env.example.`);
    }
    cached = parsed.data;
  }
  return cached;
}
