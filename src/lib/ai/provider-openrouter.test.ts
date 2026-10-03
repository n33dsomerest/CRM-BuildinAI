import { describe, expect, it, vi } from "vitest";
import { createOpenRouterProvider, type OpenRouterConfig } from "@/lib/ai/provider-openrouter";
import type { AiCompletionRequest } from "@/lib/ai/provider";

const config: OpenRouterConfig = { apiKey: "sk-or-v1-test", model: "vendor/strong" };

function fetchRespondingOnce(body: object, status = 200) {
  const fetchMock = vi.fn().mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status })
  );
  return fetchMock as unknown as typeof fetch;
}

function fetchFailing(status: number, times = 1) {
  const fetchMock = vi.fn();
  for (let i = 0; i < times; i++) {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status }));
  }
  return fetchMock as unknown as typeof fetch;
}

const baseReq: AiCompletionRequest = { system: "s", prompt: "p" };

const okBody = {
  choices: [{ message: { content: '{"answer": 1}' } }],
  usage: { prompt_tokens: 12, completion_tokens: 34 },
  model: "vendor/strong",
};

describe("openrouter provider", () => {
  it("returns text and token usage on success", async () => {
    const fetchMock = fetchRespondingOnce(okBody);
    const provider = createOpenRouterProvider(config, fetchMock);
    const completion = await provider.complete(baseReq);

    expect(completion).toEqual({
      text: '{"answer": 1}',
      model: "vendor/strong",
      inputTokens: 12,
      outputTokens: 34,
    });
  });

  it("sends system+user messages, json mode and max tokens", async () => {
    const fetchMock = fetchRespondingOnce(okBody);
    const provider = createOpenRouterProvider(config, fetchMock);
    await provider.complete({ ...baseReq, json: true, maxOutputTokens: 500, model: "vendor/cheap" });

    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("vendor/cheap");
    expect(body.messages).toEqual([
      { role: "system", content: "s" },
      { role: "user", content: "p" },
    ]);
    expect(body.max_tokens).toBe(500);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(init.headers.Authorization).toBe("Bearer sk-or-v1-test");
  });

  it("reports every attempt through onAttempt, including retries on 429", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(okBody), { status: 200 }));

    const onAttempt = vi.fn();
    const provider = createOpenRouterProvider(config, fetchMock as unknown as typeof fetch);
    const completion = await provider.complete({ ...baseReq, onAttempt });

    expect(completion.text).toBe('{"answer": 1}');
    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onAttempt).toHaveBeenNthCalledWith(1, { attempt: 1, failed: true, errorClass: "rate-limited" });
    expect(onAttempt).toHaveBeenNthCalledWith(2, { attempt: 2, failed: false });
  });

  it("gives up after 2 retries and reports every failed attempt", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = fetchFailing(500, 3);
      const onAttempt = vi.fn();
      const provider = createOpenRouterProvider(config, fetchMock);

      const promise = provider.complete({ ...baseReq, onAttempt });
      // Attach the rejection handler BEFORE flushing backoff sleeps, otherwise
      // the rejection lands unhandled between timer ticks.
      const assertion = expect(promise).rejects.toThrow("AI upstream error (upstream)");
      await vi.runAllTimersAsync();
      await assertion;

      expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3);
      expect(onAttempt).toHaveBeenCalledTimes(3);
      expect(onAttempt.mock.calls.every(([opts]) => (opts as { failed: boolean }).failed)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws without retrying on non-retryable client errors", async () => {
    const fetchMock = fetchFailing(401, 1);
    const onAttempt = vi.fn();
    const provider = createOpenRouterProvider(config, fetchMock);

    await expect(provider.complete({ ...baseReq, onAttempt })).rejects.toThrow("AI upstream error (auth)");
    expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(onAttempt).toHaveBeenCalledWith({ attempt: 1, failed: true, errorClass: "auth" });
  });

  it("fails on an empty completion without retrying", async () => {
    const fetchMock = fetchRespondingOnce({ choices: [{ message: {} }], usage: {} });
    const onAttempt = vi.fn();
    const provider = createOpenRouterProvider(config, fetchMock);

    await expect(provider.complete({ ...baseReq, onAttempt })).rejects.toThrow("empty completion");
    expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(onAttempt).toHaveBeenCalledWith({ attempt: 1, failed: true, errorClass: "empty-completion" });
  });
});
