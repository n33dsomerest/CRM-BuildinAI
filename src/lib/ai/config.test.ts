import { afterEach, describe, expect, it, vi } from "vitest";
import { getAiConfig, isAiConfigured, modelFor } from "@/lib/ai/config";

const KEY = "sk-or-v1-testkeyvalue000000";

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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAiConfig", () => {
  it("reports unconfigured when the key is missing", () => {
    withEnv({ OPENROUTER_API_KEY: undefined, AI_MODEL: undefined }, () => {
      expect(getAiConfig()).toBeNull();
      expect(isAiConfigured()).toBe(false);
      expect(modelFor("strong")).toBeNull();
    });
  });

  it("treats an empty or whitespace key as unconfigured", () => {
    withEnv({ OPENROUTER_API_KEY: "   ", AI_MODEL: undefined }, () => {
      expect(getAiConfig()).toBeNull();
    });
  });

  it("applies default models when only the key is set", () => {
    withEnv({ OPENROUTER_API_KEY: KEY, AI_MODEL: undefined, AI_MODEL_CHEAP: undefined }, () => {
      const config = getAiConfig();
      expect(config).toEqual({
        apiKey: KEY,
        model: "anthropic/claude-sonnet-4.5",
        cheapModel: "google/gemini-2.5-flash",
      });
    });
  });

  it("honours explicit model overrides", () => {
    withEnv(
      { OPENROUTER_API_KEY: KEY, AI_MODEL: "vendor/strong", AI_MODEL_CHEAP: "vendor/cheap" },
      () => {
        expect(modelFor("strong")).toBe("vendor/strong");
        expect(modelFor("cheap")).toBe("vendor/cheap");
      }
    );
  });
});
