# GATE AI — GATE CSE 2027 Study Platform

A personal, single-user study platform for GATE CSE 2027 preparation: dashboard,
day/week/month study tracker, subject/topic tracking, an AI tutor chat (two-stage
Optimizer → Luna pipeline via Amazon Bedrock), question bank, mistake log, notes,
study timer, and analytics.

## Tech stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS** for styling (dark/light theme via CSS variables)
- **Prisma** ORM + **PostgreSQL** (designed for **Neon**)
- **bcryptjs** for password hashing, HTTP-only cookie sessions (no third-party auth library)
- **zod** for input validation on every API route
- **recharts** for analytics charts
- Deployable to **Vercel**

## Project structure

```
app/
  api/            All backend routes (auth, chat, subjects, topics, study-tasks, ...)
  login/          Public login page
  dashboard/      Main dashboard
  chat/           AI Chat (conversation sidebar + chat window)
  tracker/        Study Tracker (Day/Week/Month/List views)
  subjects/       Subjects + Topics CRUD
  questions/      Question bank
  mistakes/       Mistake log
  notes/          Notes
  analytics/      Charts and progress stats
  settings/       Account, preferences, AI status, data export
components/       Reusable UI, layout, chat and dashboard components
lib/
  auth/           Session + password hashing (server-only)
  ai/             Optimizer + Luna (Bedrock) pipeline (server-only)
  db/             Prisma client + derived stats helpers (server-only)
  validation/     zod schemas shared by all API routes
  utils/          Date/timezone and formatting helpers
prisma/
  schema.prisma   Database schema
  seed.ts         Creates the initial admin user + default GATE subjects
```

## 1. Prerequisites

- Node.js 20+ and npm
- A PostgreSQL database — [Neon](https://neon.tech) is recommended (free tier works)

## 2. Install dependencies

```bash
npm install
```

## 3. Configure environment variables

Copy the example file and fill in real values:

```bash
cp .env.example .env.local
```

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Neon connection string, e.g. `postgresql://user:pass@host.neon.tech/neondb?sslmode=require` |
| `AUTH_SECRET` | Yes | Reserved for future signed-token use. Generate with `openssl rand -base64 48`. Sessions themselves are opaque, randomly-generated, database-backed tokens (see Security notes below) — this value is not currently used to sign them, but should still be set to a strong random value. |
| `INITIAL_ADMIN_USERNAME` | No (defaults to `pushpendra`) | Used only by the seed script |
| `INITIAL_ADMIN_PASSWORD` | Yes, for seeding | The seed script **refuses to run** without this. Never hardcode it. |
| `OPTIMIZER_API_KEY` / `OPTIMIZER_API_URL` / `OPTIMIZER_MODEL` | No | Stage 1 of the AI pipeline. If unset, the app safely skips straight to Luna. |
| `LUNA_API_KEY` / `LUNA_API_URL` / `LUNA_MODEL_ID` / `AWS_REGION` | Yes, for AI Chat to work | Stage 2 (GPT-6 Luna via Amazon Bedrock). Without these, every other feature works — only the chat pipeline returns "Luna is unavailable." |
| `APP_TIMEZONE` | No (defaults to `Asia/Kolkata`) | Used for "today", streaks, and daily progress rollups |
| `TARGET_EXAM_DATE` | No (defaults to `2027-02-07`) | Drives the "Days Remaining" counter |

**Never commit `.env` or `.env.local`.** `.gitignore` already excludes them.

### Configuring Luna (Amazon Bedrock)

`lib/ai/luna.ts` calls `LUNA_API_URL` with a bearer token and an `X-Amz-Region`
header, and expects a JSON body shaped like `{ modelId, max_tokens, temperature,
system, messages }`, with the response containing either an Anthropic-style
`content[].text` array or an OpenAI-style `choices[0].message.content`. If your
actual Bedrock integration (e.g. a Lambda/API Gateway front door in front of
`bedrock-runtime:InvokeModel`) uses a different request/response shape, adjust
the request body and the `text` extraction in `lib/ai/luna.ts` to match — this
is the one integration point that depends on how you've wired up your specific
Bedrock endpoint. The same applies to `lib/ai/optimizer.ts` for your Optimizer
provider.

### Configuring the Optimizer

The Optimizer is optional by design. If `OPTIMIZER_API_KEY`/`_URL`/`_MODEL` are
unset, or the call fails for any reason, the pipeline automatically falls back
to sending the user's original message straight to Luna — chat never breaks
because the Optimizer is down or unconfigured.

## 4. Set up the database

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run seed
```

`npm run seed` creates the initial user (`INITIAL_ADMIN_USERNAME`, default
`pushpendra`) with a bcrypt-hashed password read from `INITIAL_ADMIN_PASSWORD`,
plus the default GATE CSE subject list. Running it again is safe — it skips
user creation if the username already exists.

## 5. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000` — you'll be redirected to `/login`.

## 6. Verify the build

Run these before deploying (see "What I could not run in this environment"
below for why this matters):

```bash
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run lint
npm run build
```

## Deployment

### Vercel + Neon + GitHub

1. Push this repository to GitHub (a private repo is recommended, since this
   is a personal app).
2. Create a Neon project and copy its pooled connection string into
   `DATABASE_URL`.
3. In Vercel, import the GitHub repo and add all environment variables from
   `.env.example` under Project Settings → Environment Variables (for
   Production **and** Preview if you use preview deployments).
4. Vercel will run `npm run build` automatically. Prisma Client generation is
   triggered by the `postinstall` step of `prisma` — if you see a "Prisma
   Client not generated" error on Vercel, add a `postinstall` script:
   `"postinstall": "prisma generate"` to `package.json`.
5. After the first deploy, run the seed script once against the production
   database (e.g. `DATABASE_URL=... INITIAL_ADMIN_PASSWORD=... npx tsx
   prisma/seed.ts` from your machine, or a one-off Vercel CLI/GitHub Action
   job) to create your login.
6. Set `TZ=Asia/Kolkata` as an environment variable on Vercel as well — see
   the timezone note under Security & correctness notes below.

## Security notes

- **Passwords**: hashed with bcrypt (12 salt rounds), never logged or stored
  in plaintext. The seed script requires `INITIAL_ADMIN_PASSWORD` from the
  environment and exits with an error if it's missing — it will never fall
  back to a hardcoded password.
- **Sessions**: a cryptographically random 48-byte token (`crypto.randomBytes`)
  stored in the `Session` table and set as an **HTTP-only**, `SameSite=Lax`
  cookie (`Secure` in production). The cookie itself carries no user data —
  it's just a database lookup key — so it can't be tampered with client-side.
- **Authorization**: every API route re-derives the current user from the
  session server-side and scopes every Prisma query with `userId`. Every
  "get one by id" route uses `findFirst({ where: { id, userId } })` (not
  `findUnique({ where: { id } })`), which is what prevents IDOR — a user can
  never read, edit, or delete another user's row by guessing its id, because
  a row belonging to someone else simply won't match the query and comes back
  as "not found."
- **Secrets**: all AI/DB credentials are read from `process.env` in
  server-only modules (marked with the `server-only` package, which throws a
  build error if accidentally imported into client code). Nothing is ever
  exposed to the browser bundle.
- **Middleware**: does a lightweight cookie-presence check on the Edge (it
  cannot query Postgres there) to redirect obviously-unauthenticated
  requests early; the real check (validating the token against the database
  and its expiry) happens in `getCurrentUser()`/`requireUser()` on every
  page and API route.

## MCP / ChatGPT Integration

The tracker exposes a Model Context Protocol (MCP) server at `/api/mcp`
(Streamable HTTP) so ChatGPT can read and write your tracker data directly —
dashboard, subjects, topics, questions, mistakes, notes, study tasks, study
sessions, and analytics. Authentication uses a hashed, revocable bearer
token (`npm run mcp:token -- create`), not the browser session cookie. Full
setup, security notes, and troubleshooting: see **[MCP_SETUP.md](./MCP_SETUP.md)**.

This is a separate, additive feature — it does not require an OpenAI key,
does not move anything off Vercel, and does not touch the existing Luna/
Optimizer AI chat pipeline.

## Known limitation / correctness note

`getTodayKey()`/`getTargetDate()` in `lib/utils/date.ts` correctly use
`date-fns-tz` to compute "today" in `Asia/Kolkata` regardless of server
timezone. However, a few call sites elsewhere in the app (dashboard stats,
daily-progress rollups, the study tracker) format already-stored `@db.Date`
values with plain `date-fns format()`, which uses the **server process's
local timezone**. On most hosts (including Vercel, which runs Node functions
in UTC by default) this is only a discrepancy if the server's local day has
already rolled over relative to Asia/Kolkata — in practice, IST is UTC+5:30,
so a UTC server is "behind" India, not ahead, which keeps this from causing
date drift in the direction that would double-count or skip a day. To remove
any ambiguity, set `TZ=Asia/Kolkata` as an environment variable in your
deployment (Vercel, Docker, etc.) so every part of the app agrees on what
day it is.

## What I could not run in this environment

This project (including the later MCP/ChatGPT integration work) was
completed and reviewed in a sandboxed environment with **no network
access**, so `npm install`, `npx prisma generate`, `npx tsc --noEmit`, `npm
run lint`, and `npm run build` could not actually be executed here (`npm
install` fails immediately with `403 Forbidden` against the npm registry,
and there is no local cache of `@modelcontextprotocol/sdk` or
`mcp-handler`). Instead, this project was verified with equivalent static
checks:

- Every local import (`@/...` and relative) across every `.ts`/`.tsx` file
  was resolved against the actual filesystem — zero missing modules.
- Every named/default import was cross-checked against the actual exports of
  its target file — zero mismatches.
- Every `.ts`/`.tsx` file (77 total as of the MCP work) was parsed with
  esbuild to confirm it is syntactically valid — zero failures. This does
  **not** catch type errors, only parse errors.
- Every API route, page, and component was read in full and checked by hand
  for ownership checks, correct Prisma field usage, and consistency with the
  Prisma schema.
- The `mcp-handler`/`@modelcontextprotocol/sdk` API surface used in
  `app/api/mcp/route.ts` (`createMcpHandler`, `withMcpAuth`, the
  `extra.authInfo.extra.userId` shape) was written from documented/known
  package behavior but **could not be type-checked against the real,
  installed package** — see `STAGE3_STATUS.md` for exactly what to verify
  once `npm install` can run with network access.

**Please run the verification commands in "6. Verify the build" yourself**
before deploying — they're fast, and will catch anything a static review
can't (e.g. a genuine TypeScript type error). If `npx tsc --noEmit` or
`npm run build` surface anything, they'll point at an exact file/line, which
makes it quick to fix.

## What was already implemented (recovered project)

Authentication, dashboard stats, subjects/topics CRUD, the full AI Chat
pipeline and backend, question bank, mistakes log, notes, study timer,
settings (including data export), and every underlying API route and Prisma
model were already implemented and working. See the assistant's chat
response for the full list of what was missing and has now been completed
(the login page, the AI Chat page, the Study Tracker page and its backend,
and a handful of missing dashboard/chat components).
