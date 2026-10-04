/**
 * Vendor-neutral AI provider interface. Feature code depends only on this;
 * OpenRouter-specific types stay inside provider-openrouter.ts.
 */

export interface AiCompletionRequest {
  system: string;
  prompt: string;
  /** Safety bound on output length — not a budget. */
  maxOutputTokens?: number;
  /** Ask the model for a JSON object (validated by the caller's Zod schema). */
  json?: boolean;
  /** Per-feature model override — cheap model for scoring, strong for drafting. */
  model?: string;
  /**
   * Invoked once per upstream attempt (including retries) so the quota layer
   * can count every attempt — failures count against the daily budget too.
   */
  onAttempt?: (info: { attempt: number; failed: boolean; errorClass?: string }) => void;
}

export interface AiCompletion {
  text: string;
  /** The model that actually served the call - may be a fallback. */
  model: string;
  /** Gateway-reported provider behind the model, when the gateway reports one. */
  provider?: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiProvider {
  complete(req: AiCompletionRequest): Promise<AiCompletion>;
}
