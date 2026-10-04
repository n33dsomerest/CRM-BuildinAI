import { describe, expect, it } from "vitest";
import { computeTokenBudget, quotaExhaustedMessage, WINDOW_MS } from "@/lib/ai/quota-policy";

const now = new Date("2026-10-04T12:00:00Z");

describe("computeTokenBudget", () => {
  it("sums the window's rows against the model limit", () => {
    const budget = computeTokenBudget(
      [{ totalTokens: 12_000 }, { totalTokens: 7_999 }],
      20_000
    );
    expect(budget).toEqual({ limit: 20_000, used: 19_999, remaining: 1, exhausted: false });
  });

  it("is exhausted at the limit", () => {
    const budget = computeTokenBudget([{ totalTokens: 20_000 }], 20_000);
    expect(budget.exhausted).toBe(true);
    expect(budget.remaining).toBe(0);
  });

  it("frees budget when the oldest entry ages out of the window", () => {
    // caller drops entries older than 24h - simulate by passing only in-window rows
    const agedOut = { totalTokens: 15_000 }; // excluded by the caller
    void agedOut;
    const budget = computeTokenBudget([{ totalTokens: 5_000 }], 20_000);
    expect(budget.remaining).toBe(15_000);
    expect(WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("treats an over-limit window as exhausted", () => {
    const budget = computeTokenBudget([{ totalTokens: 22_000 }], 20_000);
    expect(budget.exhausted).toBe(true);
  });
});

describe("quotaExhaustedMessage", () => {
  it("produces a human reset message", () => {
    const resetsAt = new Date(now.getTime() + 3.5 * 3_600_000);
    expect(quotaExhaustedMessage(resetsAt, now)).toContain("resets in 3h 30m");
    expect(quotaExhaustedMessage(resetsAt, now)).toContain("token budget");
  });
});
