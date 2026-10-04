# Enterprise CRM — Full-Stack Sales Hub

A production-ready, full-stack **Customer Relationship Management** app built to run on **Vercel + Neon** (GitHub version-controlled).

**Stack:** Next.js 16 (App Router, TypeScript) · Tailwind CSS v4 · shadcn/ui + Lucide icons · PostgreSQL (Neon/Supabase compatible) with Prisma ORM · Server Actions + React Hook Form + Zod · Auth.js v5 (email/password, roles)

## Features

| Module | What you get |
| --- | --- |
| **Dashboard** | Pipeline value, probability-weighted forecast, total contacts, won deals, conversion rate, funnel by stage, my tasks, recent activity |
| **Leads** | Raw prospect capture, status qualification, search/filter, **one-click Convert** → creates Account + Contact + first-stage Deal in a single transaction |
| **Accounts** | Dedicated company pages with contacts/deal lists, open-value rollup, full CRUD with cascade-delete warnings |
| **Accounts & Contacts** | Accounts (companies) separated from contacts (people), lifecycle status (Lead/Prospect/Customer), search / status filter / pagination, **CSV import** (dedupes by account+email, auto-creates missing accounts) and **CSV export**, 360° contact page (info, deals, tasks, activity timeline) |
| **Deals** | Interactive drag & drop **Kanban** (6 seeded stages), per-column deal count, total value and weighted value, Won/Lost columns highlighted |
| **Activities** | Notes, calls, meetings, emails linked to contacts and deals with a timeline view |
| **Tasks** | Follow-ups with due dates, overdue highlighting, mark done / reopen |
| **Security** | Email+password auth (bcrypt), JWT sessions, roles (`ADMIN`, `SALES`), **row-level ownership** — sales reps only see and edit their own records, admins see everything |
| **Audit trail** | Every create/update/delete recorded with actor and field-level changes; admin-only audit log viewer with pagination |
| **Admin** | User management, audit log |
| **UX** | Dark mode, ⌘K command palette, responsive sidebar, empty states, toasts |

## Quick start (local)

```bash
# 1. Install dependencies (postinstall runs `prisma generate`)
npm install

# 2. Configure environment
cp .env.example .env
#    → point DATABASE_URL / DIRECT_URL at any Postgres (local, Neon, Supabase…)

# 3. Create schema + demo data
npx prisma migrate dev --name init
npm run db:seed

# 4. Run
npm run dev        # http://localhost:3000
```

**Demo accounts** (from seed): `admin@crm.dev / Admin!2345` · `sarah@crm.dev / Sales!2345` · `david@crm.dev / Sales!2345`

## AI features (OpenRouter)

Set two variables in `.env` (and in Vercel's environment settings) - never commit them:

| Key | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Your key from https://openrouter.ai/keys |
| `AI_MODEL` | Strong model for user-visible drafting (default `anthropic/claude-sonnet-4.5`) |
| `AI_MODEL_CHEAP` | Cheap model for summarization/scoring (default `google/gemini-2.5-flash`) |

Then run `npm run ai:check` - it validates the key and confirms both models are reachable.

**Quota:** every user gets 20 AI requests per rolling 24 hours, counted per request (failures
and retries included). Cache hits are free. Token usage is recorded for cost visibility only.
The app never auto-writes to the CRM with AI: the summarizer and email drafts produce editable
drafts, and scoring is a suggestion with reasons - a human confirms everything.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (typecheck + lint clean) |
| `npm test` | Vitest unit tests (validation, scoping, audit diff) |
| `npm run test:integration` | Integration tests against a separate test database (row-level security, IDOR, CSV import) |
| `npm run ai:check` | Validate the OpenRouter key and configured models |
| `npm run check:secrets` | Fail if a credential-like literal is committed |
| `npm run db:migrate` | Create/apply migrations in development |
| `npm run db:deploy` | Apply migrations in production (`prisma migrate deploy`) |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Prisma Studio |

## Project structure

```
prisma/
  schema.prisma        # Users, Accounts, Contacts, Leads, Stages, Deals,
                       # Activities, Tasks, AuditLog (indexes + FKs)
  seed.ts              # Demo data (3 users, 6 stages, 8 accounts, 20 contacts, 10 leads, 30 deals)
src/
  app/
    (app)/             # Authenticated shell
      page.tsx         #   Dashboard (KPIs, funnel, tasks, activity)
      leads/ contacts/ deals/ tasks/ admin/
    login/             # Public sign-in
    api/auth/          # Auth.js route handlers
  components/          # Feature components + shadcn/ui primitives
  lib/
    actions/           # Server Actions (contacts, deals, leads, tasks…)
    queries.ts         # Read layer — every query role-scoped
    scope.ts           # ownerFilter(): SALES→own records, ADMIN→all
    audit.ts           # Audit trail + field-level diff
    auth.ts            # Auth.js v5 (credentials + JWT, role in session)
    validations.ts     # Zod schemas
```

## Deploy to GitHub + Vercel (step by step)

### 1. Push to GitHub

```bash
git init                          # already done if .git exists
git add .
git commit -m "feat: enterprise CRM"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### 2. Create the database (Neon)

1. Sign up at [neon.tech](https://neon.tech) → create a project.
2. Copy **two** connection strings from the dashboard:
   - **Pooled** (host contains `-pooler`) → this is `DATABASE_URL` (serverless-friendly).
   - **Direct** (no `-pooler`) → this is `DIRECT_URL` (used by migrations).

### 3. Import to Vercel

1. [vercel.com/new](https://vercel.com/new) → import the GitHub repo.
2. Framework preset: **Next.js** (auto-detected). No build overrides needed —
   `package.json` already runs `prisma generate` via `postinstall`.
3. Add Environment Variables (Production + Preview):

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon **pooled** string, e.g. `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require` |
   | `DIRECT_URL` | Neon **direct** string |
   | `AUTH_SECRET` | `openssl rand -base64 32` |

4. Deploy.

### 4. Integration tests (optional)

   Create a second database in your Neon project (e.g. `crm_test`), apply the schema
   (`npx prisma migrate deploy` with its DIRECT_URL), then run `npm run test:integration`.

5. Run migrations + seed in production

From your machine (pointing at the production DB):

```bash
# one-time: schema + demo data
DATABASE_URL="<direct-url>" DIRECT_URL="<direct-url>" npx prisma migrate deploy
DATABASE_URL="<direct-url>" DIRECT_URL="<direct-url>" npm run db:seed
```

> `prisma migrate deploy` and seeding use `DIRECT_URL` (no pooler), while the
> deployed app talks through the pooled `DATABASE_URL`.

### 5. Verify

- Open the Vercel URL → sign in with `admin@crm.dev / Admin!2345`.
- Check the Dashboard KPIs, drag a deal on the Kanban, convert a lead.
- Sign in as `sarah@crm.dev` to confirm she only sees her own records.

## Notes

- All pages that read the database are rendered dynamically, so `next build`
  succeeds even without a reachable database (useful for CI).
- Stages are data (not enums) so the pipeline stays configurable through the seed.
- Deleting an account cascades its contacts and their deals (see `schema.prisma`).
- Audit entries survive record deletion (`AuditLog.changes` snapshots the data).
