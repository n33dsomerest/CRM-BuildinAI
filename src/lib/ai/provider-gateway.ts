import type { AiCompletion, AiCompletionRequest, AiProvider } from "@/lib/ai/provider";

/**
 * Gateway implementation over plain fetch — OpenAI-compatible endpoint
 * (default: the KKU gateway at https://gen.ai.kku.ac.th/okmd/api/v1).
 * Vendor types stay in this file; nothing else imports them.
 */

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2; // per model, for retryable failures; then the chain advances

export interface GatewayConfig {
  apiKey: string;
  baseUrl: string;
  /** Ordered chain: [primary, ...fallbacks]. */
  models: string[];
  /** Skip a model when local tracking says it is out of budget. */
  hasBudget?: (model: string) => Promise<boolean>;
  /** Skip a model when the gateway reports it nearly exhausted. */
  remainingTokens?: (model: string) => Promise<number | null>;
}

interface GatewayResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
  provider?: string;
  model_quota?: { daily_remaining_tokens?: number };
  error?: { message?: string };
}

/** Retryable upstream conditions: rate limit and server errors. */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/** Non-retryable auth/credit failures: every model in the chain shares the
 *  same key, so advancing would fail too — fail the whole chain immediately. */
function isFatal(status: number): boolean {
  return status === 401 || status === 403 || status === 402;
}

/** Coarse error class for AiUsage.error — never the prompt or completion text. */
function errorClass(status: number): string {
  if (isFatal(status)) return "auth";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "upstream";
  return `http-${status}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pulls a JSON object out of a raw model completion:
 *  1. trims whitespace
 *  2. strips a surrounding ```/```json fence
 *  3. slices from the first "{" to the last "}" (handles prose preambles)
 *  4. returns the candidate — the caller JSON.parses it; on failure the chain
 *     advances to the next model
 */
export function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const body = (fenced ? fenced[1] : trimmed).trim();
  const first = body.indexOf("{");
  const last = body.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) return body;
  return body.slice(first, last + 1);
}

export function createGatewayProvider(config: GatewayConfig, fetchImpl: typeof fetch = fetch): AiProvider {
  return {
    async complete(req: AiCompletionRequest): Promise<AiCompletion> {
      let lastErrorClass = "unknown";

      for (const model of config.models) {
        // Budget gates: skip without spending an attempt. Local tracking first
        // (protects us when the gateway omits model_quota), then the gateway's
        // own reported remaining tokens when available.
        if (config.hasBudget && !(await config.hasBudget(model))) {
          lastErrorClass = "out-of-budget";
          continue;
        }
        if (config.remainingTokens) {
          const remaining = await config.remainingTokens(model);
          if (remaining !== null && remaining <= 0) {
            lastErrorClass = "out-of-budget";
            continue;
          }
        }

        for (let attempt = 1; attempt <= 1 + MAX_RETRIES; attempt++) {
          try {
            const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${config.apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: "system", content: req.system },
                  { role: "user", content: req.prompt },
                ],
                ...(req.maxOutputTokens ? { max_tokens: req.maxOutputTokens } : {}),
                ...(req.json ? { response_format: { type: "json_object" } } : {}),
              }),
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });

            if (!response.ok) {
              lastErrorClass = errorClass(response.status);
              req.onAttempt?.({ attempt, failed: true, errorClass: lastErrorClass });
              // Fatal auth/credit errors kill the whole chain - same key everywhere.
              if (isFatal(response.status)) {
                throw new Error(`AI upstream error (${lastErrorClass})`);
              }
              if (isRetryable(response.status) && attempt <= MAX_RETRIES) {
                await sleep(500 * 2 ** (attempt - 1));
                continue;
              }
              break; // advance to the next model
            }

            const data = (await response.json()) as GatewayResponse;
            const rawContent = data.choices?.[0]?.message?.content;
            const finishReason = data.choices?.[0]?.finish_reason;

            // Reasoning-model trap: a small max_tokens yields finish_reason
            // "length" with truncated or empty content. A later model may cope.
            if (!rawContent || finishReason === "length") {
              lastErrorClass = rawContent ? "length-truncated" : "empty-content";
              req.onAttempt?.({ attempt, failed: true, errorClass: lastErrorClass });
              break; // advance to the next model
            }

            let text = rawContent;
            if (req.json) {
              const candidate = extractJsonObject(rawContent);
              try {
                JSON.parse(candidate);
              } catch {
                lastErrorClass = "invalid-json";
                req.onAttempt?.({ attempt, failed: true, errorClass: lastErrorClass });
                break; // advance to the next model
              }
              text = candidate;
            }

            req.onAttempt?.({ attempt, failed: false });
            return {
              text,
              model: data.model ?? model,
              provider: data.provider,
              inputTokens: data.usage?.prompt_tokens ?? 0,
              outputTokens: data.usage?.completion_tokens ?? 0,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.startsWith("AI upstream error")) throw error; // fatal, already accounted
            // Timeout / network failure: retry the same model, then advance.
            lastErrorClass = /timeout|abort/i.test(message) ? "timeout" : "network";
            req.onAttempt?.({ attempt, failed: true, errorClass: lastErrorClass });
            if (attempt <= MAX_RETRIES) {
              await sleep(500 * 2 ** (attempt - 1));
              continue;
            }
            break; // advance to the next model
          }
        }
      }

      throw new Error(`AI upstream error (${lastErrorClass})`);
    },
  };
}
