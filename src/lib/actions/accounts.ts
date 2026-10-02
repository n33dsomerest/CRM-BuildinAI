"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { accountSchema } from "@/lib/validations";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";

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
    revalidatePath("/contacts");
    revalidatePath("/deals");
    return ok(created);
  } catch (error) {
    logError("saveAccount", error);
    return fail("Something went wrong. Please try again.");
  }
}
