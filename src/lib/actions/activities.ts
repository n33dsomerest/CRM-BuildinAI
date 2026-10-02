"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ownerFilter } from "@/lib/scope";
import { recordAudit } from "@/lib/audit";
import { activitySchema } from "@/lib/validations";
import { fail, ok, type ActionResult } from "@/lib/action-result";

export async function addActivity(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireAuth();
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data");
  const data = parsed.data;

  try {
    const contact = await db.contact.findFirst({
      where: { id: data.contactId, ...ownerFilter(session.user) },
    });
    if (!contact) return fail("Contact not found");

    const created = await db.activity.create({
      data: {
        type: data.type,
        subject: data.subject,
        body: data.body,
        contactId: contact.id,
        dealId: data.dealId,
        userId: session.user.id,
      },
    });

    await recordAudit({
      entity: "Activity",
      entityId: created.id,
      action: "CREATE",
      userId: session.user.id,
      changes: { type: data.type, subject: data.subject, contactId: contact.id },
    });

    revalidatePath(`/contacts/${contact.id}`);
    revalidatePath("/");
    return ok({ id: created.id });
  } catch (error) {
    console.error("addActivity failed", error);
    return fail("Something went wrong. Please try again.");
  }
}
