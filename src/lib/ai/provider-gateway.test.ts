import { describe, expect, it, vi } from "vitest";
import { createGatewayProvider, extractJsonObject, type GatewayConfig } from "@/lib/ai/provider-gateway";
import type { AiCompletionRequest } from "@/lib/ai/provider";

const config: GatewayConfig = {
  apiKey: "gw-test-key",
  baseUrl: "https://gateway.test/api/v1",
  models: ["primary-model", "fallback-model"],
};

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

/** Always-fresh Response per call - a Response body can only be read once. */
function fetchReturning(body: object | Error, status = 200) {
  const make = () => (body instanceof Error ? Promise.reject(body) : Promise.resolve(jsonResponse(body, status)));
  const mock = vi.fn(make);
  return mock;
}

/** Always-fresh Response per call - a Response body can only be read once. */
const okBody = {
  choices: [{ message: { content: '{"answer": 1}' }, finish_reason: "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 34 },
  model: "primary-model",
  provider: "Google",
};

const baseReq: AiCompletionRequest = { system: "s", prompt: "p", json: true };

describe("extractJsonObject", () => {
  it("returns clean JSON unchanged", () => {
    expect(extractJsonObject('{"a": 1}')).toBe('{"a": 1}');
  });

  it("strips a surrounding ```json fence", () => {
    expect(extractJsonObject('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it("strips a plain ``` fence", () => {
    expect(extractJsonObject('```\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it("slices prose-then-JSON down to the object", () => {
    expect(extractJsonObject('Here is the JSON you asked for:\n{"a": 1}\nHope that helps!')).toBe('{"a": 1}');
  });

  it("returns the empty string for empty input", () => {
    expect(extractJsonObject("   ")).toBe("");
  });

  it("returns unparseable text as-is (caller JSON.parse throws -> chain advances)", () => {
    expect(extractJsonObject("no braces here at all")).toBe("no braces here at all");
  });
});

describe("gateway provider chain", () => {
  it("primary succeeds -> fallbacks are never called", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(okBody));
    const provider = createGatewayProvider(config, fetchMock as unknown as typeof fetch);

    const completion = await provider.complete(baseReq);

    expect(completion.text).toBe('{"answer": 1}');
    expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("reports model and provider from the response, not the request", async () => {
    const body = {
      ...okBody,
      model: "actually-the-fallback",
      provider: "Deepseek",
    };
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(body)));
    const provider = createGatewayProvider(config, fetchMock as unknown as typeof fetch);

    const completion = await provider.complete(baseReq);
    expect(completion.model).toBe("actually-the-fallback");
    expect(completion.provider).toBe("Deepseek");
  });

  it("primary finish_reason length -> advances to the fallback", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: "" }, finish_reason: "length" }],
        usage: { prompt_tokens: 10, completion_tokens: 700 },
        model: "primary-model",
      }))
      .mockResolvedValueOnce(jsonResponse(okBody));
    const provider = createGatewayProvider(config, fetchMock as unknown as typeof fetch);

    const completion = await provider.complete(baseReq);
    expect(completion.text).toBe('{"answer": 1}');
    expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls[1][1].body).toContain("fallback-model");
  });

  it("primary returns prose instead of JSON -> advances, fallback JSON is returned", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: "Here is your answer, no JSON at all." }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
        model: "primary-model",
      }))
      .mockResolvedValueOnce(jsonResponse(okBody));
    const provider = createGatewayProvider(config, fetchMock as unknown as typeof fetch);

    const completion = await provider.complete(baseReq);
    expect(completion.text).toBe('{"answer": 1}');
  });

  it("primary 429 -> retries the same model up to MAX_RETRIES, then advances", async () => {
    vi.useFakeTimers();
    try {
      // 3 rate-limited responses (1 initial + 2 retries), then the fallback answers
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response("{}", { status: 429 }))
        .mockResolvedValueOnce(new Response("{}", { status: 429 }))
        .mockResolvedValueOnce(new Response("{}", { status: 429 }))
        .mockImplementation(() => Promise.resolve(jsonResponse(okBody)));
      const provider = createGatewayProvider(config, fetchMock as unknown as typeof fetch);

      const assertion = expect(provider.complete(baseReq)).resolves.toMatchObject({ text: '{"answer": 1}' });
      await vi.runAllTimersAsync();
      await assertion;

      const models = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(c[1].body).model);
      expect(models).toEqual(["primary-model", "primary-model", "primary-model", "fallback-model"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("primary 401 -> fails immediately, no fallback attempt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    const provider = createGatewayProvider(config, fetchMock as unknown as typeof fetch);

    await expect(provider.complete(baseReq)).rejects.toThrow("AI upstream error (auth)");
    expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("skips a model the local budget gate marks as exhausted, without an HTTP call", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(okBody)));
    const provider = createGatewayProvider(
      { ...config, hasBudget: async (model) => model !== "primary-model" },
      fetchMock as unknown as typeof fetch
    );

    const completion = await provider.complete(baseReq);
    expect(completion.text).toBe('{"answer": 1}');
    const models = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(c[1].body).model);
    expect(models).toEqual(["fallback-model"]);
  });

  it("skips a model the gateway reports as out of tokens, without an HTTP call", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(okBody)));
    const provider = createGatewayProvider(
      { ...config, remainingTokens: async (model) => (model === "primary-model" ? 0 : 5000) },
      fetchMock as unknown as typeof fetch
    );

    const completion = await provider.complete(baseReq);
    const models = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(c[1].body).model);
    expect(models).toEqual(["fallback-model"]);
    expect(completion.text).toBe('{"answer": 1}');
  });

  it("empty content advances to the next model", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: {}, finish_reason: "stop" }] }))
      .mockResolvedValueOnce(jsonResponse(okBody));
    const provider = createGatewayProvider(config, fetchMock as unknown as typeof fetch);

    const completion = await provider.complete(baseReq);
    expect(completion.text).toBe('{"answer": 1}');
  });

  it("network failure retries the same model up to MAX_RETRIES, then advances", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn()
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockImplementation(() => Promise.resolve(jsonResponse(okBody)));
      const provider = createGatewayProvider(config, fetchMock as unknown as typeof fetch);

      const assertion = expect(provider.complete(baseReq)).resolves.toMatchObject({ text: '{"answer": 1}' });
      await vi.runAllTimersAsync();
      await assertion;

      const models = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(c[1].body).model);
      expect(models).toEqual(["primary-model", "primary-model", "primary-model", "fallback-model"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports every attempt through onAttempt across the chain", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: "partial reasoning, truncated" }, finish_reason: "length" }],
        model: "primary-model",
      }))
      .mockResolvedValueOnce(jsonResponse(okBody));
    const onAttempt = vi.fn();
    const provider = createGatewayProvider(config, fetchMock as unknown as typeof fetch);

    await provider.complete({ ...baseReq, onAttempt });
    expect(onAttempt).toHaveBeenCalledWith({ attempt: 1, failed: true, errorClass: "length-truncated" });
    expect(onAttempt).toHaveBeenCalledWith({ attempt: 1, failed: false });
  });

  it("throws after the whole chain is exhausted", async () => {
    const fetchMock = fetchReturning({
      choices: [{ message: { content: "truncated" }, finish_reason: "length" }],
    });
    const provider = createGatewayProvider(config, fetchMock as unknown as typeof fetch);
    await expect(provider.complete(baseReq)).rejects.toThrow("AI upstream error");
    expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(config.models.length);
  });
});
