"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ownerFilter } from "@/lib/scope";
import { recordAudit, diffChanges } from "@/lib/audit";
import { accountSchema } from "@/lib/validations";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";

function revalidateAccountViews(id?: string) {
  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/contacts");
  revalidatePath("/deals");
  if (id) revalidatePath(`/accounts/${id}`);
}

export async function saveAccount(input: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  const session = await requireAuth();
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data");

  try {
    const created = await db.account.create({
      data: { ...parsed.data, ownerId: session.user.id },
      select: { id: true, name: true },
    });
    await recordAudit({
      entity: "Account",
      entityId: created.id,
      action: "CREATE",
      userId: session.user.id,
      changes: { name: created.name },
    });
    revalidateAccountViews(created.id);
    return ok(created);
  } catch (error) {
    logError("saveAccount", error);
    return fail("Something went wrong. Please try again.");
  }
}

export async function updateAccount(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireAuth();
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data");

  try {
    const existing = await db.account.findFirst({
      where: { id, ...ownerFilter(session.user) },
    });
    if (!existing) return fail("Account not found");

    const updated = await db.account.update({ where: { id }, data: parsed.data });
    await recordAudit({
      entity: "Account",
      entityId: id,
      action: "UPDATE",
      userId: session.user.id,
      changes: diffChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
    });
    revalidateAccountViews(id);
    return ok({ id });
  } catch (error) {
    logError("updateAccount", error);
    return fail("Something went wrong. Please try again.");
  }
}

export async function deleteAccount(id: string): Promise<ActionResult<null>> {
  const session = await requireAuth();

  try {
    const existing = await db.account.findFirst({
      where: { id, ...ownerFilter(session.user) },
    });
    if (!existing) return fail("Account not found");

    // Cascades to the account's contacts, their deals, activities and tasks.
    await db.account.delete({ where: { id } });
    await recordAudit({
      entity: "Account",
      entityId: id,
      action: "DELETE",
      userId: session.user.id,
      changes: { id: existing.id, name: existing.name, cascade: true },
    });
    revalidateAccountViews();
    return ok(null);
  } catch (error) {
    logError("deleteAccount", error);
    return fail("Something went wrong. Please try again.");
  }
}
