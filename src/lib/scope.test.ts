import { describe, expect, it } from "vitest";
import { ownerFilter } from "@/lib/scope";

const admin = { id: "u-admin", role: "ADMIN" as const };
const sales = { id: "u-sarah", role: "SALES" as const };

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
