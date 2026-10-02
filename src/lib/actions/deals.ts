"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ownerFilter } from "@/lib/scope";
import { recordAudit, diffChanges } from "@/lib/audit";
import { assertUserExists, isOwnedRecord } from "@/lib/authorize";
import { dealSchema } from "@/lib/validations";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";

function revalidateDealViews(id?: string) {
  revalidatePath("/");
  revalidatePath("/deals");
  revalidatePath("/contacts");
  revalidatePath("/tasks");
  if (id) revalidatePath(`/contacts/${id}`);
}

export async function saveDeal(input: unknown, id?: string): Promise<ActionResult<{ id: string }>> {
  const session = await requireAuth();
  const parsed = dealSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data");
  const data = parsed.data;

  // Client-supplied foreign keys must all be verified (IDOR + FK safety).
  if (!(await isOwnedRecord("account", data.accountId, session.user))) return fail("Account not found");
  if (!(await isOwnedRecord("contact", data.contactId, session.user))) return fail("Contact not found");
  const contact = await db.contact.findUnique({
    where: { id: data.contactId },
    select: { accountId: true },
  });
  if (contact && contact.accountId !== data.accountId) {
    return fail("Contact does not belong to that account");
  }
  if (session.user.role === "ADMIN" && !(await assertUserExists(data.ownerId))) {
    return fail("Selected owner does not exist");
  }

  try {
    if (id) {
      const existing = await db.deal.findFirst({
        where: { id, ...ownerFilter(session.user) },
      });
      if (!existing) return fail("Deal not found");

      const ownerId = session.user.role === "ADMIN" ? data.ownerId : existing.ownerId;
      const updated = await db.deal.update({
        where: { id },
        data: {
          title: data.title,
          value: data.value,
          stageId: data.stageId,
          accountId: data.accountId,
          contactId: data.contactId,
          ownerId,
          expectedCloseDate: data.expectedCloseDate ? new Date(`${data.expectedCloseDate}T12:00:00`) : null,
        },
      });

      await recordAudit({
        entity: "Deal",
        entityId: id,
        action: "UPDATE",
        userId: session.user.id,
        changes: diffChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
      });
      revalidateDealViews(id);
      return ok({ id });
    }

    const created = await db.deal.create({
      data: {
        title: data.title,
        value: data.value,
        stageId: data.stageId,
        accountId: data.accountId,
        contactId: data.contactId,
        ownerId: session.user.role === "ADMIN" ? data.ownerId : session.user.id,
        expectedCloseDate: data.expectedCloseDate ? new Date(`${data.expectedCloseDate}T12:00:00`) : null,
      },
    });

    await recordAudit({
      entity: "Deal",
      entityId: created.id,
      action: "CREATE",
      userId: session.user.id,
      changes: { title: created.title, value: String(created.value) },
    });
    revalidateDealViews(created.id);
    return ok({ id: created.id });
  } catch (error) {
    logError("saveDeal", error);
    return fail("Something went wrong. Please try again.");
  }
}

export async function moveDealStage(dealId: string, stageId: string): Promise<ActionResult<{ stageName: string }>> {
  const session = await requireAuth();

  try {
    const deal = await db.deal.findFirst({
      where: { id: dealId, ...ownerFilter(session.user) },
      include: { stage: { select: { name: true } } },
    });
    if (!deal) return fail("Deal not found");

    const stage = await db.stage.findUnique({ where: { id: stageId } });
    if (!stage) return fail("Stage not found");
    if (stage.id === deal.stageId) return ok({ stageName: stage.name });

    await db.deal.update({ where: { id: dealId }, data: { stageId } });
    await recordAudit({
      entity: "Deal",
      entityId: dealId,
      action: "UPDATE",
      userId: session.user.id,
      changes: { stage: { from: deal.stage.name, to: stage.name } },
    });
    revalidateDealViews();
    return ok({ stageName: stage.name });
  } catch (error) {
    logError("moveDealStage", error);
    return fail("Something went wrong. Please try again.");
  }
}

export async function deleteDeal(id: string): Promise<ActionResult<null>> {
  const session = await requireAuth();

  try {
    const existing = await db.deal.findFirst({
      where: { id, ...ownerFilter(session.user) },
    });
    if (!existing) return fail("Deal not found");

    await db.deal.delete({ where: { id } });
    await recordAudit({
      entity: "Deal",
      entityId: id,
      action: "DELETE",
      userId: session.user.id,
      changes: { id: existing.id, title: existing.title },
    });
    revalidateDealViews();
    return ok(null);
  } catch (error) {
    logError("deleteDeal", error);
    return fail("Something went wrong. Please try again.");
  }
}
