import { createOpenRouterProvider } from "@/lib/ai/provider-openrouter";
import type { AiProvider } from "@/lib/ai/provider";

/**
 * Resolves and validates the AI configuration once. If anything is missing the
 * callers return `fail("AI is not configured")` — never crash a render, never
 * silently no-op. A placeholder/empty key counts as unconfigured.
 */

export interface AiConfig {
  apiKey: string;
  model: string;
  cheapModel: string;
}

export const DEFAULT_AI_MODEL = "anthropic/claude-sonnet-4.5";
export const DEFAULT_CHEAP_AI_MODEL = "google/gemini-2.5-flash";

export function getAiConfig(): AiConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) return null;

  const model = process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
  const cheapModel = process.env.AI_MODEL_CHEAP?.trim() || DEFAULT_CHEAP_AI_MODEL;
  return { apiKey, model, cheapModel };
}

export function isAiConfigured(): boolean {
  return getAiConfig() !== null;
}

export function getAiProvider(): AiProvider | null {
  const config = getAiConfig();
  if (!config) return null;
  return createOpenRouterProvider({ apiKey: config.apiKey, model: config.model });
}

/** Model id for a given cost tier; cheap tier falls back to the main model. */
export function modelFor(tier: "strong" | "cheap"): string | null {
  const config = getAiConfig();
  if (!config) return null;
  return tier === "cheap" ? config.cheapModel : config.model;
}
