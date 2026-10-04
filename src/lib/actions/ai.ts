"use server";

import { cacheKey, getCached, setCached } from "@/lib/ai/cache";
import { getAiConfig } from "@/lib/ai/config";
import { buildSummarizePrompt } from "@/lib/ai/prompts/summarize";
import { consume, exhaustionMessage, getQuotaState } from "@/lib/ai/quota";
import { createOpenRouterProvider } from "@/lib/ai/provider-openrouter";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";
import { requireAuth } from "@/lib/session";
import { summarizeDraftSchema } from "@/lib/validations";
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
