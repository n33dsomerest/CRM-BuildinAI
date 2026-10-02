/*
 * Seed script — populates the CRM with realistic demo data.
 * Run with: npm run db:seed
 */
import { PrismaClient, Role, ContactStatus, LeadStatus, LeadSource, ActivityType, TaskStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const daysFromNow = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
};

const STAGES = [
  { name: "New Lead", order: 1, probability: 10, isWon: false, isLost: false },
  { name: "Contact Made", order: 2, probability: 25, isWon: false, isLost: false },
  { name: "Proposal", order: 3, probability: 50, isWon: false, isLost: false },
  { name: "Negotiation", order: 4, probability: 75, isWon: false, isLost: false },
  { name: "Won", order: 5, probability: 100, isWon: true, isLost: false },
  { name: "Lost", order: 6, probability: 0, isWon: false, isLost: true },
];

const USERS = [
  { email: "admin@crm.dev", name: "Alex Morgan", role: Role.ADMIN, password: "admin123" },
  { email: "sarah@crm.dev", name: "Sarah Chen", role: Role.SALES, password: "sales123" },
  { email: "david@crm.dev", name: "David Lee", role: Role.SALES, password: "sales123" },
];

const ACCOUNTS: { name: string; industry: string; website: string; phone: string; contacts: { name: string; position: string }[] }[] = [
  {
    name: "Northwind Traders", industry: "Manufacturing", website: "northwindtraders.com", phone: "+1 555-0110",
    contacts: [
      { name: "Paula Wilson", position: "Procurement Director" },
      { name: "Tom Michaels", position: "Operations Manager" },
      { name: "Nina Alvarez", position: "CFO" },
    ],
  },
  {
    name: "Acme Corp", industry: "Technology", website: "acmecorp.com", phone: "+1 555-0120",
    contacts: [
      { name: "John Franklin", position: "VP Engineering" },
      { name: "Emily Zhao", position: "IT Manager" },
      { name: "Raj Patel", position: "Head of Infrastructure" },
    ],
  },
  {
    name: "Globex Corporation", industry: "Finance", website: "globex.com", phone: "+1 555-0130",
    contacts: [
      { name: "Maria Hernandez", position: "COO" },
      { name: "Chen Wei", position: "Risk Analyst" },
    ],
  },
  {
    name: "Initech", industry: "Software", website: "initech.io", phone: "+1 555-0140",
    contacts: [
      { name: "Peter Gibbons", position: "Engineering Lead" },
      { name: "Michael Bolton", position: "Developer" },
      { name: "Samir Nagheenanajar", position: "QA Manager" },
    ],
  },
  {
    name: "Umbrella Health", industry: "Healthcare", website: "umbrellahealth.com", phone: "+1 555-0150",
    contacts: [
      { name: "Alice Birch", position: "Clinic Director" },
      { name: "Marcus Reid", position: "Facilities Manager" },
    ],
  },
  {
    name: "Stark Industries", industry: "Aerospace", website: "starkindustries.com", phone: "+1 555-0160",
    contacts: [
      { name: "Virginia Potts", position: "CEO" },
      { name: "Happy Hogan", position: "Head of Security" },
    ],
  },
  {
    name: "Wayne Logistics", industry: "Logistics", website: "waynelogistics.com", phone: "+1 555-0170",
    contacts: [
      { name: "Bruce Wayne", position: "Managing Director" },
      { name: "Lucius Fox", position: "VP Operations" },
    ],
  },
  {
    name: "Hooli Cloud", industry: "Technology", website: "hooli.xyz", phone: "+1 555-0180",
    contacts: [
      { name: "Gavin Belson", position: "CTO" },
      { name: "Jared Dunn", position: "Business Manager" },
      { name: "Monica Hall", position: "Head of Partnerships" },
    ],
  },
];

const LEADS: { name: string; company: string; email: string; phone: string; source: LeadSource; status: LeadStatus }[] = [
  { name: "Olivia Grant", company: "Frostline Foods", email: "olivia@frostline.com", phone: "+1 555-0201", source: LeadSource.WEB, status: LeadStatus.NEW },
  { name: "Ethan Cole", company: "Meridian Retail", email: "ethan@meridian.co", phone: "+1 555-0202", source: LeadSource.REFERRAL, status: LeadStatus.NEW },
  { name: "Sofia Rossi", company: "Bellagio Hotels", email: "sofia@bellagio.it", phone: "+1 555-0203", source: LeadSource.EVENT, status: LeadStatus.WORKING },
  { name: "Liam O'Connor", company: "Celtic Freight", email: "liam@celticfreight.ie", phone: "+1 555-0204", source: LeadSource.COLD_CALL, status: LeadStatus.WORKING },
  { name: "Ava Thompson", company: "Brightline Media", email: "ava@brightline.tv", phone: "+1 555-0205", source: LeadSource.WEB, status: LeadStatus.QUALIFIED },
  { name: "Noah Kim", company: "K-Tech Solutions", email: "noah@ktech.kr", phone: "+1 555-0206", source: LeadSource.EVENT, status: LeadStatus.NEW },
  { name: "Isabella Moreau", company: "Maison Verte", email: "isabella@maisonverte.fr", phone: "+1 555-0207", source: LeadSource.REFERRAL, status: LeadStatus.WORKING },
  { name: "Daniel Cruz", company: "Sunbelt Energy", email: "daniel@sunbelt.energy", phone: "+1 555-0208", source: LeadSource.WEB, status: LeadStatus.UNQUALIFIED },
  { name: "Mia Novak", company: "Prague Dynamics", email: "mia@praguedyn.cz", phone: "+1 555-0209", source: LeadSource.COLD_CALL, status: LeadStatus.NEW },
  { name: "Oscar Lindqvist", company: "Nordic Steel", email: "oscar@nordicsteel.se", phone: "+1 555-0210", source: LeadSource.EVENT, status: LeadStatus.QUALIFIED },
];

type DealSeed = { title: string; value: string; stage: string; accountIndex: number; contactIndex: number; owner: 0 | 1 | 2; closeInDays: number | null };

const DEALS: DealSeed[] = [
  { title: "Q4 Fleet Tracking Rollout", value: "85000", stage: "Negotiation", accountIndex: 6, contactIndex: 1, owner: 1, closeInDays: 12 },
  { title: "Cloud Migration Phase 1", value: "120000", stage: "Proposal", accountIndex: 1, contactIndex: 2, owner: 1, closeInDays: 30 },
  { title: "Annual Support Contract", value: "45000", stage: "Contact Made", accountIndex: 0, contactIndex: 1, owner: 2, closeInDays: 45 },
  { title: "CRM Integration Suite", value: "64000", stage: "New Lead", accountIndex: 7, contactIndex: 2, owner: 2, closeInDays: 60 },
  { title: "Warehouse Automation Pilot", value: "98000", stage: "Proposal", accountIndex: 0, contactIndex: 0, owner: 1, closeInDays: 21 },
  { title: "Security Audit 2026", value: "32000", stage: "Negotiation", accountIndex: 3, contactIndex: 2, owner: 2, closeInDays: 9 },
  { title: "Data Platform License", value: "150000", stage: "Contact Made", accountIndex: 2, contactIndex: 0, owner: 0, closeInDays: 55 },
  { title: "Clinic Management System", value: "71000", stage: "Proposal", accountIndex: 4, contactIndex: 0, owner: 1, closeInDays: 26 },
  { title: "Partner Portal Renewal", value: "28000", stage: "Won", accountIndex: 7, contactIndex: 1, owner: 2, closeInDays: -5 },
  { title: "Manufacturing Analytics", value: "110000", stage: "Contact Made", accountIndex: 0, contactIndex: 2, owner: 1, closeInDays: 40 },
  { title: "Compliance Toolkit", value: "39000", stage: "New Lead", accountIndex: 2, contactIndex: 1, owner: 2, closeInDays: 70 },
  { title: "Infrastructure Modernization", value: "175000", stage: "Negotiation", accountIndex: 5, contactIndex: 0, owner: 0, closeInDays: 15 },
  { title: "Onboarding Services", value: "18500", stage: "Won", accountIndex: 3, contactIndex: 0, owner: 1, closeInDays: -12 },
  { title: "Logistics API Access", value: "52000", stage: "Proposal", accountIndex: 6, contactIndex: 0, owner: 2, closeInDays: 33 },
  { title: "Employee Training Program", value: "24000", stage: "Contact Made", accountIndex: 4, contactIndex: 1, owner: 1, closeInDays: 50 },
  { title: "Disaster Recovery Setup", value: "67000", stage: "New Lead", accountIndex: 1, contactIndex: 0, owner: 2, closeInDays: 65 },
  { title: "Premium Support Upgrade", value: "21000", stage: "Won", accountIndex: 5, contactIndex: 1, owner: 0, closeInDays: -20 },
  { title: "Supply Chain Dashboard", value: "88000", stage: "Lost", accountIndex: 6, contactIndex: 0, owner: 1, closeInDays: -8 },
  { title: "Enterprise SSO Package", value: "43000", stage: "Negotiation", accountIndex: 7, contactIndex: 0, owner: 2, closeInDays: 7 },
  { title: "Field Service Mobile App", value: "96000", stage: "Contact Made", accountIndex: 4, contactIndex: 1, owner: 1, closeInDays: 58 },
  { title: "Vendor Risk Assessment", value: "27500", stage: "Proposal", accountIndex: 2, contactIndex: 1, owner: 0, closeInDays: 18 },
  { title: "DevOps Toolchain Deal", value: "58000", stage: "Lost", accountIndex: 3, contactIndex: 1, owner: 2, closeInDays: -15 },
  { title: "Global Rollout Consulting", value: "220000", stage: "New Lead", accountIndex: 5, contactIndex: 0, owner: 0, closeInDays: 90 },
  { title: "Billing System Integration", value: "74000", stage: "Contact Made", accountIndex: 2, contactIndex: 0, owner: 1, closeInDays: 48 },
  { title: "Holiday Campaign Landing", value: "16000", stage: "Won", accountIndex: 1, contactIndex: 1, owner: 2, closeInDays: -3 },
  { title: "Fleet Analytics Add-on", value: "34500", stage: "Proposal", accountIndex: 6, contactIndex: 1, owner: 1, closeInDays: 24 },
  { title: "Legacy Migration Assessment", value: "29900", stage: "New Lead", accountIndex: 3, contactIndex: 2, owner: 0, closeInDays: 75 },
  { title: "Partnership Revenue Share", value: "105000", stage: "Negotiation", accountIndex: 7, contactIndex: 2, owner: 2, closeInDays: 10 },
  { title: "Health Data Warehouse", value: "132000", stage: "Contact Made", accountIndex: 4, contactIndex: 0, owner: 1, closeInDays: 52 },
  { title: "Multi-year License Bundle", value: "260000", stage: "Proposal", accountIndex: 0, contactIndex: 0, owner: 0, closeInDays: 36 },
];

async function main() {
  console.log("Seeding database…");

  // Wipe in FK-safe order
  await prisma.auditLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.account.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.user.deleteMany();

  // Users
  const users = [] as { id: string }[];
  for (const u of USERS) {
    users.push(
      await prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          role: u.role,
          passwordHash: bcrypt.hashSync(u.password, 10),
        },
        select: { id: true },
      })
    );
  }
  const [admin, sarah, david] = users;

  // Stages
  const stageIds: Record<string, string> = {};
  for (const s of STAGES) {
    const stage = await prisma.stage.create({ data: s, select: { id: true, name: true } });
    stageIds[stage.name] = stage.id;
  }

  // Accounts + contacts (owners rotate between sales reps)
  const accountIds: string[] = [];
  const contactIds: string[] = [];
  const contactOwners: string[] = [];
  for (let a = 0; a < ACCOUNTS.length; a++) {
    const acc = ACCOUNTS[a];
    const domain = acc.website;
    const account = await prisma.account.create({
      data: {
        name: acc.name,
        industry: acc.industry,
        website: `https://${domain}`,
        phone: acc.phone,
        ownerId: a % 3 === 0 ? admin.id : a % 2 === 0 ? sarah.id : david.id,
      },
      select: { id: true },
    });
    accountIds.push(account.id);

    for (let c = 0; c < acc.contacts.length; c++) {
      const person = acc.contacts[c];
      const owner = c % 2 === 0 ? (a % 2 === 0 ? sarah : david) : admin;
      const contact = await prisma.contact.create({
        data: {
          name: person.name,
          email: `${person.name.toLowerCase().replace(/[^a-z]+/g, ".")}@${domain}`,
          phone: `+1 555-${String(1100 + contactIds.length).padStart(4, "0")}`,
          position: person.position,
          status: c === 0 && a % 3 !== 2 ? ContactStatus.CUSTOMER : ContactStatus.PROSPECT,
          accountId: account.id,
          ownerId: owner.id,
        },
        select: { id: true },
      });
      contactIds.push(contact.id);
      contactOwners.push(owner.id);
    }
  }

  // Leads
  for (let i = 0; i < LEADS.length; i++) {
    const l = LEADS[i];
    const owner = i % 3 === 0 ? admin.id : i % 3 === 1 ? sarah.id : david.id;
    await prisma.lead.create({ data: { ...l, ownerId: owner } });
  }

  // Deals
  const dealIds: string[] = [];
  for (const d of DEALS) {
    const deal = await prisma.deal.create({
      data: {
        title: d.title,
        value: d.value,
        stageId: stageIds[d.stage],
        accountId: accountIds[d.accountIndex],
        contactId: contactIds[d.accountIndex * 3 + d.contactIndex],
        ownerId: [admin, sarah, david][d.owner].id,
        expectedCloseDate: d.closeInDays === null ? null : daysFromNow(d.closeInDays),
      },
      select: { id: true },
    });
    dealIds.push(deal.id);
  }

  // Activities — a timeline for the first several contacts
  const activityTemplates: { type: ActivityType; subject: string; body: string }[] = [
    { type: ActivityType.CALL, subject: "Intro call", body: "Discussed current tooling and pain points. Very interested in a pilot." },
    { type: ActivityType.EMAIL, subject: "Sent pricing overview", body: "Shared the standard pricing sheet and case studies." },
    { type: ActivityType.MEETING, subject: "Discovery workshop", body: "60-minute session with the ops team. Mapped the approval workflow." },
    { type: ActivityType.NOTE, subject: "Internal note", body: "Champion is on board; CFO wants ROI numbers before Proposal stage." },
    { type: ActivityType.CALL, subject: "Follow-up call", body: "Confirmed budget cycle ends this quarter. Send proposal by Friday." },
  ];

  for (let i = 0; i < 14; i++) {
    const template = activityTemplates[i % activityTemplates.length];
    await prisma.activity.create({
      data: {
        type: template.type,
        subject: template.subject,
        body: template.body,
        contactId: contactIds[i],
        dealId: i < dealIds.length ? dealIds[i] : null,
        userId: contactOwners[i],
        occurredAt: daysFromNow(-(i * 3 + 2)),
      },
    });
  }

  // Tasks — mix of overdue, due-soon and done
  const taskSeeds: { title: string; dueInDays: number; status: TaskStatus; assignee: string; contactIndex?: number; dealIndex?: number }[] = [
    { title: "Send proposal to Acme Corp", dueInDays: -2, status: TaskStatus.OPEN, assignee: sarah.id, contactIndex: 3, dealIndex: 1 },
    { title: "Follow up on Globex security review", dueInDays: -1, status: TaskStatus.OPEN, assignee: david.id, contactIndex: 8 },
    { title: "Prepare ROI deck for Northwind", dueInDays: 0, status: TaskStatus.OPEN, assignee: sarah.id, contactIndex: 0, dealIndex: 4 },
    { title: "Book demo with Stark Industries", dueInDays: 1, status: TaskStatus.OPEN, assignee: admin.id, contactIndex: 15 },
    { title: "Renewal paperwork for Hooli", dueInDays: 3, status: TaskStatus.OPEN, assignee: david.id, dealIndex: 8 },
    { title: "Call Initech about lost deal feedback", dueInDays: 5, status: TaskStatus.OPEN, assignee: david.id, contactIndex: 10 },
    { title: "Update forecast for Q4", dueInDays: 7, status: TaskStatus.OPEN, assignee: admin.id },
    { title: "Send onboarding checklist to Initech", dueInDays: -13, status: TaskStatus.DONE, assignee: sarah.id, dealIndex: 12 },
    { title: "Intro email to Wayne Logistics", dueInDays: -20, status: TaskStatus.DONE, assignee: sarah.id, contactIndex: 18 },
    { title: "Contract signature collected", dueInDays: -4, status: TaskStatus.DONE, assignee: admin.id, dealIndex: 16 },
  ];

  for (const t of taskSeeds) {
    await prisma.task.create({
      data: {
        title: t.title,
        dueDate: daysFromNow(t.dueInDays),
        status: t.status,
        contactId: t.contactIndex !== undefined ? contactIds[t.contactIndex] : null,
        dealId: t.dealIndex !== undefined ? dealIds[t.dealIndex] : null,
        assigneeId: t.assignee,
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    stages: await prisma.stage.count(),
    accounts: await prisma.account.count(),
    contacts: await prisma.contact.count(),
    leads: await prisma.lead.count(),
    deals: await prisma.deal.count(),
    activities: await prisma.activity.count(),
    tasks: await prisma.task.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
