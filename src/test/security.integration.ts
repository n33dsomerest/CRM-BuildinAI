import { describe, expect, it, beforeEach } from "vitest";
import { prisma } from "@/test/setup";
import { hashSync } from "bcryptjs";
import { ownerFilter } from "@/lib/scope";

describe("Security: row-level ownership (integration)", () => {
  let admin: { id: string; email: string };
  let sales1: { id: string; email: string };
  let sales2: { id: string; email: string };
  let sales2Account: { id: string };

  beforeEach(async () => {
    // Create users
    admin = await prisma.user.create({
      data: { email: "sec-admin@test.com", name: "Admin", passwordHash: hashSync("Admin!2345", 12), role: "ADMIN" },
    });
    sales1 = await prisma.user.create({
      data: { email: "sec-sales1@test.com", name: "Sales One", passwordHash: hashSync("Sales!2345", 12), role: "SALES" },
    });
    sales2 = await prisma.user.create({
      data: { email: "sec-sales2@test.com", name: "Sales Two", passwordHash: hashSync("Sales!2345", 12), role: "SALES" },
    });

    // Create accounts owned by each (fixtures for the count assertions below)
    await prisma.account.create({
      data: { name: "Admin Corp", ownerId: admin.id },
    });
    await prisma.account.create({
      data: { name: "Sales1 Co", ownerId: sales1.id },
    });
    sales2Account = await prisma.account.create({
      data: { name: "Sales2 Co", ownerId: sales2.id },
    });
  });

  describe("ownerFilter", () => {
    it("returns empty where clause for ADMIN", async () => {
      const where = ownerFilter({ id: admin.id, role: "ADMIN" });
      const count = await prisma.account.count({ where });
      // ADMIN should see all 3 accounts
      expect(count).toBe(3);
    });

    it("restricts SALES to their own records", async () => {
      const where = ownerFilter({ id: sales1.id, role: "SALES" });
      const count = await prisma.account.count({ where });
      // SALES should only see their own 1 account
      expect(count).toBe(1);
    });

    it("SALES cannot see another SALES's records", async () => {
      const where = ownerFilter({ id: sales1.id, role: "SALES" });
      const otherAccount = await prisma.account.findFirst({
        where: { id: sales2Account.id, ...where },
      });
      expect(otherAccount).toBeNull();
    });
  });
});