import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface AuditParams {
  entity: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  userId: string;
  changes: unknown;
}

/** Persist an audit trail entry for any mutation. */
export async function recordAudit(params: AuditParams): Promise<void> {
  await db.auditLog.create({
    data: {
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
      userId: params.userId,
      changes: params.changes as Prisma.InputJsonValue,
    },
  });
}

/**
 * Shallow field diff for UPDATE audit entries: { field: { from, to } }.
 * Values are stringified so the JSON payload is always serializable
 * (Decimal, Date, enums…).
 */
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (key === "updatedAt") continue;
    const from = stringify(before[key]);
    const to = stringify(after[key]);
    if (from !== to) changes[key] = { from, to };
  }
  return changes;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
