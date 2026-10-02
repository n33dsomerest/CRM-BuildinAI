"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ownerFilter } from "@/lib/scope";
import { recordAudit, diffChanges } from "@/lib/audit";
import { convertLeadSchema, leadSchema } from "@/lib/validations";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";

function revalidateLeadViews() {
  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/contacts");
  revalidatePath("/deals");
}

export async function saveLead(input: unknown, id?: string): Promise<ActionResult<{ id: string }>> {
  const session = await requireAuth();
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data");
  const data = parsed.data;

  try {
    if (id) {
      const existing = await db.lead.findFirst({
        where: { id, ...ownerFilter(session.user) },
      });
      if (!existing) return fail("Lead not found");

      const updated = await db.lead.update({ where: { id }, data });
      await recordAudit({
        entity: "Lead",
        entityId: id,
        action: "UPDATE",
        userId: session.user.id,
        changes: diffChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
      });
      revalidateLeadViews();
      return ok({ id });
    }

    const created = await db.lead.create({
      data: { ...data, ownerId: session.user.id },
    });
    await recordAudit({
      entity: "Lead",
      entityId: created.id,
      action: "CREATE",
      userId: session.user.id,
      changes: created,
    });
    revalidateLeadViews();
    return ok({ id: created.id });
  } catch (error) {
    logError("saveLead", error);
    return fail("Something went wrong. Please try again.");
  }
}

export async function updateLeadStatus(id: string, status: string): Promise<ActionResult<null>> {
  const session = await requireAuth();
  const allowed = ["NEW", "WORKING", "QUALIFIED", "UNQUALIFIED"] as const;
  if (!allowed.includes(status as (typeof allowed)[number])) return fail("Invalid status");

  try {
    const existing = await db.lead.findFirst({
      where: { id, ...ownerFilter(session.user) },
    });
    if (!existing) return fail("Lead not found");

    await db.lead.update({ where: { id }, data: { status: status as (typeof allowed)[number] } });
    await recordAudit({
      entity: "Lead",
      entityId: id,
      action: "UPDATE",
      userId: session.user.id,
      changes: { status: { from: existing.status, to: status } },
    });
    revalidateLeadViews();
    return ok(null);
  } catch (error) {
    logError("updateLeadStatus", error);
    return fail("Something went wrong. Please try again.");
  }
}

export async function deleteLead(id: string): Promise<ActionResult<null>> {
  const session = await requireAuth();

  try {
    const existing = await db.lead.findFirst({
      where: { id, ...ownerFilter(session.user) },
    });
    if (!existing) return fail("Lead not found");

    await db.lead.delete({ where: { id } });
    await recordAudit({
      entity: "Lead",
      entityId: id,
      action: "DELETE",
      userId: session.user.id,
      changes: existing,
    });
    revalidateLeadViews();
    return ok(null);
  } catch (error) {
    logError("deleteLead", error);
    return fail("Something went wrong. Please try again.");
  }
}

/**
 * The enterprise "Convert" moment: one transaction turns a raw lead into
 * Account + Contact + open Deal, then removes the lead from the pipeline.
 */
export async function convertLead(input: unknown): Promise<ActionResult<{ contactId: string; dealId: string }>> {
  const session = await requireAuth();
  const parsed = convertLeadSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data");
  const { leadId, dealTitle, dealValue } = parsed.data;

  try {
    const lead = await db.lead.findFirst({
      where: { id: leadId, ...ownerFilter(session.user) },
    });
    if (!lead) return fail("Lead not found");

    const firstStage = await db.stage.findFirst({
      where: { isWon: false, isLost: false },
      orderBy: { order: "asc" },
    });
    if (!firstStage) return fail("Pipeline stages are not configured");

    const companyName = lead.company?.trim() || lead.name;

    const result = await db.$transaction(async (tx) => {
      let account = await tx.account.findFirst({
        where: { name: { equals: companyName, mode: "insensitive" } },
      });
      if (!account) {
        account = await tx.account.create({
          data: { name: companyName, ownerId: lead.ownerId },
        });
      }

      const contact = await tx.contact.create({
        data: {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          status: "PROSPECT",
          accountId: account.id,
          ownerId: lead.ownerId,
        },
      });

      const deal = await tx.deal.create({
        data: {
          title: dealTitle,
          value: dealValue,
          stageId: firstStage.id,
          accountId: account.id,
          contactId: contact.id,
          ownerId: lead.ownerId,
        },
      });

      await tx.lead.delete({ where: { id: lead.id } });

      return { contactId: contact.id, dealId: deal.id, accountId: account.id };
    });

    await recordAudit({
      entity: "Lead",
      entityId: leadId,
      action: "DELETE",
      userId: session.user.id,
      changes: { converted: true, ...result },
    });
    revalidateLeadViews();
    return ok({ contactId: result.contactId, dealId: result.dealId });
  } catch (error) {
    logError("convertLead", error);
    return fail("Something went wrong. Please try again.");
  }
}
