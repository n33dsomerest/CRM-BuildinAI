import { describe, expect, it } from "vitest";
import { diffChanges } from "@/lib/audit";

describe("diffChanges", () => {
  it("reports changed fields with from/to values", () => {
    const changes = diffChanges({ name: "Old", status: "PROSPECT" }, { name: "New" });
    expect(changes).toEqual({ name: { from: "Old", to: "New" } });
  });

  it("ignores fields that did not change", () => {
    const changes = diffChanges({ name: "Same", email: "a@b.c" }, { name: "Same" });
    expect(changes).toEqual({});
  });

  it("always skips updatedAt", () => {
    const changes = diffChanges({ updatedAt: new Date("2026-01-01") }, { updatedAt: new Date("2026-02-01") });
    expect(changes).toEqual({});
  });

  it("stringifies Dates and Decimals so JSON payloads stay serializable", () => {
    const changes = diffChanges({ expectedCloseDate: new Date("2026-01-01T00:00:00.000Z") }, { expectedCloseDate: new Date("2026-06-01T00:00:00.000Z") });
    expect(changes.expectedCloseDate).toEqual({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-06-01T00:00:00.000Z",
    });
  });

  it("treats null and undefined as empty strings", () => {
    const changes = diffChanges({ email: null }, { email: undefined });
    expect(changes).toEqual({});
  });
});
