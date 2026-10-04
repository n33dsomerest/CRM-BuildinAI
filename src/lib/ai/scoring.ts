/**
 * Pure scoring helpers - unit-tested without a database.
 */

/** Cap a requested batch at the remaining daily quota so it can never half-run. */
export function clampBatchSize(requested: number, remaining: number): number {
  return Math.max(0, Math.min(requested, remaining));
}

export interface PipelineAggregates {
  won: number;
  lost: number;
  totalDeals: number;
  openValueSum: number;
  openCount: number;
}

/** Win rate = won / (won + lost); open deals excluded from the denominator. */
export function computeWinRate(agg: Pick<PipelineAggregates, "won" | "lost">): number {
  const closed = agg.won + agg.lost;
  return closed === 0 ? 0 : Math.round((agg.won / closed) * 100);
}

export function computeAverageOpenDealValue(agg: Pick<PipelineAggregates, "openValueSum" | "openCount">): string {
  if (agg.openCount === 0) return "no open deals";
  const avg = agg.openValueSum / agg.openCount;
  return avg >= 1000
    ? `~$${Math.round(avg / 1000)}k`
    : `~$${Math.round(avg)}`;
}
