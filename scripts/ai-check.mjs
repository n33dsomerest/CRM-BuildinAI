#!/usr/bin/env node
/**
 * Validates the OpenRouter setup before first use:
 *  1. OPENROUTER_API_KEY present
 *  2. the key is accepted by OpenRouter (GET /api/v1/auth/key)
 *  3. the configured model IDs exist in the reachable model list
 *
 * Run with: npm run ai:check
 */
import { readFileSync } from "node:fs";

// Minimal .env reader (the script must work before any app module loads).
function envValue(name) {
  if (process.env[name]) return process.env[name];
  try {
    const raw = readFileSync(".env", "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    if (!line) return undefined;
    return line.slice(name.length + 1).replace(/^"|"$/g, "").trim();
  } catch {
    return undefined;
  }
}

const apiKey = envValue("OPENROUTER_API_KEY");
const model = envValue("AI_MODEL") || "anthropic/claude-sonnet-4.5";
const cheapModel = envValue("AI_MODEL_CHEAP") || "google/gemini-2.5-flash";

if (!apiKey) {
  console.error("[ai:check] OPENROUTER_API_KEY is not set. Add it to .env (never commit it).");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${apiKey}` };

try {
  const keyRes = await fetch("https://openrouter.ai/api/v1/auth/key", { headers });
  if (!keyRes.ok) {
    console.error(`[ai:check] key rejected (HTTP ${keyRes.status}) - check OPENROUTER_API_KEY.`);
    process.exit(1);
  }
  const keyInfo = await keyRes.json();
  const limit = keyInfo?.data?.limit;
  const usage = keyInfo?.data?.usage;
  console.log(`[ai:check] key OK. usage: ${usage ?? "n/a"} / limit: ${limit ?? "unlimited"}`);

  const modelsRes = await fetch("https://openrouter.ai/api/v1/models", { headers });
  if (!modelsRes.ok) {
    console.error(`[ai:check] could not list models (HTTP ${modelsRes.status}).`);
    process.exit(1);
  }
  const { data: models } = await modelsRes.json();
  const ids = new Set(models.map((m) => m.id));

  for (const wanted of [model, cheapModel]) {
    if (ids.has(wanted)) {
      console.log(`[ai:check] model reachable: ${wanted}`);
    } else {
      console.error(`[ai:check] MODEL NOT FOUND: "${wanted}" - pick one from https://openrouter.ai/models`);
      process.exit(1);
    }
  }
  console.log("[ai:check] all good - the configured models are reachable with this key.");
} catch (error) {
  console.error(`[ai:check] network failure: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
