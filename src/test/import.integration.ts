import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/test/setup";
import { hashSync } from "bcryptjs";

vi.mock("@/lib/session", () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireAuth } from "@/lib/session";
// Import the REAL shipped logic - no reimplementation in the test.
import { parseImportCsv, MAX_CSV_BYTES, MAX_ROWS, ERROR_ABORT_RATIO } from "@/lib/csv-import";

const asUser = (u: { id: string; role: "ADMIN" | "SALES" }) =>
  vi.mocked(requireAuth).mockResolvedValue({ user: u } as never);

describe("CSV import: shipped caps + validate-first logic (integration)", () => {
  it("exposes the shipped cap constants", () => {
    expect(MAX_CSV_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_ROWS).toBe(2_000);
    expect(ERROR_ABORT_RATIO).toBe(0.1);
  });

  it("rejects CSV larger than 2 MB", () => {
    const header = "name,email,company,status\n";
    const row = "Valid Person,valid@test.com,Test Co,PROSPECT\n";
    const bigCsv = header + row.repeat(Math.ceil((2 * 1024 * 1024 + 1024) / row.length));
    expect(bigCsv.length).toBeGreaterThan(MAX_CSV_BYTES);
    const result = parseImportCsv(bigCsv);
    expect(result.aborted).toBe(true);
    expect(result.rejected).toBe("CSV too large — max 2 MB per import");
  });

  it("rejects CSV with more than 2000 rows", () => {
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => `Name${i},test${i}@x.com,+15550000,Test Co,PROSPECT`);
    const csv = "name,email,phone,company,status\n" + rows.join("\n");
    const result = parseImportCsv(csv);
    expect(result.aborted).toBe(true);
    expect(result.rejected).toBe("CSV too large — max 2,000 rows per import");
  });

  it("aborts when more than 10% of rows fail validation", () => {
    const rows = [
      "Valid,valid@test.com,+15550000,Test Co,PROSPECT",
      "NoEmail,,+15550000,Test Co,PROSPECT",
      "NoCompany,valid2@test.com,+15550000,,PROSPECT",
    ];
    const csv = "name,email,phone,company,status\n" + rows.join("\n");
    const result = parseImportCsv(csv);
    expect(result.aborted).toBe(true);
    // validRows are returned but the caller (importContactsCsv) refuses to write them
    expect(result.validRows).toHaveLength(2);
  });

  it("accepts a fully valid CSV", () => {
    const rows = [
      "Valid,valid@test.com,+15550000,Test Co,PROSPECT",
      "Valid2,valid2@test.com,+15550000,Test Co,CUSTOMER",
    ];
    const csv = "name,email,phone,company,status\n" + rows.join("\n");
    const result = parseImportCsv(csv);
    expect(result.aborted).toBe(false);
    expect(result.validRows).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects rows missing company name", () => {
    const csv = "name,email,phone,company,status\nValid,valid@test.com,+15550000,,PROSPECT";
    const result = parseImportCsv(csv);
    expect(result.validRows).toHaveLength(0);
    expect(result.errors[0]).toContain("missing company name");
  });

  it("rejects rows with malformed emails", () => {
    const csv = "name,email,phone,company,status\nValid,not-an-email,+15550000,Test Co,PROSPECT";
    const result = parseImportCsv(csv);
    expect(result.validRows).toHaveLength(0);
    expect(result.errors[0]).toContain("Invalid email");
  });
});

describe("CSV double-import through the real action (integration)", () => {
  it("second identical import reports everything skipped", async () => {
    const csv = [
      "name,email,phone,company,status",
      "Valid,valid@test.com,+15550000,Test Co,PROSPECT",
    ].join("\n");

    const sales = await prisma.user.create({
      data: { email: "imp-sales@test.com", name: "Sales", passwordHash: hashSync("Sales!2345", 12), role: "SALES" },
    });
    asUser({ id: sales.id, role: "SALES" });

    // Dynamically import so the mock is definitely in place for the action module
    const { importContactsCsv } = await import("@/lib/actions/contacts");

    const first = await importContactsCsv(csv);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.data.created).toBe(1);

    const second = await importContactsCsv(csv);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.created).toBe(0);
      expect(second.data.skipped).toBe(1);
      expect(second.data.aborted).toBe(false);
    }

    const totalContacts = await prisma.contact.count({ where: { email: "valid@test.com" } });
    expect(totalContacts).toBe(1);
  });
});
