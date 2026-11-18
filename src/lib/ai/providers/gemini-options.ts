/** Thinking levels accepted in GEMINI_THINKING_LEVEL ("default" leaves the model's own setting). */
export const GEMINI_THINKING_LEVELS = ["minimal", "low", "medium", "high", "default"] as const;
export type GeminiThinkingLevel = (typeof GEMINI_THINKING_LEVELS)[number];
