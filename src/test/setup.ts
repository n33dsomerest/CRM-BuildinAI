import { beforeAll, afterAll, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// All integration tests run against a dedicated test database.
// Resolution order: DIRECT_URL_TEST → DATABASE_URL_TEST → DIRECT_URL → DATABASE_URL.
const testDbUrl =
  process.env.DIRECT_URL_TEST ??
  process.env.DATABASE_URL_TEST ??
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL;

if (!testDbUrl) {
  throw new Error(
    "Integration tests need a test database URL. Set DIRECT_URL_TEST (or DATABASE_URL_TEST) " +
      "in the environment or .env — see .env.example. It must point at a throwaway database, never production."
  );
}

// Redirect EVERYTHING in this process to the test database — the server
// actions under test create their own client from @/lib/db, which reads
// DATABASE_URL at import time. setupFiles run before test-file imports,
// so this override lands before any PrismaClient is constructed.
process.env.DATABASE_URL = testDbUrl;
process.env.DIRECT_URL = testDbUrl;

const prisma = new PrismaClient({
  datasources: {
    db: { url: testDbUrl },
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
