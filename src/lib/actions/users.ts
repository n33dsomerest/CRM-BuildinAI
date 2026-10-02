"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { createUserSchema } from "@/lib/validations";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";

export async function createUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  // Admin-only. requireAdmin redirects non-admins (the previous raw auth()
  // check trusted the JWT role without the DB-backed redirect guard).
  const session = await requireAdmin();

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data");

  try {
    const exists = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (exists) return fail("A user with this email already exists");

    const created = await db.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        passwordHash: bcrypt.hashSync(parsed.data.password, 12),
        role: parsed.data.role,
      },
    });

    await recordAudit({
      entity: "User",
      entityId: created.id,
      action: "CREATE",
      userId: session.user.id,
      changes: { name: created.name, email: created.email, role: created.role },
    });

    revalidatePath("/admin/users");
    return ok({ id: created.id });
  } catch (error) {
    logError("createUser", error);
    return fail("Something went wrong. Please try again.");
  }
}
