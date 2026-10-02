/*
 * Audit retention: removes audit entries older than 90 days.
 * Run with: npm run db:prune-audit
 */
import { PrismaClient } from "@prisma/client";

const RETENTION_DAYS = 90;

async function main() {
  const prisma = new PrismaClient();
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    console.log(`Pruned ${result.count} audit entries older than ${RETENTION_DAYS} days (before ${cutoff.toISOString()}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[db:prune-audit] ${error instanceof Error ? error.name : "unknown"}`);
  process.exit(1);
});
