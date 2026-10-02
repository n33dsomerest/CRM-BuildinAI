"use server";

import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ownerFilter } from "@/lib/scope";
import { recordAudit, diffChanges } from "@/lib/audit";
import { contactSchema, contactImportRowSchema } from "@/lib/validations";
import { fail, ok, type ActionResult } from "@/lib/action-result";

function revalidateContactViews(id?: string) {
  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath("/deals");
  revalidatePath("/tasks");
  if (id) revalidatePath(`/contacts/${id}`);
}

export async function saveContact(input: unknown, id?: string): Promise<ActionResult<{ id: string }>> {
  const session = await requireAuth();
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data");
  const data = parsed.data;

  try {
    if (id) {
      const existing = await db.contact.findFirst({
        where: { id, ...ownerFilter(session.user) },
      });
      if (!existing) return fail("Contact not found");

      // Only admins may reassign ownership.
      const ownerId = session.user.role === "ADMIN" ? data.ownerId : existing.ownerId;
      const updated = await db.contact.update({
        where: { id },
        data: { ...data, ownerId },
      });

      await recordAudit({
        entity: "Contact",
        entityId: id,
        action: "UPDATE",
        userId: session.user.id,
        changes: diffChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
      });
      revalidateContactViews(id);
      return ok({ id });
    }

    const created = await db.contact.create({
      data: {
        ...data,
        ownerId: session.user.role === "ADMIN" ? data.ownerId : session.user.id,
      },
    });

    await recordAudit({
      entity: "Contact",
      entityId: created.id,
      action: "CREATE",
      userId: session.user.id,
      changes: created,
    });
    revalidateContactViews(created.id);
    return ok({ id: created.id });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return fail("A contact with this email already exists in the account");
    }
    console.error("saveContact failed", error);
    return fail("Something went wrong. Please try again.");
  }
}

export async function deleteContact(id: string): Promise<ActionResult<null>> {
  const session = await requireAuth();

  try {
    const existing = await db.contact.findFirst({
      where: { id, ...ownerFilter(session.user) },
    });
    if (!existing) return fail("Contact not found");

    await db.contact.delete({ where: { id } });
    await recordAudit({
      entity: "Contact",
      entityId: id,
      action: "DELETE",
      userId: session.user.id,
      changes: existing,
    });
    revalidateContactViews();
    return ok(null);
  } catch (error) {
    console.error("deleteContact failed", error);
    return fail("Something went wrong. Please try again.");
  }
}

export interface ImportSummary {
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * CSV import with the enterprise hygiene rules: rows are validated, accounts are
 * matched case-insensitively (created when missing) and duplicates
 * (same account + email) are skipped.
 * Expected columns: name,email,phone,company,status
 */
export async function importContactsCsv(csv: string): Promise<ActionResult<ImportSummary>> {
  const session = await requireAuth();

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (!parsed.data.length) return fail("No rows found in the CSV file");

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, row] of parsed.data.entries()) {
    const normalized = {
      name: row.name,
      email: row.email,
      phone: row.phone,
      company: row.company,
      status: row.status?.trim().toUpperCase(),
    };
    const check = contactImportRowSchema.safeParse(normalized);
    if (!check.success) {
      errors.push(`Row ${index + 2}: ${check.error.issues[0]?.message ?? "invalid row"}`);
      continue;
    }
    const data = check.data;

    try {
      let account = data.company
        ? await db.account.findFirst({
            where: { name: { equals: data.company, mode: "insensitive" }, ...ownerFilter(session.user) },
          })
        : null;

      if (!account && data.company) {
        account = await db.account.create({
          data: { name: data.company, ownerId: session.user.id },
        });
      }
      if (!account) {
        errors.push(`Row ${index + 2}: missing company name`);
        continue;
      }

      const duplicate = data.email
        ? await db.contact.findFirst({ where: { accountId: account.id, email: data.email } })
        : null;
      if (duplicate) {
        skipped += 1;
        continue;
      }

      const contact = await db.contact.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          status: data.status,
          accountId: account.id,
          ownerId: session.user.id,
        },
      });
      await recordAudit({
        entity: "Contact",
        entityId: contact.id,
        action: "CREATE",
        userId: session.user.id,
        changes: { source: "csv-import" },
      });
      created += 1;
    } catch (error) {
      console.error("import row failed", error);
      errors.push(`Row ${index + 2}: could not be imported`);
    }
  }

  revalidateContactViews();
  return ok({ created, skipped, errors });
}
