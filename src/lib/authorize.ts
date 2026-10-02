import { db } from "@/lib/db";
import { ownerFilter, type ScopedUser } from "@/lib/scope";

export type OwnedModel = "account" | "contact" | "deal" | "lead" | "activity" | "task";

/**
 * Verifies that a client-supplied record id actually exists AND belongs to the
 * user (ADMINs pass for any record). Returns `false` instead of throwing so
 * server actions can map it to `fail(...)`.
 */
export async function isOwnedRecord(
  model: OwnedModel,
  id: string,
  user: ScopedUser,
  field = "ownerId",
): Promise<boolean> {
  switch (model) {
    case "account":
      return (await db.account.findFirst({ where: { id, ...ownerFilter(user, field) }, select: { id: true } })) !== null;
    case "contact":
      return (await db.contact.findFirst({ where: { id, ...ownerFilter(user, field) }, select: { id: true } })) !== null;
    case "deal":
      return (await db.deal.findFirst({ where: { id, ...ownerFilter(user, field) }, select: { id: true } })) !== null;
    case "lead":
      return (await db.lead.findFirst({ where: { id, ...ownerFilter(user, field) }, select: { id: true } })) !== null;
    case "activity":
      return (await db.activity.findFirst({ where: { id, ...ownerFilter(user, field) }, select: { id: true } })) !== null;
    case "task":
      return (await db.task.findFirst({ where: { id, ...ownerFilter(user, field) }, select: { id: true } })) !== null;
  }
}

/** Guards ADMIN-supplied foreign keys (ownerId, assigneeId) against FK errors. */
export async function assertUserExists(id: string): Promise<boolean> {
  return (await db.user.findUnique({ where: { id }, select: { id: true } })) !== null;
}
