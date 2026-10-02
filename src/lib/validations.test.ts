import { describe, expect, it } from "vitest";
import { contactSchema, dealSchema, leadSchema, signInSchema } from "@/lib/validations";

describe("signInSchema", () => {
  it("accepts valid credentials", () => {
    const result = signInSchema.safeParse({ email: "sarah@crm.dev", password: "secret" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = signInSchema.safeParse({ email: "not-an-email", password: "secret" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = signInSchema.safeParse({ email: "sarah@crm.dev", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("contactSchema", () => {
  const base = {
    name: "Jane Doe",
    status: "PROSPECT",
    accountId: "acc-1",
    ownerId: "user-1",
  };

  it("turns empty strings into undefined for optional fields", () => {
    const result = contactSchema.safeParse({ ...base, email: "", phone: "", position: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeUndefined();
      expect(result.data.phone).toBeUndefined();
    }
  });

  it("rejects malformed emails", () => {
    const result = contactSchema.safeParse({ ...base, email: "nope" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown status values", () => {
    const result = contactSchema.safeParse({ ...base, status: "VIP" });
    expect(result.success).toBe(false);
  });
});

describe("dealSchema", () => {
  const base = {
    title: "Big deal",
    stageId: "stage-1",
    accountId: "acc-1",
    contactId: "con-1",
    ownerId: "user-1",
  };

  it("coerces numeric strings for value", () => {
    const result = dealSchema.safeParse({ ...base, value: "12500" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.value).toBe(12500);
  });

  it("rejects zero or negative values", () => {
    expect(dealSchema.safeParse({ ...base, value: 0 }).success).toBe(false);
    expect(dealSchema.safeParse({ ...base, value: -5 }).success).toBe(false);
  });

  it("validates the expected close date format", () => {
    expect(dealSchema.safeParse({ ...base, value: 100, expectedCloseDate: "2026-13-01" }).success).toBe(false);
    expect(dealSchema.safeParse({ ...base, value: 100, expectedCloseDate: "2026-12-01" }).success).toBe(true);
  });
});

describe("leadSchema", () => {
  it("accepts a minimal valid lead", () => {
    const result = leadSchema.safeParse({
      name: "Fresh lead",
      source: "WEB",
      status: "NEW",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown sources", () => {
    expect(leadSchema.safeParse({ name: "x", source: "TELEPORT", status: "NEW" }).success).toBe(false);
  });
});
