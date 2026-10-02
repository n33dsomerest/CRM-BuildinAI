import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface AuditParams {
  entity: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  userId: string;
  changes: unknown;
}

/** Fields that must never end up in the audit trail. */
const SENSITIVE_FIELDS = ["email", "phone", "passwordHash"] as const;

/**
 * Strips sensitive fields from an audit payload — works for both plain record
 * snapshots and `{ field: { from, to } }` diffs (top-level keys are the same).
 */
export function redact<T extends Record<string, unknown>>(
  record: T,
  fields: readonly string[] = SENSITIVE_FIELDS
): Partial<T> {
  const copy = { ...record };
  for (const field of fields) delete copy[field];
  return copy;
}

/** Persist an audit trail entry. Every payload passes through `redact`. */
export async function recordAudit(params: AuditParams): Promise<void> {
  await db.auditLog.create({
    data: {
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
      userId: params.userId,
      changes: redact(params.changes as Record<string, unknown>) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Shallow field diff for UPDATE audit entries: { field: { from, to } }.
 * Values are stringified so the JSON payload is always serializable
 * (Decimal, Date, enums…). Sensitive keys are dropped by `recordAudit`.
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
