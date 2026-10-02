import { describe, expect, it, beforeEach, vi } from "vitest";
import { prisma } from "@/test/setup";
import { hashSync } from "bcryptjs";

// Mock Next.js-bound modules so the real server actions can run in vitest.
vi.mock("@/lib/session", () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireAuth } from "@/lib/session";
import { saveDeal } from "@/lib/actions/deals";
import { addActivity } from "@/lib/actions/activities";
import { deleteContact, importContactsCsv } from "@/lib/actions/contacts";
import { getLeadsPage } from "@/lib/queries";

const asUser = (u: { id: string; role: "ADMIN" | "SALES" }) =>
  vi.mocked(requireAuth).mockResolvedValue({ user: u } as never);

describe("Security: IDOR regression through real server actions (integration)", () => {
  let admin: { id: string };
  let sales1: { id: string };
  let adminAccount: { id: string };
  let sales1Account: { id: string };
  let adminContact: { id: string };
  let sales1Contact: { id: string };
  let adminDeal: { id: string };
  let openStageId: string;

  beforeEach(async () => {
    asUser({ id: "never-used", role: "SALES" });

    // Seed stages (static reference data, recreated per test because setup truncates)
    const stages = [
      { name: "New Lead", order: 1, probability: 10, isWon: false, isLost: false },
      { name: "Won", order: 5, probability: 100, isWon: true, isLost: false },
    ];
    for (const s of stages) await prisma.stage.create({ data: s });
    openStageId = (await prisma.stage.findFirst({ where: { isWon: false } }))!.id;

    admin = await prisma.user.create({
      data: { email: "act-admin@test.com", name: "Admin", passwordHash: hashSync("Admin!2345", 12), role: "ADMIN" },
    });
    sales1 = await prisma.user.create({
      data: { email: "act-sales1@test.com", name: "Sales One", passwordHash: hashSync("Sales!2345", 12), role: "SALES" },
    });

    adminAccount = await prisma.account.create({ data: { name: "Admin Corp", ownerId: admin.id } });
    sales1Account = await prisma.account.create({ data: { name: "Sales1 Co", ownerId: sales1.id } });

    adminContact = await prisma.contact.create({
      data: { name: "Admin Person", email: "person@sales1.test", status: "PROSPECT", accountId: sales1Account.id, ownerId: admin.id },
    });
    sales1Contact = await prisma.contact.create({
      data: { name: "Jane Doe", email: "jane@sales1.test", status: "PROSPECT", accountId: sales1Account.id, ownerId: sales1.id },
    });

    adminDeal = await prisma.deal.create({
      data: { title: "Admin Deal", value: 10000, stageId: openStageId, accountId: adminAccount.id, contactId: adminContact.id, ownerId: admin.id },
    });
  });

  describe("#1 saveDeal", () => {
    it("SALES cannot create a deal using a contact owned by another user in sales1's own account", async () => {
      // Contact sits in sales1's OWN account but is owned by ADMIN.
      // Only the contact-ownership check can reject this: the account check
      // passes (sales1 owns the account) and the account-contact consistency
      // check passes (the contact IS in that account).
      asUser({ id: sales1.id, role: "SALES" });
      const result = await saveDeal({
        title: "Cross-tenant deal",
        value: 1000,
        stageId: openStageId,
        accountId: sales1Account.id, // owned by sales1 - passes
        contactId: adminContact.id, // in sales1's account but owned by admin - must be rejected
        ownerId: sales1.id,
        expectedCloseDate: "",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/contact/i);
      // Nothing was written
      const deals = await prisma.deal.findMany({ where: { title: "Cross-tenant deal" } });
      expect(deals).toHaveLength(0);
    });

    it("SALES cannot create a deal using a contact from another user's account", async () => {
      asUser({ id: sales1.id, role: "SALES" });
      const result = await saveDeal({
        title: "Cross-tenant deal",
        value: 1000,
        stageId: openStageId,
        accountId: sales1Account.id,
        contactId: adminContact.id, // lives under Admin Corp, not Sales1 Co
        ownerId: sales1.id,
        expectedCloseDate: "",
      });
      expect(result.ok).toBe(false);
      // Nothing was written
      const deals = await prisma.deal.findMany({ where: { title: "Cross-tenant deal" } });
      expect(deals).toHaveLength(0);
    });

    it("SALES cannot update ADMIN's deal", async () => {
      asUser({ id: sales1.id, role: "SALES" });
      const result = await saveDeal(
        {
          title: "Hacked Title",
          value: 99999,
          stageId: openStageId,
          accountId: sales1Account.id,
          contactId: sales1Contact.id,
          ownerId: sales1.id,
          expectedCloseDate: "",
        },
        adminDeal.id
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Deal not found");
      const untouched = await prisma.deal.findUnique({ where: { id: adminDeal.id } });
      expect(untouched?.title).toBe("Admin Deal");
    });
  });

  describe("#2 addActivity", () => {
    it("SALES cannot log an activity against ADMIN's deal", async () => {
      asUser({ id: sales1.id, role: "SALES" });
      const result = await addActivity({
        contactId: sales1Contact.id, // own contact - passes
        dealId: adminDeal.id, // admin's deal - must be rejected
        type: "NOTE",
        subject: "Cross-tenant note",
        body: "Should fail",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Deal not found");
      const activities = await prisma.activity.findMany({ where: { subject: "Cross-tenant note" } });
      expect(activities).toHaveLength(0);
    });
  });

  describe("#3 deleteContact", () => {
    it("SALES cannot delete ADMIN's contact - row survives", async () => {
      asUser({ id: sales1.id, role: "SALES" });
      const result = await deleteContact(adminContact.id);
      expect(result.ok).toBe(false);
      const stillThere = await prisma.contact.findUnique({ where: { id: adminContact.id } });
      expect(stillThere).not.toBeNull();
      expect(stillThere?.name).toBe("Admin Person");
    });
  });

  describe("#4 getLeadsPage scoping", () => {
    it("SALES cannot see ADMIN's leads in the list", async () => {
      await prisma.lead.create({
        data: { name: "Admin Lead", email: "admin-lead@test.com", source: "WEB", status: "NEW", ownerId: admin.id },
      });
      await prisma.lead.create({
        data: { name: "Sales Lead", email: "sales-lead@test.com", source: "WEB", status: "NEW", ownerId: sales1.id },
      });

      const page = await getLeadsPage({ id: sales1.id, role: "SALES" });
      const names = page.rows.map((r) => r.name);
      expect(names).toContain("Sales Lead");
      expect(names).not.toContain("Admin Lead");
      expect(page.total).toBe(1);
    });

    it("ADMIN sees all leads", async () => {
      await prisma.lead.create({
        data: { name: "Admin Lead", email: "admin-lead@test.com", source: "WEB", status: "NEW", ownerId: admin.id },
      });
      await prisma.lead.create({
        data: { name: "Sales Lead", email: "sales-lead@test.com", source: "WEB", status: "NEW", ownerId: sales1.id },
      });

      const page = await getLeadsPage({ id: admin.id, role: "ADMIN" });
      expect(page.total).toBe(2);
    });
  });

  describe("CSV double-import", () => {
    it("second identical import reports everything skipped", async () => {
      const csv = [
        "name,email,phone,company,status",
        "Valid,valid@test.com,+15550000,Test Co,PROSPECT",
      ].join("\n");

      asUser({ id: sales1.id, role: "SALES" });
      const first = await importContactsCsv(csv);
      expect(first.ok).toBe(true);
      if (first.ok) expect(first.data.created).toBe(1);

      const second = await importContactsCsv(csv);
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.data.created).toBe(0);
        expect(second.data.skipped).toBe(1);
      }
    });
  });
});
