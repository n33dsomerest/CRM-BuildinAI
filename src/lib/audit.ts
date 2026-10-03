import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface AuditParams {
  entity: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  userId: string;
  changes: unknown;
}

/** Customer PII fields — the single source of truth shared with the AI prompt
 *  redactor (src/lib/ai/redact.ts) so prompt hygiene can never drift from
 *  audit redaction. */
export const PII_FIELDS = ["email", "phone"] as const;

/** Default redaction set: customer PII and credentials — always stripped. */
const SENSITIVE_FIELDS = [...PII_FIELDS, "passwordHash"] as const;

/** For the User entity, `email` is the account identifier (not customer PII)
 *  and the audit trail needs it to say which account was touched. */
const USER_SENSITIVE_FIELDS = ["phone", "passwordHash"] as const;

function sensitiveFieldsFor(entity: string): readonly string[] {
  return entity === "User" ? USER_SENSITIVE_FIELDS : SENSITIVE_FIELDS;
}

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
      changes: redact(
        params.changes as Record<string, unknown>,
        sensitiveFieldsFor(params.entity)
      ) as Prisma.InputJsonValue,
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
