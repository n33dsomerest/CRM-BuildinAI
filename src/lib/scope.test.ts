import { describe, expect, it } from "vitest";
import { canModify, ownerFilter } from "@/lib/scope";

const admin = { id: "u-admin", role: "ADMIN" as const };
const sales = { id: "u-sarah", role: "SALES" as const };
const other = { id: "u-david", role: "SALES" as const };

describe("ownerFilter", () => {
  it("returns an empty fragment for admins (sees everything)", () => {
    expect(ownerFilter(admin)).toEqual({});
  });

  it("restricts sales users to their own ownerId", () => {
    expect(ownerFilter(sales)).toEqual({ ownerId: "u-sarah" });
  });

  it("supports custom ownership fields (e.g. task assignee)", () => {
    expect(ownerFilter(sales, "assigneeId")).toEqual({ assigneeId: "u-sarah" });
  });
});

describe("canModify", () => {
  it("allows admins to modify any record", () => {
    expect(canModify(admin, other.id)).toBe(true);
    expect(canModify(admin, null)).toBe(true);
  });

  it("allows sales users to modify only their own records", () => {
    expect(canModify(sales, sales.id)).toBe(true);
    expect(canModify(sales, other.id)).toBe(false);
    expect(canModify(sales, undefined)).toBe(false);
  });
});
