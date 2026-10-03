import { createHash } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Completion cache keyed by sha256(feature + normalized input). Cache hits are
 * FREE — with a 20/day budget, serving repeats without touching quota matters
 * more than any token cost. Entries live until the underlying record changes;
 * feature actions pass record identifiers into the input so a stale cache key
 * simply never matches again.
 */

export function cacheKey(feature: string, input: unknown): string {
  return createHash("sha256").update(`${feature}:${JSON.stringify(normalize(input))}`).digest("hex");
}

/** Stable key order + trimmed strings so cosmetic input differences still hit. */
function normalize(value: unknown): unknown {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalize(v)])
    );
  }
  return value;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const row = await db.aiCache.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return JSON.parse(row.response) as T;
  } catch {
    return null; // corrupt entry behaves like a miss
  }
}

export async function setCached(key: string, feature: string, response: unknown): Promise<void> {
  await db.aiCache.upsert({
    where: { key },
    create: { key, feature, response: JSON.stringify(response) },
    update: { response: JSON.stringify(response) },
  });
}
