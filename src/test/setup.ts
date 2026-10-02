import { beforeAll, afterAll, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// Integration tests run against a dedicated THROWAWAY test database and
// truncate it between tests. Only the explicit *_TEST variables are accepted —
// deliberately NO fallback to DIRECT_URL/DATABASE_URL: those point at the real
// database, and silently truncating it would be catastrophic.
//
// Three guards below, in order:
//   1. not set / empty / whitespace  → refuse
//   2. same database as the app DB   → refuse (tests TRUNCATE every table)
//   3. db name does not look like a test database → refuse

function normalizeDbUrl(url: string): string {
  // Ignore trailing slash and query string so cosmetic differences don't fool the check.
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:${u.password}@${u.host}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

const testDbUrl = (process.env.DIRECT_URL_TEST || process.env.DATABASE_URL_TEST || "").trim();

if (!testDbUrl) {
  throw new Error(
    "Integration tests refuse to run: set DIRECT_URL_TEST (or DATABASE_URL_TEST) in the " +
      "environment or .env — see .env.example. It must point at a throwaway database, never production."
  );
}

const appUrls = [process.env.DIRECT_URL, process.env.DATABASE_URL]
  .filter((v): v is string => Boolean(v))
  .map(normalizeDbUrl);

if (appUrls.includes(normalizeDbUrl(testDbUrl))) {
  throw new Error(
    "Integration tests refuse to run: DIRECT_URL_TEST / DATABASE_URL_TEST point at the same " +
      "database as DATABASE_URL / DIRECT_URL. These tests TRUNCATE every table on each run. " +
      "Point the *_TEST variables at a separate throwaway database."
  );
}

const dbName = (() => {
  try {
    return new URL(testDbUrl).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
})();
if (dbName && !/test/i.test(dbName)) {
  throw new Error(
    `Integration tests refuse to run: database name "${dbName}" does not contain "test". ` +
      "These tests truncate every table on each run."
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
