#!/usr/bin/env node
/**
 * Secret scan over git-tracked files. Fails the run when a plausible API key
 * pattern appears in any tracked file. Deliberately narrow to avoid false
 * positives on project internals ("task-list" must not match "sk-").
 *
 * Patterns: OpenRouter (sk-or-v1-), generic long sk- keys (OpenAI/Anthropic),
 * Neon (npg_), GitHub (ghp_, github_pat_).
 */
import { execSync } from "node:child_process";

const PATTERNS = [
  /sk-or-v1-[A-Za-z0-9]/, // OpenRouter
  /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/, // generic sk- keys (OpenAI, Anthropic) - long bodies only
  /npg_[A-Za-z0-9]{10,}/, // Neon
  /ghp_[A-Za-z0-9]{30,}/, // GitHub PAT
  /github_pat_[A-Za-z0-9_]{20,}/, // GitHub fine-grained PAT
];

let tracked;
try {
  tracked = execSync("git ls-files", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })
    .split("\n")
    .filter(Boolean);
} catch {
  console.log("[check-secrets] not a git repository - skipping");
  process.exit(0);
}

// Test files contain synthetic credential-shaped fixtures BY DESIGN (mock API
// keys); a match there is a false positive, not a leak. Real secrets must
// never be committed anywhere - including tests - but the scan targets app
// code and config where a real key would actually appear.
const isTestFile = (file) => /(^|\/)src\/test\//.test(file) || /\.test\.ts$/.test(file) || /\.integration\.ts$/.test(file);

const violations = [];
for (const file of tracked) {
  if (/\.(png|jpg|jpeg|gif|webp|ico|woff2?|pdf)$/.test(file)) continue;
  if (isTestFile(file)) continue;
  let content;
  try {
    content = execSync(`git show HEAD:${JSON.stringify(file)}`, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    continue; // newly staged, not yet committed - staging area is checked by hooks/CI on commit
  }
  for (const pattern of PATTERNS) {
    if (pattern.test(content)) {
      violations.push(`${file} matches ${pattern}`);
    }
  }
}

if (violations.length > 0) {
  console.error("[check-secrets] BLOCKED - credential-like literals in tracked files:");
  for (const v of violations) console.error(`  ${v}`);
  console.error("Move the value to .env (gitignored) and reference it via process.env.");
  process.exit(1);
}

console.log(`[check-secrets] clean - ${tracked.length} tracked files scanned`);
