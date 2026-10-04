import { createGatewayProvider } from "@/lib/ai/provider-gateway";
import type { AiProvider } from "@/lib/ai/provider";

/**
 * Resolves and validates the AI configuration once. If anything is missing the
 * callers return `fail("AI is not configured")` — never crash a render, never
 * silently no-op. A placeholder key (e.g. the literal YOUR_API_KEY) counts as
 * unconfigured - that is exactly the failure hit during setup.
 */

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  /** Ordered chain: [primary, ...fallbacks]. */
  models: string[];
  /** Per-model daily token budgets, keyed by model id. A model absent from
   *  the map has an UNKNOWN budget: allowed to run, not counted against any
   *  limit - never invent a number for it. */
  budgets: Map<string, number>;
}

export const DEFAULT_AI_BASE_URL = "https://gen.ai.kku.ac.th/okmd/api/v1";
export const DEFAULT_AI_MODEL = "gemini-2.5-flash-lite";

export function getAiConfig(): AiConfig | null {
  const apiKey = process.env.AI_API_KEY?.trim() ?? process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey || /^YOUR_API_KEY$/i.test(apiKey)) return null;

  const baseUrl = (process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL).replace(/\/+$/, "");
  const primary = process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
  const fallbacks = (process.env.AI_MODEL_FALLBACKS?.split(",") ?? [])
    .map((m) => m.trim())
    .filter(Boolean);

  // AI_TOKEN_BUDGETS is JSON keyed by model id, e.g.
  // {"deepseek-v4-flash":180000,"gemini-2.5-flash-lite":30000}
  // Malformed JSON is ignored (empty map) rather than breaking the app - the
  // per-model budget gate then treats every model as unknown-budget.
  const budgets = new Map<string, number>();
  const rawBudgets = process.env.AI_TOKEN_BUDGETS?.trim();
  if (rawBudgets) {
    try {
      const parsed = JSON.parse(rawBudgets) as Record<string, unknown>;
      for (const [model, value] of Object.entries(parsed)) {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
          budgets.set(model, value);
        }
      }
    } catch {
      // malformed - leave the map empty
    }
  }

  return { apiKey, baseUrl, models: [primary, ...fallbacks], budgets };
}

export function isAiConfigured(): boolean {
  return getAiConfig() !== null;
}

export function getAiProvider(): AiProvider | null {
  const config = getAiConfig();
  if (!config) return null;
  return createGatewayProvider(config);
}
