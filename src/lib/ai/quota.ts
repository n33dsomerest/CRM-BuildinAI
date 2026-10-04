import {
  WINDOW_MS,
  computeTokenBudget,
  quotaExhaustedMessage,
  type TokenBudget,
} from "@/lib/ai/quota-policy";
import { db } from "@/lib/db";

/**
 * DB-backed token-budget accounting on top of the pure policy in
 * quota-policy.ts. Budgets are PER MODEL over a rolling 24-hour window and
 * measured in total tokens (input + output).
 *
 * Reservation model: one AiUsage row per USER-INITIATED AI ACTION, created
 * atomically (advisory-lock serialised) BEFORE the provider is called, then
 * finalised with the outcome - tokens attributed to whichever model in the
 * chain actually served the call. Cache hits never reach this module.
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

/** Sum of total tokens a user has spent on ONE model inside the window. */
async function modelTokensUsed(userId: string, model: string, now = new Date()): Promise<number> {
  const rows = await db.aiUsage.findMany({
    where: { userId, model, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } },
    select: { totalTokens: true },
  });
  return rows.reduce((sum, r) => sum + r.totalTokens, 0);
}

/** Per-model budget check for the provider chain's budget gate. */
export async function hasTokenBudget(
  userId: string,
  model: string,
  budgets: Map<string, number>,
  now = new Date()
): Promise<boolean> {
  const limit = budgets.get(model);
  // Unknown budget: allowed to run, not counted - never invent a number.
  if (limit === undefined) return true;
  const used = await modelTokensUsed(userId, model, now);
  return used < limit;
}

export interface ModelBudgetState {
  model: string;
  /** True when the model has no entry in AI_TOKEN_BUDGETS. */
  unknown: true;
  used: number;
}

/** UI figure: the primary model's budget state, or unknown-budget marker. */
export async function getPrimaryModelBudget(
  userId: string,
  primaryModel: string,
  budgets: Map<string, number>,
  now = new Date()
): Promise<{ model: string; unknown: boolean; used: number; limit: number; remaining: number }> {
  const limit = budgets.get(primaryModel);
  const used = await modelTokensUsed(userId, primaryModel, now);
  if (limit === undefined) {
    return { model: primaryModel, unknown: true, used, limit: 0, remaining: 0 };
  }
  const budget: TokenBudget = computeTokenBudget([{ totalTokens: used }], limit);
  return { model: primaryModel, unknown: false, used: budget.used, limit: budget.limit, remaining: budget.remaining };
}

/**
 * Clean pre-check for the actions: when EVERY model in the chain that carries
 * a known budget is exhausted (and at least one is known), fail up front with
 * an honest message instead of letting the chain churn through refusals.
 * A chain with any unknown-budget model can always run.
 */
export async function allModelsExhaustedMessage(
  userId: string,
  models: string[],
  budgets: Map<string, number>,
  now = new Date()
): Promise<string | null> {
  const known = models.filter((m) => budgets.has(m));
  if (known.length === 0) return null; // nothing is tracked -> never blocked

  let exhaustedCount = 0;
  let oldestReset: Date | null = null;
  for (const model of known) {
    const limit = budgets.get(model)!;
    const rows = await db.aiUsage.findMany({
      where: { userId, model, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } },
      select: { totalTokens: true, createdAt: true },
    });
    const budget = computeTokenBudget(rows, limit);
    if (budget.exhausted) {
      exhaustedCount += 1;
      const oldest = rows
        .filter((r) => r.totalTokens > 0)
        .map((r) => r.createdAt)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (oldest) {
        const reset = new Date(oldest.getTime() + WINDOW_MS);
        if (!oldestReset || reset < oldestReset) oldestReset = reset;
      }
    }
  }

  if (exhaustedCount < known.length) return null;
  const resetPart = oldestReset ? quotaExhaustedMessage(oldestReset, now) : "AI daily token budget reached";
  return `${resetPart} for all configured models`;
}

/**
 * Atomically reserve one concurrency slot: one AiUsage row per user-initiated
 * action, created BEFORE the provider call. The serving model is not known
 * until the chain picks one - finalize attributes the tokens.
 */
export async function reserve(userId: string, feature: string): Promise<string> {
  return db.$transaction(async (tx) => {
    // Serialise concurrent reservations for this user inside the transaction.
    // Released automatically when the transaction ends, including on failure.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const row = await tx.aiUsage.create({ data: { userId, feature, ok: true } });
    return row.id;
  });
}

/** Record the outcome of a reserved action; totalTokens = input + output. */
export async function finalize(reservationId: string, result: Omit<FinalizeResult, "totalTokens">): Promise<void> {
  const totalTokens = (result.inputTokens ?? 0) + (result.outputTokens ?? 0);
  await db.aiUsage.update({
    where: { id: reservationId },
    data: {
      ok: result.ok,
      inputTokens: result.inputTokens ?? 0,
      outputTokens: result.outputTokens ?? 0,
      totalTokens,
      model: result.model,
      provider: result.provider,
      error: result.error,
    },
  });
}
