"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ownerFilter } from "@/lib/scope";
import { recordAudit, diffChanges } from "@/lib/audit";
import { assertUserExists, isOwnedRecord } from "@/lib/authorize";
import { taskSchema } from "@/lib/validations";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";

function revalidateTaskViews() {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/deals");
}

export async function createTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireAuth();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data");
  const data = parsed.data;

  try {
    if (data.contactId) {
      const contact = await db.contact.findFirst({
        where: { id: data.contactId, ...ownerFilter(session.user) },
      });
      if (!contact) return fail("Contact not found");
    }
    // The related deal is client-supplied — verify it belongs to the user
    // (deal ownership, not task assignment).
    if (data.dealId && !(await isOwnedRecord("deal", data.dealId, session.user, "ownerId"))) {
      return fail("Deal not found");
    }

    const created = await db.task.create({
      data: {
        title: data.title,
        dueDate: new Date(`${data.dueDate}T12:00:00`),
        contactId: data.contactId,
        dealId: data.dealId,
        assigneeId: session.user.id,
      },
    });

    await recordAudit({
      entity: "Task",
      entityId: created.id,
      action: "CREATE",
      userId: session.user.id,
      changes: { title: data.title, dueDate: data.dueDate },
    });
    revalidateTaskViews();
    return ok({ id: created.id });
  } catch (error) {
    logError("createTask", error);
    return fail("Something went wrong. Please try again.");
  }
}

export async function toggleTask(id: string): Promise<ActionResult<{ status: string }>> {
  const session = await requireAuth();

  try {
    const existing = await db.task.findFirst({
      where: { id, ...ownerFilter(session.user, "assigneeId") },
    });
    if (!existing) return fail("Task not found");

    const status = existing.status === "OPEN" ? "DONE" : "OPEN";
    const updated = await db.task.update({ where: { id }, data: { status } });
    await recordAudit({
      entity: "Task",
      entityId: id,
      action: "UPDATE",
      userId: session.user.id,
      changes: diffChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
    });
    revalidateTaskViews();
    return ok({ status });
  } catch (error) {
    logError("toggleTask", error);
    return fail("Something went wrong. Please try again.");
  }
}

export async function deleteTask(id: string): Promise<ActionResult<null>> {
  const session = await requireAuth();

  try {
    const existing = await db.task.findFirst({
      where: { id, ...ownerFilter(session.user, "assigneeId") },
    });
    if (!existing) return fail("Task not found");

    await db.task.delete({ where: { id } });
    await recordAudit({
      entity: "Task",
      entityId: id,
      action: "DELETE",
      userId: session.user.id,
      changes: { id: existing.id, title: existing.title },
    });
    revalidateTaskViews();
    return ok(null);
  } catch (error) {
    logError("deleteTask", error);
    return fail("Something went wrong. Please try again.");
  }
}
