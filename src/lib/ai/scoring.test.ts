import { describe, expect, it } from "vitest";
import { clampBatchSize, computeAverageOpenDealValue, computeWinRate } from "@/lib/ai/scoring";
import { leadScoreSchema } from "@/lib/validations";

describe("clampBatchSize", () => {
  it("caps the batch at the remaining quota so it never half-runs", () => {
    expect(clampBatchSize(15, 8)).toBe(8);
  });

  it("keeps small batches under quota unchanged", () => {
    expect(clampBatchSize(3, 20)).toBe(3);
  });

  it("returns 0 when no quota remains", () => {
    expect(clampBatchSize(15, 0)).toBe(0);
  });

  it("never returns a negative size", () => {
    expect(clampBatchSize(0, 0)).toBe(0);
  });
});

describe("computeWinRate", () => {
  it("excludes open deals from the denominator", () => {
    expect(computeWinRate({ won: 3, lost: 1 })).toBe(75);
  });

  it("returns 0 when nothing has closed", () => {
    expect(computeWinRate({ won: 0, lost: 0 })).toBe(0);
  });
});

describe("computeAverageOpenDealValue", () => {
  it("formats in thousands", () => {
    expect(computeAverageOpenDealValue({ openValueSum: 250_000, openCount: 5 })).toBe("~$50k");
  });

  it("handles the no-deals case", () => {
    expect(computeAverageOpenDealValue({ openValueSum: 0, openCount: 0 })).toBe("no open deals");
  });
});

describe("leadScoreSchema - honesty rules", () => {
  it("accepts an in-range score with a reason", () => {
    const result = leadScoreSchema.safeParse({ score: 72, reason: "Strong referral source with full contact data" });
    expect(result.success).toBe(true);
  });

  it("rejects scores above 100 - never silently clamped", () => {
    expect(leadScoreSchema.safeParse({ score: 101, reason: "Valid reason here" }).success).toBe(false);
  });

  it("rejects negative scores", () => {
    expect(leadScoreSchema.safeParse({ score: -1, reason: "Valid reason here" }).success).toBe(false);
  });

  it("rejects a bare number without reasons", () => {
    expect(leadScoreSchema.safeParse({ score: 80, reason: "" }).success).toBe(false);
  });
});
