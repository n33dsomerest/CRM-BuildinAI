#!/usr/bin/env node
/**
 * Validates the AI gateway setup before first use:
 *  1. AI_API_KEY present (placeholder refused)
 *  2. the gateway accepts the key
 *  3. EVERY model in the chain (primary + fallbacks) is reachable with a
 *     one-token probe - a fallback that 404s must be caught before deploy,
 *     not when a user needs it
 *
 * Run with: npm run ai:check
 */
import { readFileSync } from "node:fs";

function envValue(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(".env", "utf8").split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).replace(/^"|"$/g, "").trim() : undefined;
  } catch {
    return undefined;
  }
}

const apiKey = envValue("AI_API_KEY");
const baseUrl = (envValue("AI_BASE_URL") || "https://gen.ai.kku.ac.th/okmd/api/v1").replace(/\/+$/, "");
const primary = envValue("AI_MODEL") || "gemini-2.5-flash-lite";
const fallbacks = (envValue("AI_MODEL_FALLBACKS") || "").split(",").map((m) => m.trim()).filter(Boolean);
const models = [primary, ...fallbacks];

if (!apiKey) {
  console.error("[ai:check] AI_API_KEY is not set. Add it to .env (never commit it).");
  process.exit(1);
}
if (/^YOUR_API_KEY$/i.test(apiKey)) {
  console.error('[ai:check] AI_API_KEY is still the placeholder "YOUR_API_KEY".');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

try {
  // 1. Key accepted? A cheap 1-token completion proves auth on the chat
  //    endpoint, which is what the app actually uses.
  const probe = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: models[0],
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!probe.ok) {
    console.error(`[ai:check] key/endpoint rejected (HTTP ${probe.status}) - check AI_API_KEY and AI_BASE_URL.`);
    process.exit(1);
  }
  console.log(`[ai:check] key OK against ${baseUrl}`);

  // 2. Probe EVERY model in the chain with a one-token completion.
  let failures = 0;
  for (const model of models) {
    const started = Date.now();
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      failures += 1;
      console.error(`[ai:check] FAIL ${model} (HTTP ${res.status})`);
      continue;
    }
    const data = await res.json();
    const remaining = data.model_quota?.daily_remaining_tokens;
    console.log(
      `[ai:check] PASS ${model} (${Date.now() - started}ms, remaining budget: ${remaining ?? "unknown"})`
    );
  }

  if (failures > 0) {
    console.error(`[ai:check] ${failures} of ${models.length} models unreachable - fix AI_MODEL_FALLBACKS before deploy.`);
    process.exit(1);
  }
  console.log("[ai:check] all models in the chain are reachable.");
} catch (error) {
  console.error(`[ai:check] network failure: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
