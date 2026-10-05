import { afterEach, describe, expect, it, vi } from "vitest";
import { getAiConfig, isAiConfigured } from "@/lib/ai/config";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

describe("getAiConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports unconfigured when the key is missing", () => {
    withEnv({ AI_API_KEY: undefined, OPENROUTER_API_KEY: undefined }, () => {
      expect(getAiConfig()).toBeNull();
      expect(isAiConfigured()).toBe(false);
    });
  });

  it("treats the literal placeholder YOUR_API_KEY as unconfigured", () => {
    withEnv({ AI_API_KEY: "YOUR_API_KEY" }, () => {
      expect(getAiConfig()).toBeNull();
      expect(isAiConfigured()).toBe(false);
    });
  });

  it("treats an empty or whitespace key as unconfigured", () => {
    withEnv({ AI_API_KEY: "   " }, () => {
      expect(getAiConfig()).toBeNull();
    });
  });

  it("applies the default gateway and model when only the key is set", () => {
    withEnv({ AI_API_KEY: "gw-key", AI_BASE_URL: undefined, AI_MODEL: undefined, AI_MODEL_FALLBACKS: undefined }, () => {
      expect(getAiConfig()).toEqual({
        apiKey: "gw-key",
        baseUrl: "https://gen.ai.kku.ac.th/okmd/api/v1",
        models: ["gemini-2.5-flash-lite"],
        budgets: new Map(),
        userShare: null,
      });
    });
  });

  it("builds the ordered chain from AI_MODEL + comma-separated fallbacks", () => {
    withEnv(
      {
        AI_API_KEY: "gw-key",
        AI_BASE_URL: "https://gateway.test/v1/",
        AI_MODEL: "primary",
        AI_MODEL_FALLBACKS: "fallback-a, fallback-b ,",
      },
      () => {
        const config = getAiConfig();
        expect(config?.baseUrl).toBe("https://gateway.test/v1");
        expect(config?.models).toEqual(["primary", "fallback-a", "fallback-b"]);
      }
    );
  });
});
