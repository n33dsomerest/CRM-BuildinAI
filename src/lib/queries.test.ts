import { describe, expect, it } from "vitest";
import { mapStagesToFunnel, type DealWithRelations, type FunnelStage } from "@/lib/queries";
import { Prisma } from "@prisma/client";

const stage = (over: Partial<FunnelStage> = {}): FunnelStage => ({
  id: "stage-1",
  name: "Proposal",
  order: 3,
  probability: 50,
  isWon: false,
  isLost: false,
  ...over,
});

const deal = (over: Partial<DealWithRelations> = {}): DealWithRelations => ({
  id: "deal-1",
  title: "Cloud Migration",
  value: new Prisma.Decimal("50000"),
  stageId: "stage-1",
  expectedCloseDate: null,
  contactId: "contact-1",
  contact: { name: "Jane Doe", account: { name: "Acme Corp" } },
  owner: { id: "user-1", name: "Sarah Chen" },
  ...over,
});

// The funnel is built from flat rows (stages + deals) so the page can issue both
// queries concurrently instead of chaining Prisma's per-relation round-trips.
const funnel = (stages: FunnelStage[], deals: DealWithRelations[] = []) => mapStagesToFunnel(stages, deals);

describe("mapStagesToFunnel", () => {
  it("converts Decimal values to numbers and computes column totals", () => {
    const [column] = funnel(
      [stage()],
      [deal({ value: new Prisma.Decimal("50000") }), deal({ id: "deal-2", value: new Prisma.Decimal("25000.5") })]
    );
    expect(column.deals.map((d) => d.value)).toEqual([50000, 25000.5]);
    expect(column.totalValue).toBe(75000.5);
  });

  it("weights column value by stage probability", () => {
    const [column] = funnel([stage({ probability: 50 })], [deal()]);
    expect(column.weightedValue).toBe(25000);
  });

  it("keeps won/lost flags on the column", () => {
    const [won, lost] = funnel(
      [
        stage({ id: "s-won", name: "Won", isWon: true, probability: 100 }),
        stage({ id: "s-lost", name: "Lost", isLost: true, probability: 0 }),
      ],
      [deal({ stageId: "s-won" }), deal({ id: "deal-2", stageId: "s-lost" })]
    );
    expect(won.isWon).toBe(true);
    expect(lost.isLost).toBe(true);
    expect(won.weightedValue).toBe(50000);
    expect(lost.weightedValue).toBe(0);
  });

  it("maps contact, account and owner names onto deal cards", () => {
    const [column] = funnel([stage()], [deal()]);
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
    const [column] = funnel([stage()]);
    expect(column.deals).toEqual([]);
    expect(column.totalValue).toBe(0);
    expect(column.weightedValue).toBe(0);
  });

  it("groups deals into the column matching their stageId", () => {
    const columns = funnel(
      [stage({ id: "s-a", name: "A" }), stage({ id: "s-b", name: "B" })],
      [deal({ id: "d-a", stageId: "s-a" }), deal({ id: "d-b", stageId: "s-b" }), deal({ id: "d-a2", stageId: "s-a" })]
    );
    expect(columns[0].deals.map((d) => d.id)).toEqual(["d-a", "d-a2"]);
    expect(columns[1].deals.map((d) => d.id)).toEqual(["d-b"]);
    expect(columns[0].totalValue).toBe(100000);
  });

  it("preserves the stage order it was given", () => {
    const columns = funnel([stage({ id: "s-3", order: 3 }), stage({ id: "s-1", order: 1 })]);
    expect(columns.map((c) => c.id)).toEqual(["s-3", "s-1"]);
  });

  it("drops deals whose stageId matches no stage instead of inventing a column", () => {
    const columns = funnel([stage({ id: "s-a" })], [deal({ stageId: "orphan" })]);
    expect(columns).toHaveLength(1);
    expect(columns[0].deals).toEqual([]);
  });
});