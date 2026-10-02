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
 * Returns a plain object that composes with any Prisma WhereInput.
 */
export function ownerFilter(user: ScopedUser, field = "ownerId"): Record<string, unknown> {
  if (user.role === "ADMIN") return {};
  return { [field]: user.id };
}
