import { z } from "zod";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const optionalText = (max = 255) =>
  z.preprocess(emptyToUndefined, z.string().max(max, `Must be ${max} characters or fewer`).optional());

const optionalEmail = z.preprocess(emptyToUndefined, z.email("Invalid email address").optional());

const optionalDate = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD date format")
    .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00`).getTime()), "Invalid date")
    .optional()
);

/* ── Auth ────────────────────────────────────────────────────────────────── */

export const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

/* ── Accounts ────────────────────────────────────────────────────────────── */

export const accountSchema = z.object({
  name: z.string().min(2, "Company name is required").max(120),
  industry: optionalText(80),
  website: optionalText(200),
  phone: optionalText(40),
});

/* ── Contacts ────────────────────────────────────────────────────────────── */

export const contactSchema = z.object({
  name: z.string().min(2, "Name is required").max(120),
  email: optionalEmail,
  phone: optionalText(40),
  position: optionalText(80),
  status: z.enum(["LEAD", "PROSPECT", "CUSTOMER"]),
  accountId: z.string().min(1, "Account is required"),
  ownerId: z.string().min(1, "Owner is required"),
});

export const contactImportRowSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: optionalEmail,
  phone: optionalText(40),
  company: optionalText(120),
  status: z.enum(["LEAD", "PROSPECT", "CUSTOMER"]).default("PROSPECT"),
});

/* ── Leads ───────────────────────────────────────────────────────────────── */

export const leadSchema = z.object({
  name: z.string().min(2, "Name is required").max(120),
  email: optionalEmail,
  phone: optionalText(40),
  company: optionalText(120),
  source: z.enum(["WEB", "REFERRAL", "EVENT", "COLD_CALL", "OTHER"]),
  status: z.enum(["NEW", "WORKING", "QUALIFIED", "UNQUALIFIED"]),
});

export const convertLeadSchema = z.object({
  leadId: z.string().min(1),
  dealTitle: z.string().min(2, "Deal title is required").max(120),
  dealValue: z.coerce.number().positive("Deal value must be greater than 0"),
});

/* ── Deals ───────────────────────────────────────────────────────────────── */

export const dealSchema = z.object({
  title: z.string().min(2, "Title is required").max(120),
  value: z.coerce.number().positive("Value must be greater than 0").max(1_000_000_000),
  stageId: z.string().min(1, "Stage is required"),
  accountId: z.string().min(1, "Account is required"),
  contactId: z.string().min(1, "Contact is required"),
  ownerId: z.string().min(1, "Owner is required"),
  expectedCloseDate: optionalDate,
});

/* ── Activities ──────────────────────────────────────────────────────────── */

export const activitySchema = z.object({
  contactId: z.string().min(1),
  dealId: z.preprocess(emptyToUndefined, z.string().optional()),
  type: z.enum(["NOTE", "CALL", "MEETING", "EMAIL"]),
  subject: z.string().min(2, "Subject is required").max(120),
  body: optionalText(2000),
  // AI-assisted fields: proposed by the summarizer, edited and confirmed by a human
  summary: optionalText(500),
  sentiment: z.preprocess(emptyToUndefined, z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "RISK"]).optional()),
  nextStep: optionalText(300),
  suggestedTask: optionalText(200),
  aiGenerated: z.coerce.boolean().optional(),
});

/* -- AI feature schemas (validated model output; never trust raw completions) -- */

export const emailDraftSchema = z.object({
  subject: z.string().min(1, "Subject must not be empty").max(200),
  body: z.string().min(1, "Body must not be empty").max(5000),
});

export const leadScoreSchema = z.object({
  score: z.coerce.number().int().min(0, "Score must be 0-100").max(100, "Score must be 0-100"),
  reason: z.string().min(10, "A score without reasons is worse than no score").max(500),
});

export const summarizeDraftSchema = z.object({
  summary: z.string().min(1, "Summary must not be empty").max(500),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "RISK"]),
  nextStep: optionalText(300),
  suggestedTask: optionalText(200),
});

/* Chat widget (validated both ways: request messages from the client, answer
   from the model - never trust raw completions) */

/** Conversation history sent per request; client holds the state, so the cap
 *  bounds the token cost instead of the database. */
export const CHAT_MESSAGE_CAP = 12;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(CHAT_MESSAGE_CAP),
});

export const chatAnswerSchema = z.object({
  answer: z.string().min(1, "Answer must not be empty").max(4000),
  // href is deliberately NOT startsWith("/") here: one stray model-emitted URL
  // must not fail the whole turn. filterSuggestedActions (allow-list, in the
  // action) is the only gate that decides which links reach the client.
  suggestedActions: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        href: z.string().max(200),
      })
    )
    .max(3)
    .optional(),
});

/* ── Tasks ───────────────────────────────────────────────────────────────── */

export const taskSchema = z.object({
  title: z.string().min(2, "Title is required").max(160),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date is required"),
  contactId: z.preprocess(emptyToUndefined, z.string().optional()),
  dealId: z.preprocess(emptyToUndefined, z.string().optional()),
  // ADMIN may delegate; SALES is forced to self in the action.
  assigneeId: z.preprocess(emptyToUndefined, z.string().optional()),
});

/* ── Users (admin) ───────────────────────────────────────────────────────── */

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72)
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/\d/, "Password must contain a digit")
  .refine((v) => !/(.)\1{2,}/.test(v), "Password must not repeat a character 3+ times in a row");

export const createUserSchema = z.object({
  name: z.string().min(2, "Name is required").max(80),
  email: z.email("Enter a valid email address"),
  password: passwordSchema,
  role: z.enum(["ADMIN", "SALES"]),
});

/* Form value types: components keep their own always-string types (controlled
   inputs hold "" for empty optional fields and `emptyToUndefined` converts at
   parse time; z.coerce fields like dealSchema.value accept the raw string), so
   these z.infer OUTPUT aliases do not describe form state and would drift.
   The one alias that matches its form exactly is imported for use; the rest
   are deliberately not exported. */
export type CreateUserInput = z.infer<typeof createUserSchema>;
