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
    conversionRate: number;
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
  occurredAt: Date;
  userName: string;
  dealTitle: string | null;
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

/* ── Dashboard ───────────────────────────────────────────────────────────── */

export async function getDashboardData(user: ScopedUser): Promise<DashboardData> {
  const stages = await db.stage.findMany({
    orderBy: { order: "asc" },
    include: {
      deals: {
        where: ownerFilter(user),
        select: {
          id: true,
          title: true,
          value: true,
          stageId: true,
          expectedCloseDate: true,
          contactId: true,
          contact: { select: { name: true, account: { select: { name: true } } } },
          owner: { select: { id: true, name: true } },
        },
      },
    },
  });

  const funnel: FunnelColumn[] = stages.map((stage) => {
    const deals: DealCard[] = stage.deals.map((d) => ({
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
    }));
    const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
    return {
      id: stage.id,
      name: stage.name,
      order: stage.order,
      probability: stage.probability,
      isWon: stage.isWon,
      isLost: stage.isLost,
      deals,
      totalValue,
      weightedValue: Math.round((totalValue * stage.probability) / 100),
    };
  });

  const openStages = funnel.filter((s) => !s.isWon && !s.isLost);
  const wonStage = funnel.find((s) => s.isWon);
  const totalDeals = funnel.reduce((sum, s) => sum + s.deals.length, 0);

  const [totalContacts, recentActivities, myTasks] = await Promise.all([
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

  return {
    kpis: {
      pipelineValue: openStages.reduce((sum, s) => sum + s.totalValue, 0),
      weightedForecast: openStages.reduce((sum, s) => sum + s.weightedValue, 0),
      totalContacts,
      wonDeals: wonStage?.deals.length ?? 0,
      wonValue: wonStage?.totalValue ?? 0,
      conversionRate: totalDeals === 0 ? 0 : Math.round(((wonStage?.deals.length ?? 0) / totalDeals) * 100),
    },
    funnel,
    recentActivities: recentActivities.map(mapActivity),
    myTasks: myTasks.map(mapTask),
  };
}

/* ── Deals board ─────────────────────────────────────────────────────────── */

export async function getDealsBoard(user: ScopedUser): Promise<FunnelColumn[]> {
  const stages = await db.stage.findMany({
    orderBy: { order: "asc" },
    include: {
      deals: {
        where: ownerFilter(user),
        select: {
          id: true,
          title: true,
          value: true,
          stageId: true,
          expectedCloseDate: true,
          contactId: true,
          contact: { select: { name: true, account: { select: { name: true } } } },
          owner: { select: { id: true, name: true } },
        },
      },
    },
  });

  return stages.map((stage) => {
    const deals: DealCard[] = stage.deals.map((d) => ({
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
    }));
    const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
    return {
      id: stage.id,
      name: stage.name,
      order: stage.order,
      probability: stage.probability,
      isWon: stage.isWon,
      isLost: stage.isLost,
      deals,
      totalValue,
      weightedValue: Math.round((totalValue * stage.probability) / 100),
    };
  });
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
  const contact = await db.contact.findFirst({
    where: { id, ...ownerFilter(user) },
    include: {
      account: true,
      owner: { select: { name: true } },
      deals: {
        orderBy: { createdAt: "desc" },
        include: { stage: { select: { name: true, isWon: true, isLost: true } } },
      },
      activities: {
        orderBy: { occurredAt: "desc" },
        take: 50,
        include: { user: { select: { name: true } }, deal: { select: { title: true } } },
      },
      tasks: {
        orderBy: { dueDate: "asc" },
        include: {
          contact: { select: { name: true } },
          deal: { select: { title: true } },
          assignee: { select: { name: true } },
        },
      },
    },
  });
  if (!contact) return null;

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
    deals: contact.deals.map((d) => ({
      id: d.id,
      title: d.title,
      value: Number(d.value),
      stageName: d.stage.name,
      isWon: d.stage.isWon,
      isLost: d.stage.isLost,
      expectedCloseDate: d.expectedCloseDate,
    })),
    activities: contact.activities.map(mapActivity),
    tasks: contact.tasks.map(mapTask),
  };
}

/* ── Leads ───────────────────────────────────────────────────────────────── */

export async function getLeads(user: ScopedUser, query: { search?: string; status?: string } = {}): Promise<LeadRow[]> {
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

  const leads = await db.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { name: true } } },
  });

  return leads.map((l) => ({
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    company: l.company,
    source: l.source,
    status: l.status,
    ownerId: l.ownerId,
    ownerName: l.owner.name,
    createdAt: l.createdAt,
  }));
}

/* ── Tasks ───────────────────────────────────────────────────────────────── */

export async function getMyTasks(user: ScopedUser): Promise<TaskRow[]> {
  const tasks = await db.task.findMany({
    where: user.role === "ADMIN" ? {} : { assigneeId: user.id },
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

/* ── Admin ───────────────────────────────────────────────────────────────── */

export interface AuditLogQuery {
  entity?: string;
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
  occurredAt: Date;
  contactId: string;
  user: { name: string };
  deal: { title: string } | null;
};

function mapActivity(a: ActivityWithRelations): ActivityRow {
  return {
    id: a.id,
    type: a.type,
    subject: a.subject,
    body: a.body,
    occurredAt: a.occurredAt,
    userName: a.user.name,
    dealTitle: a.deal?.title ?? null,
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
