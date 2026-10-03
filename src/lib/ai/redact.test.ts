import { describe, expect, it } from "vitest";
import { redactForPrompt, redactText } from "@/lib/ai/redact";
import { cacheKey } from "@/lib/ai/cache";

describe("redactForPrompt", () => {
  it("drops email and phone fields entirely", () => {
    const result = redactForPrompt({
      name: "Jane Doe",
      email: "jane@acme.com",
      phone: "+1 555-0142",
      status: "PROSPECT",
    });
    expect(result).toEqual({ name: "Jane Doe", status: "PROSPECT" });
  });

  it("keeps the last two digits of a phone for context", () => {
    const result = redactText("call the buyer at +1 555-0142 tomorrow");
    expect(result).toContain("••••••42");
    expect(result).not.toContain("555-0142");
  });

  it("scrubs emails inside free-text bodies", () => {
    const result = redactText("Customer wrote from jane.doe@corp.example.org about pricing");
    expect(result).not.toContain("jane.doe@corp.example.org");
    expect(result).toContain("[email redacted]");
  });

  it("leaves text without PII untouched", () => {
    const text = "Discussed the Q4 rollout and budget approval";
    expect(redactText(text)).toBe(text);
  });
});

describe("cacheKey", () => {
  it("is stable across key order and whitespace", () => {
    const a = cacheKey("summarize", { contactId: "c1", body: "  note text  " });
    const b = cacheKey("summarize", { body: "note text", contactId: "c1" });
    expect(a).toBe(b);
  });

  it("differs per feature and input", () => {
    const a = cacheKey("summarize", { id: "x" });
    const b = cacheKey("draft", { id: "x" });
    const c = cacheKey("summarize", { id: "y" });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
