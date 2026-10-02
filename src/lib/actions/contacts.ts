"use server";

import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ownerFilter } from "@/lib/scope";
import { recordAudit, diffChanges } from "@/lib/audit";
import { assertUserExists, isOwnedRecord } from "@/lib/authorize";
import { contactSchema, contactImportRowSchema } from "@/lib/validations";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";

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

  // Client-supplied foreign keys must all be verified (IDOR + FK safety).
  if (!(await isOwnedRecord("account", data.accountId, session.user))) return fail("Account not found");
  if (session.user.role === "ADMIN" && !(await assertUserExists(data.ownerId))) {
    return fail("Selected owner does not exist");
  }

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
      changes: { name: created.name },
    });
    revalidateContactViews(created.id);
    return ok({ id: created.id });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return fail("A contact with this email already exists in the account");
    }
    logError("saveContact", error);
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
      changes: { id: existing.id, name: existing.name },
    });
    revalidateContactViews();
    return ok(null);
  } catch (error) {
    logError("deleteContact", error);
    return fail("Something went wrong. Please try again.");
  }
}

export interface ImportSummary {
  created: number;
  skipped: number;
  errors: string[];
  aborted: boolean;
}

const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_ROWS = 2_000;
/** Abort the whole import when more than 10% of rows fail validation. */
const ERROR_ABORT_RATIO = 0.1;

/**
 * CSV import with the enterprise hygiene rules:
 * - size caps (2 MB / 2,000 rows) enforced before anything touches the DB
 * - every row validated up front; >10% bad rows aborts the whole import
 * - accounts matched case-insensitively via a single prefetch (no N+1),
 *   missing ones created inside the same transaction as the contacts
 * - duplicates (same account + email, in DB or within the file) skipped
 * - exactly one audit entry per import
 * Expected columns: name,email,phone,company,status
 */
export async function importContactsCsv(csv: string): Promise<ActionResult<ImportSummary>> {
  const session = await requireAuth();

  if (csv.length > MAX_CSV_BYTES) return fail("CSV too large — max 2 MB per import");

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (!parsed.data.length) return fail("No rows found in the CSV file");
  if (parsed.data.length > MAX_ROWS) return fail("CSV too large — max 2,000 rows per import");

  // 1) Validate every row before writing anything.
  const errors: string[] = [];
  interface ValidRow {
    name: string;
    email?: string;
    phone?: string;
    status: "LEAD" | "PROSPECT" | "CUSTOMER";
    company: string;
  }
  const validRows: ValidRow[] = [];
  for (const [index, row] of parsed.data.entries()) {
    const check = contactImportRowSchema.safeParse({
      name: row.name,
      email: row.email,
      phone: row.phone,
      company: row.company,
      status: row.status?.trim().toUpperCase(),
    });
    if (!check.success) {
      errors.push(`Row ${index + 2}: ${check.error.issues[0]?.message ?? "invalid row"}`);
      continue;
    }
    if (!check.data.company) {
      errors.push(`Row ${index + 2}: missing company name`);
      continue;
    }
    validRows.push({
      name: check.data.name,
      email: check.data.email,
      phone: check.data.phone,
      status: check.data.status,
      company: check.data.company,
    });
  }

  if (errors.length > parsed.data.length * ERROR_ABORT_RATIO) {
    return ok({ created: 0, skipped: 0, errors, aborted: true });
  }

  // 2) Prefetch owned accounts in one query; match case-insensitively.
  const ownedAccounts = await db.account.findMany({
    where: ownerFilter(session.user),
    select: { id: true, name: true },
  });
  const accountIdsByName = new Map<string, string>();
  for (const account of ownedAccounts) accountIdsByName.set(account.name.toLowerCase(), account.id);

  // 3) Prefetch existing contact emails for the involved accounts (duplicate detection).
  const companies = [...new Set(validRows.map((row) => row.company))];
  const neededAccountIds = companies
    .map((company) => accountIdsByName.get(company.toLowerCase()))
    .filter((id): id is string => Boolean(id));
  const existingContacts = neededAccountIds.length
    ? await db.contact.findMany({
        where: { accountId: { in: neededAccountIds }, email: { not: null } },
        select: { accountId: true, email: true },
      })
    : [];
  const seenPairs = new Set(existingContacts.map((c) => `${c.accountId}|${c.email?.toLowerCase()}`));

  // 4) Build the write set inside a single transaction — no partial commits.
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const missingCompanies = companies.filter((company) => !accountIdsByName.has(company.toLowerCase()));

  try {
    await db.$transaction(async (tx) => {
      for (const company of missingCompanies) {
        const account = await tx.account.create({
          data: { name: company, ownerId: session.user.id },
          select: { id: true, name: true },
        });
        accountIdsByName.set(account.name.toLowerCase(), account.id);
      }

      const toCreate: {
        name: string;
        email?: string;
        phone?: string;
        status: "LEAD" | "PROSPECT" | "CUSTOMER";
        accountId: string;
        ownerId: string;
      }[] = [];

      for (const row of validRows) {
        const accountId = accountIdsByName.get(row.company.toLowerCase());
        if (!accountId) {
          failed += 1;
          continue;
        }
        const pair = `${accountId}|${row.email?.toLowerCase() ?? ""}`;
        if (row.email && seenPairs.has(pair)) {
          skipped += 1;
          continue;
        }
        if (row.email) seenPairs.add(pair);
        toCreate.push({
          name: row.name,
          email: row.email,
          phone: row.phone,
          status: row.status,
          accountId,
          ownerId: session.user.id,
        });
      }

      // createMany in chunks keeps memory bounded on large files.
      const CHUNK = 500;
      for (let i = 0; i < toCreate.length; i += CHUNK) {
        const result = await tx.contact.createMany({ data: toCreate.slice(i, i + CHUNK) });
        created += result.count;
      }
    });
  } catch (error) {
    logError("importContactsCsv", error);
    return fail("Import failed — nothing was written. Please check the file and try again.");
  }

  await recordAudit({
    entity: "Contact",
    entityId: "csv-import",
    action: "CREATE",
    userId: session.user.id,
    changes: { source: "csv-import", created, skipped, failed },
  });

  revalidateContactViews();
  return ok({ created, skipped, errors, aborted: false });
}
