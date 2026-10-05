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

/** Sum of total tokens ALL users have spent on ONE model inside the window -
 *  the shared (per API key) tally the gateway quota actually measures. */
async function modelTokensUsedAllUsers(model: string, now = new Date()): Promise<number> {
  const rows = await db.aiUsage.findMany({
    where: { model, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } },
    select: { totalTokens: true },
  });
  return rows.reduce((sum, r) => sum + r.totalTokens, 0);
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

/** UI figures: the primary model's SHARED budget state plus the caller's
 *  personal share (when userLimit is configured), or unknown-budget marker. */
export async function getPrimaryModelBudget(
  userId: string,
  primaryModel: string,
  budgets: Map<string, number>,
  userLimit?: number,
  now = new Date()
): Promise<{
  model: string;
  unknown: boolean;
  sharedUsed: number;
  sharedLimit: number;
  sharedRemaining: number;
  userUsed: number;
  userLimit: number;
}> {
  const limit = budgets.get(primaryModel);
  const sharedUsed = await modelTokensUsedAllUsers(primaryModel, now);
  const userUsed = await modelTokensUsed(userId, primaryModel, now);
  if (limit === undefined) {
    return { model: primaryModel, unknown: true, sharedUsed, sharedLimit: 0, sharedRemaining: 0, userUsed, userLimit: 0 };
  }
  const budget: TokenBudget = computeTokenBudget([{ totalTokens: sharedUsed }], limit);
  return {
    model: primaryModel,
    unknown: false,
    sharedUsed: budget.used,
    sharedLimit: budget.limit,
    sharedRemaining: budget.remaining,
    userUsed,
    userLimit: userLimit ?? 0,
  };
}

/**
 * Clean pre-check for the actions: when EVERY model in the chain that carries
 * a known budget is exhausted ON THE SHARED (per-key) tally - summed across
 * all users, because the gateway quota is per API key - fail up front with an
 * honest, team-framed message instead of letting the chain churn through
 * refusals. A chain with any unknown-budget model can always run.
 */
export async function allModelsExhaustedMessage(
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
      where: { model, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } },
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
  const modelList = known.join(", ");
  const resetPart = oldestReset ? quotaExhaustedMessage(oldestReset, now) : "AI daily token budget reached";
  return `${resetPart} for all configured models (${modelList}) - the team's daily budget is used up, try tomorrow`;
}

/**
 * Estimated cost charged AT RESERVE TIME so the in-lock tally sees in-flight
 * spend. Measured worst case on the chain is ~825 output tokens (deepseek);
 * 900 covers every non-reasoning model with margin. finalize() corrects the
 * row to the actual usage afterwards, so the window tally self-corrects.
 */
export const ESTIMATED_TOKENS_PER_ACTION = 900;

export interface ReserveResult {
  id: string;
  /** True when the model's SHARED (per-key) budget was already exhausted. */
  overBudget: boolean;
  /** True when THIS USER already consumed their fairness share. */
  overUserBudget: boolean;
  /** Shared (all users) token tally for the model inside the window. */
  used: number;
  /** This user's own tally for the model inside the window. */
  userUsed: number;
}

/**
 * Atomically reserve one concurrency slot: one AiUsage row per user-initiated
 * action, created BEFORE the provider call.
 *
 * HONEST LIMITATION: "check budget -> call the model -> record actual tokens"
 * cannot be made atomic - that would mean holding this transaction and the
 * advisory lock open across a multi-second HTTP call, pinning a pooled
 * connection. What the layers actually guarantee:
 *  - the GATEWAY is the real enforcement: daily_quota_tokens is a hard
 *    ceiling and the gateway rejects over-budget calls itself;
 *  - this local check is fail-fast UX (a clean message instead of a 429) and
 *    it is serialized by the advisory lock with the ESTIMATED cost charged at
 *    reserve time, so concurrent in-flight actions are visible to the tally;
 *  - a race can therefore overshoot the local tally by at most the gap
 *    between estimate and actual for the in-flight actions - bounded, and
 *    harmless because the gateway rejects true overruns.
 */
export async function reserve(
  userId: string,
  feature: string,
  options?: { model?: string; limit?: number; userLimit?: number }
): Promise<ReserveResult> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    let used = 0;
    let userUsed = 0;
    if (options?.model && options.limit !== undefined) {
      // Shared tally: the gateway quota is per API KEY, so every user of the
      // key draws from the same budget. The per-user tally (when a fairness
      // share is configured) is a courtesy cap, not enforcement.
      const rows = await tx.aiUsage.findMany({
        where: { model: options.model, createdAt: { gt: new Date(Date.now() - WINDOW_MS) } },
        select: { totalTokens: true, userId: true },
      });
      used = rows.reduce((sum, r) => sum + r.totalTokens, 0);
      if (options.userLimit !== undefined) {
        userUsed = rows
          .filter((r) => r.userId === userId)
          .reduce((sum, r) => sum + r.totalTokens, 0);
      }
    }

    const row = await tx.aiUsage.create({
      data: {
        userId,
        feature,
        ok: true,
        model: options?.model,
        totalTokens: options?.model && options.limit !== undefined ? ESTIMATED_TOKENS_PER_ACTION : 0,
      },
    });

    return {
      id: row.id,
      overBudget: options?.model !== undefined && options.limit !== undefined && used >= options.limit,
      overUserBudget:
        options?.userLimit !== undefined &&
        options.model !== undefined &&
        options.limit !== undefined &&
        userUsed >= options.userLimit,
      used,
      userUsed,
    };
  });
}

/**
 * Record the outcome of a reserved action; totalTokens = input + output.
 *
 * The row keeps the model it was RESERVED for - it is not rewritten to the
 * chain's serving model. Otherwise the estimate charged at reserve time would
 * migrate off the reserved model's tally the moment a fallback served the
 * call, and the estimate would stop protecting anything. The gateway's
 * model_quota (persisted via gateway-quota.ts) remains the accurate per-model
 * source; the provider field records the actual gateway provider observed.
 */
export async function finalize(reservationId: string, result: Omit<FinalizeResult, "totalTokens">): Promise<void> {
  const totalTokens = (result.inputTokens ?? 0) + (result.outputTokens ?? 0);
  await db.aiUsage.update({
    where: { id: reservationId },
    data: {
      ok: result.ok,
      inputTokens: result.inputTokens ?? 0,
      outputTokens: result.outputTokens ?? 0,
      totalTokens,
      provider: result.provider,
      error: result.error,
    },
  });
}
