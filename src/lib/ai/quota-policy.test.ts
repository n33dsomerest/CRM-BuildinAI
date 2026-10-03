import { describe, expect, it } from "vitest";
import { computeQuotaState, DAILY_QUOTA, quotaExhaustedMessage } from "@/lib/ai/quota-policy";

const now = new Date("2026-10-03T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("computeQuotaState (rolling 24h window)", () => {
  it("counts nothing for an empty window", () => {
    const state = computeQuotaState([], now);
    expect(state).toEqual({ used: 0, remaining: DAILY_QUOTA, exhausted: false, resetsAt: null });
  });

  it("allows 19 requests and refuses the 20th", () => {
    const attempts = Array.from({ length: 19 }, (_, i) => ({ createdAt: hoursAgo(1 + i * 0.1) }));
    const state = computeQuotaState(attempts, now);
    expect(state.used).toBe(19);
    expect(state.remaining).toBe(1);
    expect(state.exhausted).toBe(false);

    const exhausted = computeQuotaState([...attempts, { createdAt: hoursAgo(0.5) }], now);
    expect(exhausted.used).toBe(20);
    expect(exhausted.remaining).toBe(0);
    expect(exhausted.exhausted).toBe(true);
    expect(exhausted.resetsAt).not.toBeNull();
  });

  it("frees a slot when the oldest entry ages out of the window", () => {
    // 20 attempts, but the oldest is 25h old - outside the window
    const attempts = [
      { createdAt: hoursAgo(25) },
      ...Array.from({ length: 19 }, (_, i) => ({ createdAt: hoursAgo(1 + i * 0.1) })),
    ];
    const state = computeQuotaState(attempts, now);
    expect(state.used).toBe(19);
    expect(state.remaining).toBe(1);
    expect(state.resetsAt).toBeNull();
  });

  it("resetsAt equals oldest in-window entry plus 24h", () => {
    const oldest = hoursAgo(3);
    const attempts = Array.from({ length: 20 }, (_, i) => ({
      createdAt: new Date(oldest.getTime() + i * 60_000),
    }));
    const state = computeQuotaState(attempts, now);
    expect(state.resetsAt?.getTime()).toBe(oldest.getTime() + 24 * 3_600_000);
  });

  it("produces a human reset message", () => {
    const resetsAt = new Date(now.getTime() + 3.5 * 3_600_000);
    const message = quotaExhaustedMessage(resetsAt, now);
    expect(message).toContain("20/day");
    expect(message).toContain("resets in 3h 30m");
  });
});
