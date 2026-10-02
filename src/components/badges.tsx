import type { ActivityType, ContactStatus, LeadSource, LeadStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

/* ── Contact lifecycle status ────────────────────────────────────────────── */

const CONTACT_STATUS: Record<ContactStatus, { label: string; className: string }> = {
  LEAD: { label: "Lead", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  PROSPECT: { label: "Prospect", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  CUSTOMER: { label: "Customer", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
};

export function ContactStatusBadge({ status }: { status: ContactStatus }) {
  const config = CONTACT_STATUS[status];
  return (
    <Badge variant="secondary" className={cn("border-transparent", config.className)}>
      {config.label}
    </Badge>
  );
}

/* ── Lead qualification status ───────────────────────────────────────────── */

const LEAD_STATUS: Record<LeadStatus, { label: string; className: string }> = {
  NEW: { label: "New", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  WORKING: { label: "Working", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  QUALIFIED: { label: "Qualified", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  UNQUALIFIED: { label: "Unqualified", className: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400" },
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const config = LEAD_STATUS[status];
  return (
    <Badge variant="secondary" className={cn("border-transparent", config.className)}>
      {config.label}
    </Badge>
  );
}

/* ── Lead source ─────────────────────────────────────────────────────────── */

const SOURCE_LABEL: Record<LeadSource, string> = {
  WEB: "Web",
  REFERRAL: "Referral",
  EVENT: "Event",
  COLD_CALL: "Cold call",
  OTHER: "Other",
};

export function LeadSourceLabel({ source }: { source: LeadSource }) {
  return <span>{SOURCE_LABEL[source]}</span>;
}

/* ── Activity type ───────────────────────────────────────────────────────── */

const ACTIVITY_META: Record<ActivityType, { label: string; className: string }> = {
  NOTE: { label: "Note", className: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400" },
  CALL: { label: "Call", className: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  MEETING: { label: "Meeting", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  EMAIL: { label: "Email", className: "bg-teal-500/15 text-teal-700 dark:text-teal-400" },
};

export function ActivityTypeBadge({ type }: { type: ActivityType }) {
  const config = ACTIVITY_META[type];
  return (
    <Badge variant="secondary" className={cn("border-transparent", config.className)}>
      {config.label}
    </Badge>
  );
}
