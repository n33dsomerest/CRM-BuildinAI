/**
 * Quota policy — pure functions, unit-tested without a database.
 *
 * Budget: 20 requests per user per day, counted by REQUEST COUNT (failures and
 * retries included — a bug must not be able to loop indefinitely on someone
 * else's budget). Tokens are recorded for cost visibility only, never limited.
 *
 * Window: ROLLING 24 hours, not a calendar day. A calendar reset would hand
 * every user a fresh 20 at an arbitrary midnight hour; the rolling window
 * keeps the limit honest no matter when they work. Oldest entry in the window
 * determines when the next slot frees up — surfaced to the user in errors.
 */

export const DAILY_QUOTA = 20;
export const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface QuotaAttempt {
  createdAt: Date;
}

export interface QuotaState {
  used: number;
  remaining: number;
  exhausted: boolean;
  /** When the oldest attempt in the window ages out — null while slots remain. */
  resetsAt: Date | null;
}

export function computeQuotaState(attempts: QuotaAttempt[], now: Date): QuotaState {
  const windowStart = now.getTime() - WINDOW_MS;
  const inWindow = attempts
    .filter((a) => a.createdAt.getTime() > windowStart)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const used = inWindow.length;
  const remaining = Math.max(0, DAILY_QUOTA - used);
  const exhausted = remaining === 0;
  const oldest = inWindow[0];

  return {
    used,
    remaining,
    exhausted,
    resetsAt: exhausted && oldest ? new Date(oldest.createdAt.getTime() + WINDOW_MS) : null,
  };
}

/** Human message for the exhausted case, e.g. "resets in 3h 12m". */
export function quotaExhaustedMessage(resetsAt: Date, now: Date): string {
  const ms = Math.max(0, resetsAt.getTime() - now.getTime());
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `AI daily limit reached (${DAILY_QUOTA}/day) — resets in ${hours}h ${minutes}m`;
}
