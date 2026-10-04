"use server";

import { cacheKey, getCached, setCached } from "@/lib/ai/cache";
import { getAiConfig, modelFor } from "@/lib/ai/config";
import { buildDraftEmailPrompt } from "@/lib/ai/prompts/draft-email";
import { buildScoreLeadPrompt } from "@/lib/ai/prompts/score-lead";
import { clampBatchSize, computeAverageOpenDealValue, computeWinRate } from "@/lib/ai/scoring";
import { getRemaining } from "@/lib/ai/quota";
import { buildSummarizePrompt } from "@/lib/ai/prompts/summarize";
import { consume, exhaustionMessage, getQuotaState } from "@/lib/ai/quota";
import { createOpenRouterProvider } from "@/lib/ai/provider-openrouter";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { isOwnedRecord } from "@/lib/authorize";
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
 * Flow: config check -> input validation -> cache (free) -> quota check ->
 * provider call (every attempt consumed) -> strict output validation -> cache set.
 */

export interface SummaryDraft {
  summary: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "RISK";
  nextStep?: string;
  suggestedTask?: string;
  /** True when the note exceeded the hard cap - surfaced in the UI, never silent. */
  truncated: boolean;
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

  const state = await getQuotaState(session.user.id);
  if (state.exhausted) {
    return fail(await exhaustionMessage(session.user.id));
  }

  const { system, prompt, truncated } = buildSummarizePrompt(body);
  const provider = createOpenRouterProvider({ apiKey: config.apiKey, model: config.cheapModel });

  let completion;
  try {
    completion = await provider.complete({
      system,
      prompt,
      json: true,
      maxOutputTokens: 700,
      model: config.cheapModel,
      onAttempt: ({ failed, errorClass }) => {
        // Failed attempts (incl. retries) count against quota - recorded here.
        if (failed) {
          void consume(session.user.id, { feature: "summarize", ok: false, error: errorClass, model: config.cheapModel });
        }
      },
    });
  } catch (error) {
    logError("summarizeActivityDraft", error);
    return fail(
      "AI request failed - every attempt still counts against your daily limit. Try again later."
    );
  }

  // Success attempt consumed here, where token usage is known.
  await consume(session.user.id, {
    feature: "summarize",
    ok: true,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    model: completion.model,
  });

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
    where: { id: contactId, ...(session.user.role === "ADMIN" ? {} : { ownerId: session.user.id }) },
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

  const state = await getQuotaState(session.user.id);
  if (state.exhausted) return fail(await exhaustionMessage(session.user.id));

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

  const strongModel = modelFor("strong") ?? config.model;
  const provider = createOpenRouterProvider({ apiKey: config.apiKey, model: strongModel });

  let completion;
  try {
    completion = await provider.complete({
      system,
      prompt,
      json: true,
      maxOutputTokens: 800,
      onAttempt: ({ failed, errorClass }) => {
        if (failed) {
          void consume(session.user.id, { feature: "draft", ok: false, error: errorClass, model: strongModel });
        }
      },
    });
  } catch (error) {
    logError("draftFollowUpEmail", error);
    return fail("AI request failed - every attempt still counts against your daily limit. Try again later.");
  }

  await consume(session.user.id, {
    feature: "draft",
    ok: true,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    model: completion.model,
  });

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
  remaining: number;
  willScore: number;
}

export interface BatchScoreSummary {
  requested: number;
  scored: number;
  failed: number;
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

export async function scoreLead(leadId: string): Promise<ActionResult<LeadScoreResult>> {
  const session = await requireAuth();

  const config = getAiConfig();
  if (!config) return fail("AI is not configured");

  const lead = await db.lead.findFirst({
    where: { id: leadId, ...(session.user.role === "ADMIN" ? {} : { ownerId: session.user.id }) },
  });
  if (!lead) return fail("Lead not found");

  const key = cacheKey("score-lead", { leadId, leadUpdatedAt: lead.updatedAt.toISOString() });
  const cached = await getCached<LeadScoreResult>(key);
  if (cached) {
    await db.lead.update({
      where: { id: lead.id },
      data: { score: cached.score, scoreReason: cached.reason, scoredAt: new Date() },
    });
    return ok({ ...cached, leadId: lead.id });
  }

  const state = await getQuotaState(session.user.id);
  if (state.exhausted) return fail(await exhaustionMessage(session.user.id));

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

  const cheapModel = modelFor("cheap") ?? config.model;
  const provider = createOpenRouterProvider({ apiKey: config.apiKey, model: cheapModel });

  let completion;
  try {
    completion = await provider.complete({
      system,
      prompt,
      json: true,
      maxOutputTokens: 300,
      model: cheapModel,
      onAttempt: ({ failed, errorClass }) => {
        if (failed) {
          void consume(session.user.id, { feature: "score", ok: false, error: errorClass, model: cheapModel });
        }
      },
    });
  } catch (error) {
    logError("scoreLead", error);
    return fail("AI request failed - every attempt still counts against your daily limit. Try again later.");
  }

  await consume(session.user.id, {
    feature: "score",
    ok: true,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    model: completion.model,
  });

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
  await db.lead.update({
    where: { id: lead.id },
    data: { score: result.score, scoreReason: result.reason, scoredAt: new Date() },
  });
  return ok(result);
}

/** What the "Score all new leads" batch would do right now - shown before running. */
export async function getLeadScoringBatchPreview(): Promise<ActionResult<BatchPreview>> {
  const session = await requireAuth();
  const remaining = await getRemaining(session.user.id);
  const eligible = await db.lead.count({
    where: {
      ...(session.user.role === "ADMIN" ? {} : { ownerId: session.user.id }),
      score: null,
      status: { in: ["NEW", "WORKING"] },
    },
  });
  return ok({ eligible, remaining, willScore: clampBatchSize(eligible, remaining) });
}

/**
 * Batch scoring with the quota cap baked in: the batch is clamped to the
 * remaining quota at execution time, so it can never half-run out of budget.
 */
export async function scoreLeadsBatch(): Promise<ActionResult<BatchScoreSummary>> {
  const session = await requireAuth();

  const config = getAiConfig();
  if (!config) return fail("AI is not configured");

  const remaining = await getRemaining(session.user.id);
  if (remaining === 0) return fail(await exhaustionMessage(session.user.id));

  const eligible = await db.lead.findMany({
    where: {
      ...(session.user.role === "ADMIN" ? {} : { ownerId: session.user.id }),
      score: null,
      status: { in: ["NEW", "WORKING"] },
    },
    orderBy: { createdAt: "asc" },
    take: clampBatchSize(50, remaining),
    select: { id: true },
  });

  let scored = 0;
  let failed = 0;
  for (const { id } of eligible) {
    const result = await scoreLead(id);
    if (result.ok) scored += 1;
    else failed += 1;
  }
  return ok({ requested: eligible.length, scored, failed });
}
