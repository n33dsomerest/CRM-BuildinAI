import { describe, expect, it } from "vitest";
import { buildDraftEmailPrompt, DRAFT_EMAIL_SYSTEM_PROMPT } from "@/lib/ai/prompts/draft-email";

describe("buildDraftEmailPrompt", () => {
  it("grounds the draft in real deals and activities", () => {
    const { prompt } = buildDraftEmailPrompt({
      contactName: "Jane Doe",
      position: "Procurement Director",
      companyName: "Acme Corp",
      openDeals: [{ title: "Rollout Phase 1", stageName: "Proposal", value: "50000", probability: 50 }],
      recentActivities: [{ type: "CALL", subject: "Intro call" }],
    });
    expect(prompt).toContain("Jane Doe (Procurement Director) at Acme Corp");
    expect(prompt).toContain('Deal "Rollout Phase 1" in stage "Proposal" (50%)');
    expect(prompt).toContain("CALL: Intro call");
  });

  it("the no-prior-context case instructs a question, not invented history", () => {
    const { prompt } = buildDraftEmailPrompt({
      contactName: "New Lead",
      position: null,
      companyName: "Fresh Co",
      openDeals: [],
      recentActivities: [],
    });
    expect(prompt).toContain("There is no prior history");
    expect(prompt).toContain("asking a genuine question");
    expect(prompt).toContain("Do not invent past conversations");
  });

  it("the system prompt forbids fabrication and defines the JSON contract", () => {
    expect(DRAFT_EMAIL_SYSTEM_PROMPT).toContain("Never invent facts");
    expect(DRAFT_EMAIL_SYSTEM_PROMPT).toContain('"subject": string, "body": string');
    expect(DRAFT_EMAIL_SYSTEM_PROMPT).toContain("no markdown");
  });

  it("scrubs PII that leaked into activity subjects", () => {
    const { prompt } = buildDraftEmailPrompt({
      contactName: "Jane",
      position: null,
      companyName: "Acme",
      openDeals: [],
      recentActivities: [{ type: "EMAIL", subject: "re: jane.corp@vendor.example.org thread" }],
    });
    expect(prompt).not.toContain("jane.corp@vendor.example.org");
    expect(prompt).toContain("[email redacted]");
  });
});
