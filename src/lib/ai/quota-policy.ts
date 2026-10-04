/**
 * Quota policy — pure functions, unit-tested without a database.
 *
 * Budget: token-based, PER MODEL. Each configured model carries a daily token
 * budget (input + output, the unit gateway quotas are measured in) served from
 * AI_TOKEN_BUDGETS. A model absent from the budget map has an unknown budget:
 * allowed to run, not counted against any limit. Tokens are recorded for cost
 * visibility as well; there is no request-count limit any more.
 *
 * Window: ROLLING 24 hours, not a calendar day. A calendar reset would hand
 * every user a fresh budget at an arbitrary midnight hour; the rolling window
 * keeps the limit honest no matter when they work.
 *
 * One user action is one AiUsage row and one concurrency slot regardless of
 * how many upstream attempts the fallback chain needed (see quota.ts); the
 * row's totalTokens are attributed to whichever model actually served it.
 */

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface TokenBudgetEntry {
  totalTokens: number;
}

export interface TokenBudget {
  limit: number;
  used: number;
  remaining: number;
  exhausted: boolean;
}

export function computeTokenBudget(entries: TokenBudgetEntry[], limit: number): TokenBudget {
  const used = entries.reduce((sum, e) => sum + e.totalTokens, 0);
  const remaining = Math.max(0, limit - used);
  return { limit, used, remaining, exhausted: remaining === 0 };
}

/** Human message for the exhausted case, e.g. "resets in 3h 12m". */
export function quotaExhaustedMessage(resetsAt: Date, now: Date): string {
  const ms = Math.max(0, resetsAt.getTime() - now.getTime());
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `AI daily token budget reached — resets in ${hours}h ${minutes}m`;
}
