"use server";

import { getAiConfig } from "@/lib/ai/config";
import {
  buildChatMessages,
  filterSuggestedActions,
  type ChatGroundingSnapshot,
} from "@/lib/ai/prompts/chat";
import { allModelsExhaustedMessage, finalize, hasTokenBudget, reserve } from "@/lib/ai/quota";
import { persistRemainingTokens, readRemainingTokens } from "@/lib/ai/gateway-quota";
import { createGatewayProvider } from "@/lib/ai/provider-gateway";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { requireAuth } from "@/lib/session";
import { ownerFilter, type ScopedUser } from "@/lib/scope";
import { chatAnswerSchema, chatRequestSchema } from "@/lib/validations";

/**
 * Chat widget action - ask a question about YOUR OWN CRM data.
 *
 * Same flow as every other AI action: config check -> input validation ->
 * budget check -> atomic quota reservation -> provider call -> strict output
 * validation. Differences by design:
 *  - NO CACHE. Cache hits are free because the same note summarised twice is
 *    the same answer; a conversation turn is unique every time and a stale
 *    cache hit would answer a different question than the one asked. Deliberate
 *    exception to the "cache hits are free" rule - do not add caching back.
 *  - NO conversation state. The client holds the history and sends the last 12
 *    messages with each request (CHAT_MESSAGE_CAP bounds the token cost); the
 *    grounding snapshot is rebuilt fresh every turn, so answers reflect the
 *    data as of NOW.
 *  - NO model chain. The chat model is its own env var (AI_CHAT_MODEL) - a
 *    conversation switching personas mid-stream is worse than a clean failure.
 *
 * The server-side call cannot be aborted by the client (server actions have no
 * abort path): the widget's Stop button abandons the response client-side, and
 * the attempt still finalises here - failures count against the daily budget
 * like everywhere else.
 */

export interface ChatAnswer {
  answer: string;
  suggestedActions: { label: string; href: string }[];
}

/** Coarse class from the provider's thrown message - never prompt/completion text. */
function providerErrorClass(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /AI upstream error \(([^)]+)\)/.exec(message)?.[1] ?? "unknown";
}

/**
 * The grounding snapshot: ONLY scoped queries (ownerFilter - SALES sees their
 * own records, ADMIN everything, identical to every other read path) and only
 * capped slices: 25 deals, 25 contacts, 10 tasks, activities as aggregates.
 * Customer PII is selected and then dropped structurally by redactForPrompt
 * inside buildChatMessages - the prompt builder is what guarantees it.
 */
async function buildGroundingSnapshot(user: ScopedUser): Promise<ChatGroundingSnapshot> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [openAgg, wonCount, lostCount, deals, contacts, tasks, activityCount, activityByType, recentActivities] =
    await Promise.all([
      db.deal.aggregate({
        where: { ...ownerFilter(user), stage: { isWon: false, isLost: false } },
        _sum: { value: true },
        _count: true,
      }),
      db.deal.count({ where: { ...ownerFilter(user), stage: { isWon: true } } }),
      db.deal.count({ where: { ...ownerFilter(user), stage: { isLost: true } } }),
      db.deal.findMany({
        where: ownerFilter(user),
        orderBy: { updatedAt: "desc" },
        take: 25,
        select: {
          title: true,
          value: true,
          updatedAt: true,
          stage: { select: { name: true } },
          contact: { select: { name: true, account: { select: { name: true } } } },
        },
      }),
      db.contact.findMany({
        where: ownerFilter(user),
        orderBy: { updatedAt: "desc" },
        take: 25,
        select: { name: true, email: true, phone: true, position: true, status: true, account: { select: { name: true } } },
      }),
      // Tasks are assignee-scoped in this app (see getTasksForUser); ADMIN's
      // chat may see the whole workspace's tasks, SALES only their own.
      db.task.findMany({
        where: user.role === "ADMIN" ? {} : { assigneeId: user.id },
        orderBy: { dueDate: "asc" },
        take: 10,
        select: { title: true, dueDate: true, status: true, contact: { select: { name: true } }, deal: { select: { title: true } } },
      }),
      db.activity.count({ where: { contact: ownerFilter(user), occurredAt: { gte: since } } }),
      db.activity.groupBy({
        by: ["type"],
        where: { contact: ownerFilter(user), occurredAt: { gte: since } },
        _count: true,
      }),
      db.activity.findMany({
        where: { contact: ownerFilter(user) },
        orderBy: { occurredAt: "desc" },
        take: 3,
        select: { subject: true },
      }),
    ]);

  return {
    viewerRole: user.role,
    dealCounts: {
      open: openAgg._count,
      won: wonCount,
      lost: lostCount,
      openValue: Number(openAgg._sum.value ?? 0),
    },
    deals: deals.map((d) => ({
      title: d.title,
      stage: d.stage.name,
      value: Number(d.value),
      contact: d.contact.name,
      account: d.contact.account.name,
      updatedAt: d.updatedAt.toISOString(),
    })),
    contacts: contacts.map((c) => ({
      name: c.name,
      email: c.email,
      phone: c.phone,
      company: c.account.name,
      status: c.status,
      position: c.position,
    })),
    tasks: tasks.map((t) => ({
      title: t.title,
      dueDate: t.dueDate.toISOString().slice(0, 10),
      status: t.status,
      contact: t.contact?.name ?? null,
      deal: t.deal?.title ?? null,
    })),
    activities: {
      last30Days: activityCount,
      byType: Object.fromEntries(activityByType.map((row) => [row.type, row._count])),
      recentSubjects: recentActivities.map((a) => a.subject),
    },
  };
}

export async function askAiQuestion(input: unknown): Promise<ActionResult<ChatAnswer>> {
  const session = await requireAuth();

  const config = getAiConfig();
  if (!config) return fail("AI is not configured");

  const parsed = chatRequestSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const chatModel = config.chatModel;
  const budgetGate = await allModelsExhaustedMessage([chatModel], config.budgets);
  if (budgetGate) return fail(budgetGate);

  const chatLimit = config.budgets.get(chatModel);
  const userLimit =
    config.userShare !== null && chatLimit !== undefined ? Math.floor(chatLimit * config.userShare) : undefined;
  const reservation = await reserve(session.user.id, "chat", {
    model: chatModel,
    limit: chatLimit,
    userLimit,
  });
  if (reservation.overBudget) {
    return fail(`The team's daily token budget for ${chatModel} is used up - try tomorrow`);
  }
  if (reservation.overUserBudget) {
    return fail(`You've used your share of today's ${chatModel} budget - another rep can still use theirs`);
  }
  const reservationId = reservation.id;

  const snapshot = await buildGroundingSnapshot(session.user);
  const { system, messages } = buildChatMessages(snapshot, parsed.data.messages);

  // 2000 tokens of headroom: the chat model may be a reasoning model that
  // thinks before answering. Billing is on actual usage, not max_tokens.
  const provider = createGatewayProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    models: [chatModel],
    hasBudget: (model) => hasTokenBudget(session.user.id, model, config.budgets),
    remainingTokens: (model) => readRemainingTokens(model),
  });

  let completion;
  try {
    completion = await provider.complete({
      system,
      messages,
      json: true,
      maxOutputTokens: 2000,
    });
  } catch (error) {
    const errorClass = providerErrorClass(error);
    await finalize(reservationId, { ok: false, error: errorClass });
    logError("askAiQuestion", error);
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
    parsedOutput = chatAnswerSchema.safeParse(JSON.parse(completion.text));
  } catch {
    return fail("AI returned malformed JSON - try again");
  }
  if (!parsedOutput.success) {
    logError("askAiQuestion", new Error(parsedOutput.error.issues[0]?.message));
    return fail("AI returned an unexpected response shape - try again");
  }

  // Allow-list the model's suggested links - it may only navigate real routes.
  const suggestedActions = filterSuggestedActions(parsedOutput.data.suggestedActions, session.user.role);
  return ok({ answer: parsedOutput.data.answer, suggestedActions });
}
