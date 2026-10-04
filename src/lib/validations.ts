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
  aiGenerated: z.coerce.boolean().optional(),
});

/* -- AI feature schemas (validated model output; never trust raw completions) -- */

export const summarizeDraftSchema = z.object({
  summary: z.string().min(1, "Summary must not be empty").max(500),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "RISK"]),
  nextStep: optionalText(300),
  suggestedTask: optionalText(200),
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

export type SignInInput = z.infer<typeof signInSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type LeadInput = z.infer<typeof leadSchema>;
export type DealInput = z.infer<typeof dealSchema>;
export type ActivityInput = z.infer<typeof activitySchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
