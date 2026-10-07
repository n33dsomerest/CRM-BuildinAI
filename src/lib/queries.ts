import type { ActivityType, ContactStatus, LeadSource, LeadStatus, Prisma, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ownerFilter, type ScopedUser } from "@/lib/scope";

/* ── Serializable row types (Decimal values are converted to number) ─────── */

export interface DealCard {
  id: string;
  title: string;
  value: number;
  stageId: string;
  expectedCloseDate: Date | null;
  contactName: string;
  accountName: string;
  ownerName: string;
  ownerId: string;
  contactId: string;
}

export interface FunnelColumn {
  id: string;
  name: string;
  order: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  deals: DealCard[];
  totalValue: number;
  weightedValue: number;
}

export interface DashboardData {
  kpis: {
    pipelineValue: number;
    weightedForecast: number;
    totalContacts: number;
    wonDeals: number;
    wonValue: number;
    /** closed-won ÷ (closed-won + closed-lost) — open deals excluded */
    winRate: number;
  };
  funnel: FunnelColumn[];
  recentActivities: ActivityRow[];
  myTasks: TaskRow[];
}

export interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  status: ContactStatus;
  accountId: string;
  accountName: string;
  ownerId: string;
  ownerName: string;
}

export interface ContactDetail extends ContactRow {
  account: { id: string; name: string; industry: string | null; website: string | null; phone: string | null };
  deals: { id: string; title: string; value: number; stageName: string; isWon: boolean; isLost: boolean; expectedCloseDate: Date | null }[];
  activities: ActivityRow[];
  tasks: TaskRow[];
}

export interface ActivityRow {
  id: string;
  type: ActivityType;
  subject: string;
  body: string | null;
  summary: string | null;
  sentiment: string | null;
  nextStep: string | null;
  suggestedTask: string | null;
  aiGenerated: boolean;
  occurredAt: Date;
  userName: string;
  dealTitle: string | null;
  dealId: string | null;
  contactId: string;
}

export interface TaskRow {
  id: string;
  title: string;
  dueDate: Date;
  status: TaskStatus;
  /** OPEN and past due — computed server-side to keep render pure. */
  overdue: boolean;
  contactId: string | null;
  contactName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  assigneeId: string;
  assigneeName: string;
}

export interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: LeadSource;
  status: LeadStatus;
  score: number | null;
  scoreReason: string | null;
  scoredAt: Date | null;
  ownerId: string;
  ownerName: string;
  createdAt: Date;
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/* ── Shared mappers ──────────────────────────────────────────────────────── */

/**
 * Query shapes for the funnel.
 *
 * These are deliberately FLAT (`Stage[]` + `DealWithRelations[]`, not
 * `StageWithDeals`). Prisma splits a nested `include` into one query per relation
 * and runs them in sequence, so `stage.findMany({ include: { deals: { include:
 * { contact: { include: { account } }, owner } } } })` costs 8 sequential
 * round-trips. Against a pooled Postgres in another region every round-trip is
 * ~150-250ms of pure latency, so the row COUNT hardly matters - the SERIAL
 * chain does. Two flat queries issued together run concurrently and finish in
 * roughly one round-trip's worth of latency.
 *
 * Grouping deals into their stage happens in `mapStagesToFunnel` instead of in
 * SQL: that is free locally, and it keeps a single place responsible for the
 * funnel's shape.
 */

/** Raw `deal.findMany` row with the relations a funnel card needs. */
export interface DealWithRelations {
  id: string;
  title: string;
  value: Prisma.Decimal;
  stageId: string;
  expectedCloseDate: Date | null;
  contactId: string;
  contact: { name: string; account: { name: string } };
  owner: { id: string; name: string };
}

/** Stage columns the funnel renders. */
export interface FunnelStage {
  id: string;
  name: string;
  order: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
}

/** The exact `select` both funnel readers share, so the two pages cannot drift. */
const FUNNEL_DEAL_SELECT = {
  id: true,
  title: true,
  value: true,
  stageId: true,
  expectedCloseDate: true,
  contactId: true,
  contact: { select: { name: true, account: { select: { name: true } } } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.DealSelect;

/** Maps a flat deal row (Decimal → number) into the serializable card type. */
export function mapDeal(d: DealWithRelations): DealCard {
  return {
    id: d.id,
    title: d.title,
    value: Number(d.value),
    stageId: d.stageId,
    expectedCloseDate: d.expectedCloseDate,
    contactName: d.contact.name,
    accountName: d.contact.account.name,
    ownerName: d.owner.name,
    ownerId: d.owner.id,
    contactId: d.contactId,
  };
}

/**
 * Groups flat deal rows into ordered funnel columns with per-stage totals.
 * Deals whose stageId matches no stage are dropped rather than leaking into a
 * synthetic column - the stage list is the authority on what exists.
 */
export function mapStagesToFunnel(stages: FunnelStage[], deals: DealWithRelations[]): FunnelColumn[] {
  const byStage = new Map<string, DealCard[]>();
  for (const stage of stages) byStage.set(stage.id, []);
  for (const deal of deals) {
    const bucket = byStage.get(deal.stageId);
    if (bucket) bucket.push(mapDeal(deal));
  }

  return stages.map((stage) => {
    const cards = byStage.get(stage.id) ?? [];
    const totalValue = cards.reduce((sum, d) => sum + d.value, 0);
    return {
      id: stage.id,
      name: stage.name,
      order: stage.order,
      probability: stage.probability,
      isWon: stage.isWon,
      isLost: stage.isLost,
      deals: cards,
      totalValue,
      weightedValue: Math.round((totalValue * stage.probability) / 100),
    };
  });
}

/**
 * Loads stages + scoped deals concurrently and shapes them into the funnel.
 * Shared by the dashboard and the deals board so the two stay in lockstep.
 */
async function loadFunnel(user: ScopedUser): Promise<FunnelColumn[]> {
  const [stages, deals] = await Promise.all([
    db.stage.findMany({ orderBy: { order: "asc" } }),
    db.deal.findMany({ where: ownerFilter(user), orderBy: { createdAt: "desc" }, select: FUNNEL_DEAL_SELECT }),
  ]);
  return mapStagesToFunnel(stages, deals);
}

/* ── Dashboard ───────────────────────────────────────────────────────────── */

export async function getDashboardData(user: ScopedUser): Promise<DashboardData> {
  // ONE Promise.all, no awaits before it. Previously the funnel was awaited on
  // its own first, then three more reads - that serialised every round-trip
  // against a ~150-250ms-per-hop pooled Postgres in another region.
  const [stages, deals, totalContacts, recentActivities, myTasks] = await Promise.all([
    db.stage.findMany({ orderBy: { order: "asc" } }),
    db.deal.findMany({ where: ownerFilter(user), orderBy: { createdAt: "desc" }, select: FUNNEL_DEAL_SELECT }),
    db.contact.count({ where: ownerFilter(user) }),
    db.activity.findMany({
      where: { contact: ownerFilter(user) },
      orderBy: { occurredAt: "desc" },
      take: 8,
      include: {
        user: { select: { name: true } },
        deal: { select: { title: true } },
      },
    }),
    db.task.findMany({
      where: { assigneeId: user.id, status: "OPEN" },
      orderBy: { dueDate: "asc" },
      take: 6,
      include: {
        contact: { select: { name: true } },
        deal: { select: { title: true } },
        assignee: { select: { name: true } },
      },
    }),
  ]);

  const funnel = mapStagesToFunnel(stages, deals);

  const openStages = funnel.filter((s) => !s.isWon && !s.isLost);
  const wonStage = funnel.find((s) => s.isWon);
  const lostStage = funnel.find((s) => s.isLost);
  const wonCount = wonStage?.deals.length ?? 0;
  const lostCount = lostStage?.deals.length ?? 0;

  return {
    kpis: {
      pipelineValue: openStages.reduce((sum, s) => sum + s.totalValue, 0),
      weightedForecast: openStages.reduce((sum, s) => sum + s.weightedValue, 0),
      totalContacts,
      wonDeals: wonCount,
      wonValue: wonStage?.totalValue ?? 0,
      winRate: wonCount + lostCount === 0 ? 0 : Math.round((wonCount / (wonCount + lostCount)) * 100),
    },
    funnel,
    recentActivities: recentActivities.map(mapActivity),
    myTasks: myTasks.map(mapTask),
  };
}

/* ── Deals board ─────────────────────────────────────────────────────────── */

export async function getDealsBoard(user: ScopedUser): Promise<FunnelColumn[]> {
  return loadFunnel(user);
}

/* ── Contacts ────────────────────────────────────────────────────────────── */

export interface ContactQuery {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function getContactsPage(user: ScopedUser, query: ContactQuery): Promise<Paged<ContactRow>> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, query.pageSize ?? 10));

  const AND: Prisma.ContactWhereInput[] = [ownerFilter(user)];
  if (query.search?.trim()) {
    const term = query.search.trim();
    AND.push({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
        { account: { name: { contains: term, mode: "insensitive" } } },
      ],
    });
  }
  if (query.status && ["LEAD", "PROSPECT", "CUSTOMER"].includes(query.status)) {
    AND.push({ status: query.status as ContactStatus });
  }
  const where: Prisma.ContactWhereInput = { AND };

  const [rows, total] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        account: { select: { name: true } },
        owner: { select: { name: true } },
      },
    }),
    db.contact.count({ where }),
  ]);

  return {
    rows: rows.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      position: c.position,
      status: c.status,
      accountId: c.accountId,
      accountName: c.account.name,
      ownerId: c.ownerId,
      ownerName: c.owner.name,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getContactDetail(user: ScopedUser, id: string): Promise<ContactDetail | null> {
  // Phase 1 is deliberately NOT merged with phase 2: the ownerFilter check is
  // the authorisation gate, and the three child reads below are keyed on
  // contactId alone. Firing them in parallel would mean querying another
  // owner's records before we know whether this contact is theirs to read.
  // One round-trip to prove ownership, then one round-trip for everything else.
  const contact = await db.contact.findFirst({
    where: { id, ...ownerFilter(user) },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      position: true,
      status: true,
      accountId: true,
      ownerId: true,
      account: true,
      owner: { select: { name: true } },
    },
  });
  if (!contact) return null;

  const [deals, activities, tasks] = await Promise.all([
    db.deal.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: "desc" },
      include: { stage: { select: { name: true, isWon: true, isLost: true } } },
    }),
    db.activity.findMany({
      where: { contactId: contact.id },
      orderBy: { occurredAt: "desc" },
      take: 50,
      include: { user: { select: { name: true } }, deal: { select: { title: true } } },
    }),
    db.task.findMany({
      where: { contactId: contact.id },
      orderBy: { dueDate: "asc" },
      include: {
        contact: { select: { name: true } },
        deal: { select: { title: true } },
        assignee: { select: { name: true } },
      },
    }),
  ]);

  return {
    id: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    position: contact.position,
    status: contact.status,
    accountId: contact.accountId,
    accountName: contact.account.name,
    ownerId: contact.ownerId,
    ownerName: contact.owner.name,
    account: {
      id: contact.account.id,
      name: contact.account.name,
      industry: contact.account.industry,
      website: contact.account.website,
      phone: contact.account.phone,
    },
    deals: deals.map((d) => ({
      id: d.id,
      title: d.title,
      value: Number(d.value),
      stageName: d.stage.name,
      isWon: d.stage.isWon,
      isLost: d.stage.isLost,
      expectedCloseDate: d.expectedCloseDate,
    })),
    activities: activities.map(mapActivity),
    tasks: tasks.map(mapTask),
  };
}

/* ── Leads ───────────────────────────────────────────────────────────────── */

export interface LeadQuery {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function getLeadsPage(user: ScopedUser, query: LeadQuery = {}): Promise<Paged<LeadRow>> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, query.pageSize ?? 15));

  const AND: Prisma.LeadWhereInput[] = [ownerFilter(user)];
  if (query.search?.trim()) {
    const term = query.search.trim();
    AND.push({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { company: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
      ],
    });
  }
  if (query.status && ["NEW", "WORKING", "QUALIFIED", "UNQUALIFIED"].includes(query.status)) {
    AND.push({ status: query.status as LeadStatus });
  }
  const where: Prisma.LeadWhereInput = { AND };

  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { owner: { select: { name: true } } },
    }),
    db.lead.count({ where }),
  ]);

  return {
    rows: leads.map((l) => ({
      id: l.id,
      name: l.name,
      email: l.email,
      phone: l.phone,
      company: l.company,
      source: l.source,
      status: l.status,
      score: l.score,
      scoreReason: l.scoreReason,
      scoredAt: l.scoredAt,
      ownerId: l.ownerId,
      ownerName: l.owner.name,
      createdAt: l.createdAt,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/* ── Tasks ───────────────────────────────────────────────────────────────── */

/**
 * scope "mine": only tasks assigned to the current user (any role).
 * scope "all": every task in the workspace — ADMIN only (SALES falls back to "mine").
 */
export async function getTasksForUser(user: ScopedUser, scope: "mine" | "all" = "mine"): Promise<TaskRow[]> {
  const tasks = await db.task.findMany({
    where: scope === "all" && user.role === "ADMIN" ? {} : { assigneeId: user.id },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: {
      contact: { select: { name: true } },
      deal: { select: { title: true } },
      assignee: { select: { name: true } },
    },
  });
  return tasks.map(mapTask);
}

/* ── Reference lists (form selects) ──────────────────────────────────────── */

export async function getUsersList() {
  return db.user.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
}

export async function getStagesList() {
  return db.stage.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true, order: true, probability: true, isWon: true, isLost: true },
  });
}

export async function getAccountsList(user: ScopedUser) {
  return db.account.findMany({
    where: ownerFilter(user),
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Lightweight contact options for deal forms: (account → contact) pickers. */
export async function getContactsForSelect(user: ScopedUser) {
  return db.contact.findMany({
    where: ownerFilter(user),
    select: { id: true, name: true, accountId: true },
    orderBy: { name: "asc" },
  });
}

/* ── Accounts ────────────────────────────────────────────────────────────── */

export interface AccountRow {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  ownerId: string;
  ownerName: string;
  contactCount: number;
  dealCount: number;
  openValue: number;
}

export interface AccountsQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function getAccountsPage(user: ScopedUser, query: AccountsQuery = {}): Promise<Paged<AccountRow>> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, query.pageSize ?? 10));

  const AND: Prisma.AccountWhereInput[] = [ownerFilter(user)];
  if (query.search?.trim()) {
    const term = query.search.trim();
    AND.push({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { industry: { contains: term, mode: "insensitive" } },
      ],
    });
  }
  const where: Prisma.AccountWhereInput = { AND };

  const [rows, total] = await Promise.all([
    db.account.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        owner: { select: { name: true } },
        _count: { select: { contacts: true, deals: true } },
      },
    }),
    db.account.count({ where }),
  ]);

  // Open (non-won/lost) deal value per account, computed in one aggregate.
  const accountIds = rows.map((r) => r.id);
  const valueGroups = accountIds.length
    ? await db.deal.groupBy({
        by: ["accountId"],
        where: { accountId: { in: accountIds }, stage: { isWon: false, isLost: false } },
        _sum: { value: true },
      })
    : [];
  const openValueByAccount = new Map(
    valueGroups.map((g) => [g.accountId, Number(g._sum.value ?? 0)])
  );

  return {
    rows: rows.map((a) => ({
      id: a.id,
      name: a.name,
      industry: a.industry,
      website: a.website,
      phone: a.phone,
      ownerId: a.ownerId,
      ownerName: a.owner.name,
      contactCount: a._count.contacts,
      dealCount: a._count.deals,
      openValue: openValueByAccount.get(a.id) ?? 0,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export interface AccountDetail {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  ownerName: string;
  contacts: { id: string; name: string; email: string | null; status: ContactStatus }[];
  deals: { id: string; title: string; value: number; stageName: string; isWon: boolean; isLost: boolean }[];
}

export async function getAccountDetail(user: ScopedUser, id: string): Promise<AccountDetail | null> {
  const account = await db.account.findFirst({
    where: { id, ...ownerFilter(user) },
    include: {
      owner: { select: { name: true } },
      contacts: { orderBy: { name: "asc" }, select: { id: true, name: true, email: true, status: true } },
      deals: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          value: true,
          stage: { select: { name: true, isWon: true, isLost: true } },
        },
      },
    },
  });
  if (!account) return null;

  return {
    id: account.id,
    name: account.name,
    industry: account.industry,
    website: account.website,
    phone: account.phone,
    ownerName: account.owner.name,
    contacts: account.contacts,
    deals: account.deals.map((d) => ({
      id: d.id,
      title: d.title,
      value: Number(d.value),
      stageName: d.stage.name,
      isWon: d.stage.isWon,
      isLost: d.stage.isLost,
    })),
  };
}

/* ── Admin ───────────────────────────────────────────────────────────────── */

/** Per-model AI usage over the rolling 24h budget window (admin read-only
 *  view). Rows are aggregated in JS - a day of AiUsage rows is small, and the
 *  error-class / feature breakdowns need more than Prisma groupBy exposes. */
export interface AiUsageModelSummary {
  /** null when the row predates model attribution - shown as "(unattributed)". */
  model: string | null;
  calls: number;
  okCalls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  features: { feature: string; calls: number; totalTokens: number }[];
  errors: { errorClass: string; count: number }[];
}

export interface AiUsageSummary {
  windowStart: Date;
  models: AiUsageModelSummary[];
  totalCalls: number;
  totalTokens: number;
}

export async function getAiUsageSummary(now = new Date()): Promise<AiUsageSummary> {
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await db.aiUsage.findMany({
    where: { createdAt: { gt: windowStart } },
    select: {
      model: true,
      feature: true,
      ok: true,
      error: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
    },
  });

  const byModel = new Map<string, AiUsageModelSummary>();
  for (const row of rows) {
    const key = row.model ?? "(unattributed)";
    let summary = byModel.get(key);
    if (!summary) {
      summary = {
        model: row.model,
        calls: 0,
        okCalls: 0,
        failedCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        features: [],
        errors: [],
      };
      byModel.set(key, summary);
    }
    summary.calls += 1;
    if (row.ok) summary.okCalls += 1;
    else summary.failedCalls += 1;
    summary.inputTokens += row.inputTokens;
    summary.outputTokens += row.outputTokens;
    summary.totalTokens += row.totalTokens;

    const feature = summary.features.find((f) => f.feature === row.feature);
    if (feature) {
      feature.calls += 1;
      feature.totalTokens += row.totalTokens;
    } else {
      summary.features.push({ feature: row.feature, calls: 1, totalTokens: row.totalTokens });
    }

    if (!row.ok && row.error) {
      const error = summary.errors.find((e) => e.errorClass === row.error);
      if (error) error.count += 1;
      else summary.errors.push({ errorClass: row.error, count: 1 });
    }
  }

  const models = [...byModel.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  for (const summary of models) {
    summary.features.sort((a, b) => b.totalTokens - a.totalTokens);
    summary.errors.sort((a, b) => b.count - a.count);
  }

  return {
    windowStart,
    models,
    totalCalls: rows.length,
    totalTokens: rows.reduce((sum, r) => sum + r.totalTokens, 0),
  };
}

export interface AuditLogQuery {  entity?: string;
  action?: string;
  userId?: string;
  /** Inclusive lower bound, YYYY-MM-DD */
  from?: string;
  /** Inclusive upper bound, YYYY-MM-DD */
  to?: string;
}

export async function getAuditLogs(page = 1, pageSize = 20, query: AuditLogQuery = {}) {
  const safePage = Math.max(1, page);

  const where: Prisma.AuditLogWhereInput = {};
  if (query.entity) where.entity = query.entity;
  if (query.action && ["CREATE", "UPDATE", "DELETE"].includes(query.action)) {
    where.action = query.action as "CREATE" | "UPDATE" | "DELETE";
  }
  if (query.userId) where.userId = query.userId;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from)) {
      where.createdAt.gte = new Date(`${query.from}T00:00:00`);
    }
    if (query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
      where.createdAt.lte = new Date(`${query.to}T23:59:59.999`);
    }
  }

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { name: true, role: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      entity: r.entity,
      entityId: r.entityId,
      action: r.action,
      userName: r.user.name,
      userRole: r.user.role,
      changes: r.changes,
      createdAt: r.createdAt,
    })),
    total,
    page: safePage,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/* ── Mappers ─────────────────────────────────────────────────────────────── */

type ActivityWithRelations = {
  id: string;
  type: ActivityType;
  subject: string;
  body: string | null;
  summary: string | null;
  sentiment: string | null;
  nextStep: string | null;
  suggestedTask: string | null;
  aiGenerated: boolean;
  occurredAt: Date;
  contactId: string;
  user: { name: string };
  deal: { title: string } | null;
  dealId: string | null;
};

function mapActivity(a: ActivityWithRelations): ActivityRow {
  return {
    id: a.id,
    type: a.type,
    subject: a.subject,
    body: a.body,
    summary: a.summary,
    sentiment: a.sentiment,
    nextStep: a.nextStep,
    suggestedTask: a.suggestedTask,
    aiGenerated: a.aiGenerated,
    occurredAt: a.occurredAt,
    userName: a.user.name,
    dealTitle: a.deal?.title ?? null,
    dealId: a.dealId,
    contactId: a.contactId,
  };
}

type TaskWithRelations = {
  id: string;
  title: string;
  dueDate: Date;
  status: TaskStatus;
  contactId: string | null;
  contact: { name: string } | null;
  dealId: string | null;
  deal: { title: string } | null;
  assigneeId: string;
  assignee: { name: string };
};

function mapTask(t: TaskWithRelations): TaskRow {
  return {
    id: t.id,
    title: t.title,
    dueDate: t.dueDate,
    status: t.status,
    overdue: t.status === "OPEN" && t.dueDate.getTime() < Date.now(),
    contactId: t.contactId,
    contactName: t.contact?.name ?? null,
    dealId: t.dealId,
    dealTitle: t.deal?.title ?? null,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee.name,
  };
}
