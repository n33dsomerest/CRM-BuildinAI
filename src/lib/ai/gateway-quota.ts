import { cacheKey, getCached, setCached } from "@/lib/ai/cache";

/**
 * Persists the gateway-reported per-model remaining token budget
 * (model_quota.daily_remaining_tokens) so the fallback chain can skip a model
 * the server says is exhausted. Stored in AiCache under a reserved key prefix.
 *
 * Why AiCache and not a new table: this is an EPHEMERAL OPTIMISATION on top of
 * local AiUsage tracking - never the only source of truth - and it shares the
 * cache's lifecycle semantics (safe to lose, safe to truncate, no audit need).
 * The reserved "gateway-quota:" prefix cannot collide with completion caches,
 * whose keys are sha256 digests.
 */

const PREFIX = "gateway-quota:";

export async function persistRemainingTokens(model: string, remainingTokens: number): Promise<void> {
  await setCached(`${PREFIX}${model}`, "gateway-quota", {
    model,
    remainingTokens,
    updatedAt: new Date().toISOString(),
  });
}

/** null = unknown - the chain must not skip on unknown values. */
export async function readRemainingTokens(model: string): Promise<number | null> {
  const cached = await getCached<{ remainingTokens: number }>(cacheKey(PREFIX, { model }));
  if (!cached || typeof cached.remainingTokens !== "number") return null;
  return cached.remainingTokens;
}
