import { DAILY_QUOTA, computeQuotaState, quotaExhaustedMessage, type QuotaState } from "@/lib/ai/quota-policy";
import { db } from "@/lib/db";

/**
 * DB-backed quota accounting on top of the pure policy in quota-policy.ts.
 * Every upstream attempt (successes AND failures) is recorded — see 0.4.
 * Cache hits never reach this module.
 */

export interface ConsumeParams {
  feature: string;
  ok: boolean;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  /** Error class only ("rate-limited", "timeout") — never prompt or completion text. */
  error?: string;
}

export async function getQuotaState(userId: string, now = new Date()): Promise<QuotaState> {
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const attempts = await db.aiUsage.findMany({
    where: { userId, createdAt: { gt: windowStart } },
    select: { createdAt: true },
  });
  return computeQuotaState(attempts, now);
}

export async function getRemaining(userId: string, now = new Date()): Promise<number> {
  return (await getQuotaState(userId, now)).remaining;
}

export async function consume(userId: string, params: ConsumeParams): Promise<void> {
  await db.aiUsage.create({
    data: {
      userId,
      feature: params.feature,
      ok: params.ok,
      inputTokens: params.inputTokens ?? 0,
      outputTokens: params.outputTokens ?? 0,
      model: params.model,
      error: params.error,
    },
  });
}

/** Exhausted-quota error message with the honest reset time. */
export async function exhaustionMessage(userId: string, now = new Date()): Promise<string> {
  const state = await getQuotaState(userId, now);
  if (!state.exhausted || !state.resetsAt) {
    return `AI daily limit reached (${DAILY_QUOTA}/day)`;
  }
  return quotaExhaustedMessage(state.resetsAt, now);
}
