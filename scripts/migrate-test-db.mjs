#!/usr/bin/env node
/**
 * Applies Prisma migrations to the INTEGRATION TEST database before the suite
 * runs, so local runs cannot fail (or silently mis-test) against a stale schema.
 * Mirrors what the CI integration job does with `npx prisma migrate deploy`.
 *
 * The URL is resolved exactly like src/test/setup.ts resolves it:
 * DIRECT_URL_TEST -> DATABASE_URL_TEST, and nothing else.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

function envValue(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).replace(/^"|"$/g, "").trim() : undefined;
  } catch {
    return undefined;
  }
}

const url = envValue("DIRECT_URL_TEST") ?? envValue("DATABASE_URL_TEST");
if (!url) {
  console.error(
    "[migrate-test-db] DIRECT_URL_TEST / DATABASE_URL_TEST not set - see .env.example. Refusing to guess."
  );
  process.exit(1);
}

execSync("npx prisma migrate deploy", {
  env: { ...process.env, DIRECT_URL: url },
  stdio: "inherit",
});
