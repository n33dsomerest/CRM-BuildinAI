import { PII_FIELDS } from "@/lib/audit";

/**
 * Prompt hygiene: customer PII never reaches the AI provider. Prompts contain
 * customer data, so email and phone (per PII_FIELDS in audit.ts — the same
 * list the audit redactor uses) are stripped before interpolation. Free-text
 * bodies get a regex scrub because emails and phone numbers hide inside notes.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Phone-like sequences: +country, international separators, or 7+ digit runs. */
const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/g;

/** Keep the last two digits of a phone number so context survives redaction. */
function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 2 ? `••••••${digits.slice(-2)}` : "••••••";
}

/** Structured customer data: drop PII fields entirely, scrub values it keeps. */
export function redactForPrompt<T extends Record<string, unknown>>(data: T): Partial<T> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if ((PII_FIELDS as readonly string[]).includes(key)) continue;
    copy[key] = typeof value === "string" ? redactText(value) : value;
  }
  return copy as Partial<T>;
}

/** Free text (activity bodies, notes): scrub emails and phone-like runs. */
export function redactText(text: string): string {
  return text.replace(EMAIL_RE, "[email redacted]").replace(PHONE_RE, (match) => maskPhone(match));
}
