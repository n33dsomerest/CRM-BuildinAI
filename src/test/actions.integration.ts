import { describe, expect, it, beforeEach, vi } from "vitest";
import { prisma } from "@/test/setup";
import { hashSync } from "bcryptjs";
import { isOwnedRecord, assertUserExists } from "@/lib/authorize";

describe("Security: IDOR protection via authorize helpers (integration)", () => {
  let admin: { id: string; email: string };
  let sales1: { id: string; email: string };
  let sales2: { id: string; email: string };
  let adminAccount: { id: string; name: string };
  let sales1Account: { id: string; name: string };
  let sales2Account: { id: string; name: string };
  let sales1Contact: { id: string; name: string; accountId: string };
  let adminDeal: { id: string };
  let sales1Deal: { id: string };

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.task.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.deal.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.account.deleteMany();
    await prisma.stage.deleteMany();
    await prisma.user.deleteMany();

    // Seed stages (required for deals)
    const stages = [
      { name: "New Lead", order: 1, probability: 10, isWon: false, isLost: false },
      { name: "Contact Made", order: 2, probability: 25, isWon: false, isLost: false },
      { name: "Proposal", order: 3, probability: 50, isWon: false, isLost: false },
      { name: "Negotiation", order: 4, probability: 75, isWon: false, isLost: false },
      { name: "Won", order: 5, probability: 100, isWon: true, isLost: false },
      { name: "Lost", order: 6, probability: 0, isWon: false, isLost: true },
    ];
    for (const s of stages) {
      await prisma.stage.create({ data: s });
    }

    admin = await prisma.user.create({
      data: { email: "act-admin@test.com", name: "Admin", passwordHash: hashSync("Admin!2345", 12), role: "ADMIN" },
    });
    sales1 = await prisma.user.create({
      data: { email: "act-sales1@test.com", name: "Sales One", passwordHash: hashSync("Sales!2345", 12), role: "SALES" },
    });
    sales2 = await prisma.user.create({
      data: { email: "act-sales2@test.com", name: "Sales Two", passwordHash: hashSync("Sales!2345", 12), role: "SALES" },
    });

    adminAccount = await prisma.account.create({ data: { name: "Admin Corp", ownerId: admin.id } });
    sales1Account = await prisma.account.create({ data: { name: "Sales1 Co", ownerId: sales1.id } });
    sales2Account = await prisma.account.create({ data: { name: "Sales2 Co", ownerId: sales2.id } });

    sales1Contact = await prisma.contact.create({
      data: { name: "Jane Doe", email: "jane@sales1.com", status: "PROSPECT", accountId: sales1Account.id, ownerId: sales1.id },
    });

    const stage = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
    adminDeal = await prisma.deal.create({
      data: { title: "Admin Deal", value: 10000, stageId: stage!.id, accountId: adminAccount.id, contactId: sales1Contact.id, ownerId: admin.id },
    });
    sales1Deal = await prisma.deal.create({
      data: { title: "Sales1 Deal", value: 5000, stageId: stage!.id, accountId: sales1Account.id, contactId: sales1Contact.id, ownerId: sales1.id },
    });
  });

  const adminUser = () => ({ id: admin.id, role: "ADMIN" as const });
  const sales1User = () => ({ id: sales1.id, role: "SALES" as const });
  const sales2User = () => ({ id: sales2.id, role: "SALES" as const });

  describe("isOwnedRecord", () => {
    it("ADMIN can access any account", async () => {
      expect(await isOwnedRecord("account", sales1Account.id, adminUser())).toBe(true);
      expect(await isOwnedRecord("account", adminAccount.id, adminUser())).toBe(true);
    });

    it("SALES can access only their own account", async () => {
      expect(await isOwnedRecord("account", sales1Account.id, sales1User())).toBe(true);
      expect(await isOwnedRecord("account", adminAccount.id, sales1User())).toBe(false);
      expect(await isOwnedRecord("account", sales2Account.id, sales1User())).toBe(false);
    });

    it("SALES can access only their own deal", async () => {
      expect(await isOwnedRecord("deal", sales1Deal.id, sales1User())).toBe(true);
      expect(await isOwnedRecord("deal", adminDeal.id, sales1User())).toBe(false);
    });

    it("SALES can access only their own contact", async () => {
      expect(await isOwnedRecord("contact", sales1Contact.id, sales1User())).toBe(true);
    });

    it("SALES can access only their own task", async () => {
      const task = await prisma.task.create({
        data: { title: "Test", dueDate: new Date(), assigneeId: sales1.id },
      });
      expect(await isOwnedRecord("task", task.id, sales1User(), "assigneeId")).toBe(true);
      expect(await isOwnedRecord("task", task.id, sales2User(), "assigneeId")).toBe(false);
    });
  });

  describe("assertUserExists", () => {
    it("returns true for existing user", async () => {
      expect(await assertUserExists(admin.id)).toBe(true);
      expect(await assertUserExists(sales1.id)).toBe(true);
    });

    it("returns false for non-existent user", async () => {
      expect(await assertUserExists("non-existent-id")).toBe(false);
    });
  });

  describe("Cross-resource IDOR scenarios", () => {
    it("SALES cannot access deal through another user's contact", async () => {
      // adminDeal belongs to admin, but contact belongs to sales1
      // SALES should not be able to access adminDeal even though contact is theirs
      expect(await isOwnedRecord("deal", adminDeal.id, sales1User())).toBe(false);
    });

    it("SALES cannot access contact through another user's deal", async () => {
      // sales1Deal belongs to sales1, contact belongs to sales1
      // ADMIN should be able to access both
      expect(await isOwnedRecord("contact", sales1Contact.id, adminUser())).toBe(true);
    });

    it("SALES cannot access account through another user's deal", async () => {
      // sales1Deal belongs to sales1, account belongs to sales1
      // SALES should be able to access their own account
      expect(await isOwnedRecord("account", sales1Account.id, sales1User())).toBe(true);
    });
  });
});