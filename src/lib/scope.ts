/**
 * Row-level ownership scoping — the enterprise rule that keeps every list query
 * honest: SALES sees only records they own, ADMIN sees everything.
 * Pure function so it can be unit-tested without a database.
 */

export type AppRole = "ADMIN" | "SALES";

export interface ScopedUser {
  id: string;
  role: AppRole;
}

/**
 * Prisma `where` fragment restricting `field` to the user unless they are ADMIN.
 * Generic over the calling model's WhereInput so it composes at every call site:
 *   db.contact.findMany({ where: ownerFilter(user) })
 *   db.deal.findFirst({ where: { id, ...ownerFilter(user) } })
 */
export function ownerFilter<W extends object>(user: ScopedUser, field = "ownerId"): W {
  if (user.role === "ADMIN") return {} as W;
  return { [field]: user.id } as W;
}
