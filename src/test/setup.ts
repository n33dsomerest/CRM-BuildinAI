import { beforeAll, afterAll, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// All integration tests run against the test database.
// The `test:integration` script sets DIRECT_URL to crmglm_test.
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL },
  },
});

const orderedModels = [
  "auditLog",
  "task",
  "activity",
  "deal",
  "lead",
  "contact",
  "account",
  "stage",
  "user",
  "loginAttempt",
];

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  // Truncate in FK-safe order (children first)
  for (const model of orderedModels) {
    await (prisma as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[model].deleteMany();
  }
});

// Silence console.error in tests (log hygiene)
vi.spyOn(console, "error").mockImplementation(() => {});

export { prisma };
