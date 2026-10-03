import type { AiCompletion, AiCompletionRequest, AiProvider } from "@/lib/ai/provider";

/**
 * OpenRouter implementation over plain fetch — no SDK dependency. Every feature
 * needs a single non-streaming JSON completion, and raw fetch is trivial to
 * mock in unit tests. Vendor types stay in this file; nothing else imports them.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2; // 1 initial attempt + 2 retries; every attempt counts against quota

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
}

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
  error?: { message?: string };
}

/** Retryable upstream conditions: rate limit and server errors. */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/** Coarse error class for AiUsage.error — never the prompt or completion text. */
function errorClass(status: number): string {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limited";
  if (status === 402) return "insufficient-credits";
  if (status >= 500) return "upstream";
  return `http-${status}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createOpenRouterProvider(
  config: OpenRouterConfig,
  fetchImpl: typeof fetch = fetch,
): AiProvider {
  return {
    async complete(req: AiCompletionRequest): Promise<AiCompletion> {
      const model = req.model ?? config.model;
      let lastError = "unknown error";

      for (let attempt = 1; attempt <= 1 + MAX_RETRIES; attempt++) {
        try {
          const response = await fetchImpl(OPENROUTER_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://crm-openrouter.local",
              "X-Title": "Enterprise CRM",
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
            lastError = errorClass(response.status);
            req.onAttempt?.({ attempt, failed: true, errorClass: lastError });
            if (isRetryable(response.status) && attempt <= MAX_RETRIES) {
              await sleep(500 * 2 ** (attempt - 1));
              continue;
            }
            throw new Error(`AI upstream error (${lastError})`);
          }

          const data = (await response.json()) as OpenRouterResponse;
          const text = data.choices?.[0]?.message?.content;
          if (!text) {
            lastError = "empty-completion";
            req.onAttempt?.({ attempt, failed: true, errorClass: lastError });
            throw new Error("AI returned an empty completion");
          }

          req.onAttempt?.({ attempt, failed: false });
          return {
            text,
            model: data.model ?? model,
            inputTokens: data.usage?.prompt_tokens ?? 0,
            outputTokens: data.usage?.completion_tokens ?? 0,
          };
        } catch (error) {
          // Timeouts and network failures are retryable; counted attempts are
          // already reported inside the try block for HTTP-level failures.
          const message = error instanceof Error ? error.message : String(error);
          if (!message.startsWith("AI upstream error") && !message.startsWith("AI returned")) {
            lastError = /timeout|abort/i.test(message) ? "timeout" : "network";
            req.onAttempt?.({ attempt, failed: true, errorClass: lastError });
            if (attempt <= MAX_RETRIES) {
              await sleep(500 * 2 ** (attempt - 1));
              continue;
            }
            throw new Error(`AI upstream error (${lastError})`);
          }
          throw error; // already-accounted HTTP/empty failures propagate immediately
        }
      }

      throw new Error(`AI upstream error (${lastError})`);
    },
  };
}
