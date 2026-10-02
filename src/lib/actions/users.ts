"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { createUserSchema } from "@/lib/validations";
import { fail, ok, type ActionResult } from "@/lib/action-result";

export async function createUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (session?.user.role !== "ADMIN") return fail("Only administrators can create users");

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data");

  try {
    const exists = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (exists) return fail("A user with this email already exists");

    const created = await db.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        passwordHash: bcrypt.hashSync(parsed.data.password, 10),
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
    console.error("createUser failed", error);
    return fail("Something went wrong. Please try again.");
  }
}
