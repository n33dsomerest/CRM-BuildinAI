"use server";

import { cacheKey, getCached, setCached } from "@/lib/ai/cache";
import { getAiConfig } from "@/lib/ai/config";
import { buildDraftEmailPrompt } from "@/lib/ai/prompts/draft-email";
import { buildScoreLeadPrompt } from "@/lib/ai/prompts/score-lead";
import { clampBatchSize, computeAverageOpenDealValue, computeWinRate } from "@/lib/ai/scoring";
import { buildSummarizePrompt } from "@/lib/ai/prompts/summarize";
import { allModelsExhaustedMessage, finalize, hasTokenBudget, reserve } from "@/lib/ai/quota";
import { persistRemainingTokens, readRemainingTokens } from "@/lib/ai/gateway-quota";
import { createGatewayProvider } from "@/lib/ai/provider-gateway";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { diffChanges, recordAudit } from "@/lib/audit";
import { ownerFilter } from "@/lib/scope";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { requireAuth } from "@/lib/session";
import { emailDraftSchema, leadScoreSchema, summarizeDraftSchema } from "@/lib/validations";
import { z } from "zod";

/**
 * Phase 1 - activity summarizer. AI proposes; a human confirms.
 *
 * This action NEVER writes to the CRM. It returns a draft the form fills in;
 * the user edits the fields and saves through the existing `addActivity`
 * action, which carries the normal scoping, validation and audit path.
 *
 * Flow: config check -> input validation -> cache (free) -> atomic quota
 * reservation -> provider call -> strict output validation -> cache set.
 * One user action is one quota slot regardless of internal retries.
 */

export interface SummaryDraft {
  summary: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "RISK";
  nextStep?: string;
  suggestedTask?: string;
  /** True when the note exceeded the hard cap - surfaced in the UI, never silent. */
  truncated: boolean;
}

/** Coarse class from the provider's thrown message - never prompt/completion text. */
function providerErrorClass(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /AI upstream error \(([^)]+)\)/.exec(message)?.[1] ?? "unknown";
}

const summarizeInputSchema = z.object({
  body: z.string().trim().min(20, "Write at least 20 characters before summarizing").max(50_000),
});

export async function summarizeActivityDraft(input: unknown): Promise<ActionResult<SummaryDraft>> {
  const session = await requireAuth();

  const config = getAiConfig();
  if (!config) return fail("AI is not configured");

  const parsed = summarizeInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const body = parsed.data.body;

  // Cache hits are free - never consume quota, never touch the provider.
  const key = cacheKey("summarize", { body });
  const cached = await getCached<SummaryDraft>(key);
  if (cached) return ok({ ...cached, truncated: cached.truncated ?? false });

  const budgetGate = await allModelsExhaustedMessage(session.user.id, config.models, config.budgets);
  if (budgetGate) return fail(budgetGate);

  const reservationId = await reserve(session.user.id, "summarize");

  const { system, prompt, truncated } = buildSummarizePrompt(body);
  // 2000 tokens of headroom: reasoning fallbacks in the chain (deepseek-v4-flash
  // measured 282-678 output tokens) need it; models that don't are charged on
  // actual usage, not on max_tokens.
  const provider = createGatewayProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    models: config.models,
    hasBudget: (model) => hasTokenBudget(session.user.id, model, config.budgets),
    remainingTokens: (model) => readRemainingTokens(model),
  });

  let completion;
  try {
    completion = await provider.complete({
      system,
      prompt,
      json: true,
      maxOutputTokens: 2000,
    });
  } catch (error) {
    const errorClass = providerErrorClass(error);
    await finalize(reservationId, { ok: false, error: errorClass });
    logError("summarizeActivityDraft", error);
    return fail("AI request failed - the attempt still counted against your daily limit. Try again later.");
  }

  await finalize(reservationId, {
    ok: true,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    model: completion.model,
    provider: completion.provider,
  });
  if (completion.remainingTokens !== undefined) {
    await persistRemainingTokens(completion.model, completion.remainingTokens);
  }

  // Strict validation of the model output - never trust raw JSON.
  let parsedOutput;
  try {
    parsedOutput = summarizeDraftSchema.safeParse(JSON.parse(completion.text));
  } catch {
    return fail("AI returned malformed JSON - try again");
  }
  if (!parsedOutput.success) {
    logError("summarizeActivityDraft", new Error(parsedOutput.error.issues[0]?.message));
    return fail("AI returned an unexpected response shape - try again");
  }

  const draft: SummaryDraft = { ...parsedOutput.data, truncated };
  await setCached(key, "summarize", { ...parsedOutput.data, truncated });
  return ok(draft);
}

export interface EmailDraft {
  subject: string;
  body: string;
  /** Always true - the draft is labelled so nobody pastes it unread. */
  aiGenerated: true;
}

/**
 * Phase 2 - follow-up email DRAFT. Copy-only: the app has no send path, no
 * SMTP, no provider send API. The user edits the text and sends from their
 * own mail client.
 *
 * Grounding (structured DATA, never instructions): contact name/position/
 * company, open deals with stage and value, the last three activity subjects.
 * Cache key includes the grounding fingerprints, so any change to the contact,
 * its deals or activities produces a fresh key instead of a stale draft.
 */
export async function draftFollowUpEmail(contactId: string): Promise<ActionResult<EmailDraft>> {
  const session = await requireAuth();

  const config = getAiConfig();
  if (!config) return fail("AI is not configured");

  // Cross-scope protection: a SALES user cannot draft for another rep's contact.
  const contact = await db.contact.findFirst({
    where: { id: contactId, ...ownerFilter(session.user) },
    include: {
      account: { select: { name: true } },
      deals: {
        where: { stage: { isWon: false, isLost: false } },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { stage: { select: { name: true, probability: true } } },
      },
      activities: {
        orderBy: { occurredAt: "desc" },
        take: 3,
        select: { type: true, subject: true, occurredAt: true },
      },
    },
  });
  if (!contact) return fail("Contact not found");

  const groundingFingerprint = {
    contactUpdatedAt: contact.updatedAt.toISOString(),
    dealCount: contact.deals.length,
    dealTitles: contact.deals.map((d) => d.title),
    latestActivityAt: contact.activities[0]?.occurredAt.toISOString() ?? "none",
  };
  const key = cacheKey("draft-email", { contactId, groundingFingerprint });
  const cached = await getCached<EmailDraft>(key);
  if (cached) return ok({ ...cached, aiGenerated: true });

  const budgetGate = await allModelsExhaustedMessage(session.user.id, config.models, config.budgets);
  if (budgetGate) return fail(budgetGate);

  const reservationId = await reserve(session.user.id, "draft");

  const { system, prompt } = buildDraftEmailPrompt({
    contactName: contact.name,
    position: contact.position,
    companyName: contact.account.name,
    openDeals: contact.deals.map((d) => ({
      title: d.title,
      stageName: d.stage.name,
      value: String(d.value),
      probability: d.stage.probability,
    })),
    recentActivities: contact.activities.map((a) => ({ type: a.type, subject: a.subject })),
  });

  const provider = createGatewayProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    models: config.models,
    hasBudget: (model) => hasTokenBudget(session.user.id, model, config.budgets),
    remainingTokens: (model) => readRemainingTokens(model),
  });

  let completion;
  try {
    // 2000 tokens of headroom: measured drafting output is 45-147 tokens on
    // non-reasoning models, but reasoning fallbacks (deepseek-v4-flash) spend
    // a variable 164-825 tokens on thinking before emitting content. Billing
    // is on actual usage, not max_tokens.
    completion = await provider.complete({
      system,
      prompt,
      json: true,
      maxOutputTokens: 2000,
    });
  } catch (error) {
    const errorClass = providerErrorClass(error);
    await finalize(reservationId, { ok: false, error: errorClass });
    logError("draftFollowUpEmail", error);
    return fail("AI request failed - the attempt still counted against your daily limit. Try again later.");
  }

  await finalize(reservationId, {
    ok: true,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    model: completion.model,
    provider: completion.provider,
  });
  if (completion.remainingTokens !== undefined) {
    await persistRemainingTokens(completion.model, completion.remainingTokens);
  }

  let parsedOutput;
  try {
    parsedOutput = emailDraftSchema.safeParse(JSON.parse(completion.text));
  } catch {
    return fail("AI returned malformed JSON - try again");
  }
  if (!parsedOutput.success) {
    logError("draftFollowUpEmail", new Error(parsedOutput.error.issues[0]?.message));
    return fail("AI returned an unexpected response shape - try again");
  }

  const draft: EmailDraft = { subject: parsedOutput.data.subject, body: parsedOutput.data.body, aiGenerated: true };
  await setCached(key, "draft-email", { subject: draft.subject, body: draft.body });
  return ok(draft);
}

export interface LeadScoreResult {
  leadId: string;
  score: number;
  reason: string;
}

export interface BatchPreview {
  eligible: number;
  willScore: number;
}

export interface BatchScoreSummary {
  requested: number;
  scored: number;
  failed: number;
  notAttempted: number;
}

/**
 * Phase 3 - lead scoring. Cheap model: classification, not prose. Grounded in
 * the user's OWN pipeline aggregates so scores are relative to this team.
 * The explicit "Score" click is the human confirmation; the persisted fields
 * are the suggestion itself (score + reasons), always displayed as such.
 */
async function teamAggregates(userId: string) {
  const [won, lost, open] = await Promise.all([
    db.deal.count({ where: { ownerId: userId, stage: { isWon: true } } }),
    db.deal.count({ where: { ownerId: userId, stage: { isLost: true } } }),
    db.deal.aggregate({
      where: { ownerId: userId, stage: { isWon: false, isLost: false } },
      _sum: { value: true },
      _count: true,
    }),
  ]);
  return {
    won,
    lost,
    totalDeals: won + lost + open._count,
    openValueSum: Number(open._sum.value ?? 0),
    openCount: open._count,
  };
}

/**
 * Persists a score (from cache or fresh) with the full audit trail every other
 * CRM write goes through: model output has already passed leadScoreSchema, the
 * write is diffed against the prior values into AuditLog, and the leads table
 * is revalidated so the new score column reflects the change.
 */
async function persistScore(
  lead: { id: string; score: number | null; scoreReason: string | null; scoredAt: Date | null },
  values: { score: number; reason: string },
  userId: string
): Promise<void> {
  const updated = await db.lead.update({
    where: { id: lead.id },
    data: { score: values.score, scoreReason: values.reason, scoredAt: new Date() },
  });
  await recordAudit({
    entity: "Lead",
    entityId: lead.id,
    action: "UPDATE",
    userId,
    changes: diffChanges(
      { score: lead.score, scoreReason: lead.scoreReason, scoredAt: lead.scoredAt } as Record<string, unknown>,
      { score: updated.score, scoreReason: updated.scoreReason, scoredAt: updated.scoredAt } as Record<string, unknown>
    ),
  });
  revalidatePath("/leads");
}

export async function scoreLead(leadId: string): Promise<ActionResult<LeadScoreResult>> {
  const session = await requireAuth();

  const config = getAiConfig();
  if (!config) return fail("AI is not configured");

  const lead = await db.lead.findFirst({
    where: { id: leadId, ...ownerFilter(session.user) },
  });
  if (!lead) return fail("Lead not found");

  const key = cacheKey("score-lead", { leadId, leadUpdatedAt: lead.updatedAt.toISOString() });
  const cached = await getCached<LeadScoreResult>(key);
  if (cached) {
    // Cached values were validated when first produced, but they are
    // re-validated here: nothing reaches Prisma unvalidated, never clamped.
    const persistable = leadScoreSchema.safeParse({ score: cached.score, reason: cached.reason });
    if (!persistable.success) {
      return fail(`Cached score is invalid - score the lead again (${persistable.error.issues[0]?.message ?? "invalid"})`);
    }
    await persistScore(lead, { score: persistable.data.score, reason: persistable.data.reason }, session.user.id);
    return ok({ ...cached, leadId: lead.id });
  }

  const budgetGate = await allModelsExhaustedMessage(session.user.id, config.models, config.budgets);
  if (budgetGate) return fail(budgetGate);

  const reservationId = await reserve(session.user.id, "score");

  const agg = await teamAggregates(session.user.id);
  const { system, prompt } = buildScoreLeadPrompt({
    lead: {
      name: lead.name,
      company: lead.company,
      source: lead.source,
      status: lead.status,
      daysSinceCreated: Math.floor((Date.now() - lead.createdAt.getTime()) / 86_400_000),
      hasEmail: Boolean(lead.email),
      hasPhone: Boolean(lead.phone),
    },
    team: {
      winRate: computeWinRate(agg),
      averageOpenDealValue: computeAverageOpenDealValue(agg),
      totalDeals: agg.totalDeals,
    },
  });

  const provider = createGatewayProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    models: config.models,
    hasBudget: (model) => hasTokenBudget(session.user.id, model, config.budgets),
    remainingTokens: (model) => readRemainingTokens(model),
  });

  let completion;
  try {
    // 2000 tokens of headroom: measured scoring output is 50-86 tokens on
    // non-reasoning models, but reasoning fallbacks intermittently exceed a
    // 300 ceiling (finish_reason=length, empty content). Billing is on
    // actual usage, not max_tokens.
    completion = await provider.complete({
      system,
      prompt,
      json: true,
      maxOutputTokens: 2000,
    });
  } catch (error) {
    const errorClass = providerErrorClass(error);
    await finalize(reservationId, { ok: false, error: errorClass });
    logError("scoreLead", error);
    return fail("AI request failed - the attempt still counted against your daily limit. Try again later.");
  }

  await finalize(reservationId, {
    ok: true,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    model: completion.model,
    provider: completion.provider,
  });
  if (completion.remainingTokens !== undefined) {
    await persistRemainingTokens(completion.model, completion.remainingTokens);
  }

  let parsedOutput;
  try {
    parsedOutput = leadScoreSchema.safeParse(JSON.parse(completion.text));
  } catch {
    return fail("AI returned malformed JSON - try again");
  }
  // Out-of-range scores or empty reasons are a FAILURE, never silently clamped.
  if (!parsedOutput.success) {
    return fail(`AI returned an invalid score - ${parsedOutput.error.issues[0]?.message ?? "try again"}`);
  }

  const result: LeadScoreResult = {
    leadId: lead.id,
    score: parsedOutput.data.score,
    reason: parsedOutput.data.reason,
  };
  await setCached(key, "score-lead", { score: result.score, reason: result.reason });
  await persistScore(lead, { score: result.score, reason: result.reason }, session.user.id);
  return ok(result);
}

/** What the "Score all new leads" batch would do right now - shown before running. */
export async function getLeadScoringBatchPreview(): Promise<ActionResult<BatchPreview>> {
  const session = await requireAuth();
  const eligible = await db.lead.count({
    where: { ...ownerFilter(session.user), score: null, status: { in: ["NEW", "WORKING"] } },
  });
  return ok({ eligible, willScore: clampBatchSize(eligible, 50) });
}

/**
 * Batch scoring with the quota cap baked in: the batch is clamped to the
 * remaining quota at execution time, so it can never half-run out of budget.
 */
export async function scoreLeadsBatch(): Promise<ActionResult<BatchScoreSummary>> {
  const session = await requireAuth();

  const config = getAiConfig();
  if (!config) return fail("AI is not configured");

  const eligible = await db.lead.findMany({
    where: { ...ownerFilter(session.user), score: null, status: { in: ["NEW", "WORKING"] } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true },
  });

  let scored = 0;
  let failed = 0;
  let notAttempted = 0;
  for (const { id } of eligible) {
    const result = await scoreLead(id);
    if (result.ok) {
      scored += 1;
      continue;
    }
    if (result.error?.startsWith("AI daily token budget reached")) {
      // Budgets gone mid-batch (e.g. concurrent usage): stop instead of
      // burning failed iterations - the rest are not-attempted, not failed.
      notAttempted += 1;
      break;
    }
    failed += 1;
  }
  notAttempted += eligible.length - scored - failed - notAttempted;
  return ok({ requested: eligible.length, scored, failed, notAttempted });
}
