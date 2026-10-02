import { describe, expect, it } from "vitest";
import { mapStagesToFunnel, type StageWithDeals } from "@/lib/queries";
import { Prisma } from "@prisma/client";

const stage = (over: Partial<StageWithDeals> = {}): StageWithDeals => ({
  id: "stage-1",
  name: "Proposal",
  order: 3,
  probability: 50,
  isWon: false,
  isLost: false,
  deals: [],
  ...over,
});

const deal = (over: Partial<StageWithDeals["deals"][number]> = {}): StageWithDeals["deals"][number] => ({
  id: "deal-1",
  title: "Cloud Migration",
  value: new Prisma.Decimal("50000"),
  expectedCloseDate: null,
  contactId: "contact-1",
  contact: { name: "Jane Doe", account: { name: "Acme Corp" } },
  owner: { id: "user-1", name: "Sarah Chen" },
  ...over,
});

describe("mapStagesToFunnel", () => {
  it("converts Decimal values to numbers and computes column totals", () => {
    const [column] = mapStagesToFunnel([
      stage({ deals: [deal({ value: new Prisma.Decimal("50000") }), deal({ id: "deal-2", value: new Prisma.Decimal("25000.5") })] }),
    ]);
    expect(column.deals.map((d) => d.value)).toEqual([50000, 25000.5]);
    expect(column.totalValue).toBe(75000.5);
  });

  it("weights column value by stage probability", () => {
    const [column] = mapStagesToFunnel([stage({ probability: 50, deals: [deal()] })]);
    expect(column.weightedValue).toBe(25000);
  });

  it("keeps won/lost flags on the column", () => {
    const [won, lost] = mapStagesToFunnel([
      stage({ id: "s-won", name: "Won", isWon: true, probability: 100, deals: [deal()] }),
      stage({ id: "s-lost", name: "Lost", isLost: true, probability: 0, deals: [deal()] }),
    ]);
    expect(won.isWon).toBe(true);
    expect(lost.isLost).toBe(true);
    expect(won.weightedValue).toBe(50000);
    expect(lost.weightedValue).toBe(0);
  });

  it("maps contact, account and owner names onto deal cards", () => {
    const [column] = mapStagesToFunnel([stage({ deals: [deal()] })]);
    expect(column.deals[0]).toMatchObject({
      title: "Cloud Migration",
      contactName: "Jane Doe",
      accountName: "Acme Corp",
      ownerName: "Sarah Chen",
      ownerId: "user-1",
      contactId: "contact-1",
      stageId: "stage-1",
    });
  });

  it("returns empty columns for stages without deals", () => {
    const [column] = mapStagesToFunnel([stage({})]);
    expect(column.deals).toEqual([]);
    expect(column.totalValue).toBe(0);
    expect(column.weightedValue).toBe(0);
  });
});
