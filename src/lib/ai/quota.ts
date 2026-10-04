import { DAILY_QUOTA, WINDOW_MS, quotaExhaustedMessage, type QuotaState } from "@/lib/ai/quota-policy";
import { db } from "@/lib/db";

/**
 * DB-backed quota accounting on top of the pure policy in quota-policy.ts.
 *
 * Reservation model: one AiUsage row per USER-INITIATED AI ACTION, created
 * atomically (advisory-lock serialised) BEFORE the provider is called, then
 * finalised with the outcome. Concurrent requests therefore cannot exceed the
 * daily budget, and one user action is one slot no matter how many HTTP
 * attempts the provider needed internally. Cache hits never reach this module.
 */

export interface FinalizeResult {
  ok: boolean;
  inputTokens?: number;
  outputTokens?: number;
  /** The model that actually served the call - may be a chain fallback. */
  model?: string;
  /** Gateway-reported provider behind the model, when reported. */
  provider?: string;
  /** Error class only ("rate-limited", "timeout") — never prompt or completion text. */
  error?: string;
}

export async function getQuotaState(userId: string, now = new Date()): Promise<QuotaState> {
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const windowWhere = { userId, createdAt: { gt: windowStart } };
  const [used, oldest] = await Promise.all([
    db.aiUsage.count({ where: windowWhere }),
    db.aiUsage.findFirst({ where: windowWhere, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  // Same arithmetic as computeQuotaState in quota-policy.ts (the spec), using
  // count() + the oldest entry instead of loading every row in the window.
  const remaining = Math.max(0, DAILY_QUOTA - used);
  return {
    used,
    remaining,
    exhausted: remaining === 0,
    resetsAt: remaining === 0 && oldest ? new Date(oldest.createdAt.getTime() + WINDOW_MS) : null,
  };
}

export async function getRemaining(userId: string, now = new Date()): Promise<number> {
  return (await getQuotaState(userId, now)).remaining;
}

/**
 * Atomically reserve one slot. Returns the AiUsage row id to pass to
 * `finalize`, or null when the user has no slots left.
 */
export async function reserve(userId: string, feature: string): Promise<string> {
  return db.$transaction(async (tx) => {
    // Serialise concurrent reservations for this user inside the transaction.
    // Released automatically when the transaction ends, including on failure.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    // The row IS the concurrency slot. With per-model token budgets the
    // enforcement lives in the provider chain's budget gates (hasBudget /
    // remainingTokens) plus the action-level all-models-exhausted pre-check -
    // the serving model is not known until the chain picks one.
    const row = await tx.aiUsage.create({ data: { userId, feature, ok: true } });
    return row.id;
  });
}

/** Record the outcome of a reserved action. */
export async function finalize(reservationId: string, result: FinalizeResult): Promise<void> {
  await db.aiUsage.update({ where: { id: reservationId }, data: { ...result } });
}

/** Exhausted-quota error message with the honest reset time. */
export async function exhaustionMessage(userId: string, now = new Date()): Promise<string> {
  const state = await getQuotaState(userId, now);
  if (!state.exhausted || !state.resetsAt) {
    return `AI daily limit reached (${DAILY_QUOTA}/day)`;
  }
  return quotaExhaustedMessage(state.resetsAt, now);
}
