# STAGE2_STATUS.md — MCP Implementation Checkpoint

**Status: PARTIALLY IMPLEMENTED / NOT YET VERIFIED.**
This is a mid-implementation checkpoint, not a finished or working feature.
`npm install`, `prisma generate`, `tsc --noEmit`, `npm run lint`, and
`npm run build` have **NOT** been run against these changes yet. Nothing in
here should be assumed to compile, let alone deploy.

---

## What has been completed

1. **Read and cross-checked** `MCP_AUDIT.md` and `MCP_HANDOFF.md` against the
   actual source code in `tracker-main.zip` (schema, every `app/api/*` route,
   `lib/auth/*`, `lib/db/*`, `lib/validation/schemas.ts`, `middleware.ts`).
2. **Chosen concrete package versions** by checking the live npm registry
   (not memory): `@modelcontextprotocol/sdk@1.26.0` (pinned — the package's
   own README flags earlier 1.x versions as having a security
   vulnerability) and `mcp-handler@1.1.0` (the last 1.x line built on SDK
   1.x; `mcp-handler@2.x` requires an entirely different, newer SDK
   generation and was deliberately avoided).
3. **`prisma/schema.prisma`**:
   - Added `McpApiToken` model: `id, userId, user, name, tokenHash (unique),
     lastUsedAt, revokedAt, createdAt, rateLimitWindowStart,
     rateLimitCount`, `@@index([userId])`.
   - Added the `mcpApiTokens McpApiToken[]` back-relation on `User`.
   - Fixed `UserSettings.targetDate` default from `'2027-02-25'::date` to
     `'2027-02-07'::date`.
   - **No migration has been generated yet** (`prisma/migrations/` folder
     does not exist in this checkpoint — `npx prisma migrate dev` still
     needs to be run against a real database).
4. **Date-consistency fixes** (audit Section 8, items 2–4): `.env.example`,
   `README.md`, and `app/dashboard/page.tsx` dead fallback string all changed
   from `2027-02-25` to `2027-02-07`.
5. **`middleware.ts`**: added an `/api/mcp` bypass so the bearer-token MCP
   route isn't blocked by (or reliant on) the cookie-presence gate meant for
   the browser app.
6. **`lib/mcp/auth.ts`**: token issuance (`createMcpToken`), revocation
   (`revokeMcpToken`), listing (`listMcpTokens`), and identity resolution
   (`getUserFromMcpToken`) — tokens are SHA-256 hashed before storage (raw
   token never persisted), plus a DB-persisted fixed-window rate limiter
   (60 requests/minute/token, since Vercel serverless functions share no
   in-memory state across invocations).
7. **`lib/mcp/helpers.ts`**: `jsonResult`/`errorResult` response wrappers,
   and `getAuthedUserId(extra)` — pulls the authenticated `userId` out of
   `extra.authInfo.extra.userId` inside a tool callback. This shape was
   confirmed by reading the actual compiled `mcp-handler`/SDK code (see
   "Known unverified areas" — confirmed by static read, not by a live
   request yet).
8. **All 10 MCP tool files under `lib/mcp/tools/`**, each reusing the exact
   Prisma/zod logic from its matching REST route:
   - `dashboard.ts` → `get_dashboard_progress`
   - `subjects.ts` → `get_subjects`
   - `topics.ts` → `get_topics`, `update_topic_progress`
   - `questions.ts` → `get_questions`, `create_question`,
     `record_question_attempt` (replicates the dual Question-status +
     QuestionAttempt-create write from `PATCH /api/questions/[id]`)
   - `questionAttempts.ts` → `get_question_attempts` (new read-only query,
     no prior dedicated REST route existed)
   - `mistakes.ts` → `get_mistakes`, `create_mistake`
   - `notes.ts` → `get_notes`, `create_note`
   - `studyTasks.ts` → `get_study_tasks`, `create_study_task`,
     `update_study_task` (replicates `adjustTaskCounts` bookkeeping,
     including the date-move case)
   - `studySessions.ts` → `get_study_sessions`, `record_study_session`
     (deliberately a single "log a completed session" call rather than
     mirroring the UI's two-step start/stop timer — see the docstring in
     that file for the reasoning; this was an open question in
     `MCP_HANDOFF.md` Section 11 that had to be decided one way to make
     progress)
   - `analytics.ts` → `get_analytics`

## What remains unfinished

1. **`lib/mcp/tools/*` still take `(server, userId)` at registration time.**
   Mid-refactor: because `mcp-handler`'s stateless POST path constructs a
   brand-new `McpServer` per request and calls `initializeServer(server)`
   with only `server` (not the request/auth), the correct pattern is for
   each tool's **callback** to read `userId` from `extra` via
   `getAuthedUserId(extra)` (already written in `helpers.ts`), not from a
   closure-bound parameter. None of the 10 tool files have been refactored
   to this pattern yet — they need `(args, extra) => { const userId =
   getAuthedUserId(extra); if (!userId) return errorResult(...); ... }`.
2. **`app/api/mcp/route.ts` does not exist yet.** This is the actual
   endpoint: `createMcpHandler(...)` wrapped in `withMcpAuth(...)` calling
   `getUserFromMcpToken` from `lib/mcp/auth.ts`, registering all 10 tool
   groups, exported as `POST`/`GET`.
3. **No token-issuance script.** `scripts/mcp-token.ts` (a one-off
   authenticated CLI, mirroring `prisma/seed.ts`, to mint/revoke a token
   locally) has not been written.
4. **`package.json` has not been touched.** Still needs:
   `@modelcontextprotocol/sdk` pinned to `1.26.0`, `mcp-handler` at `^1.1.0`,
   and `zod` bumped from `^3.23.8` to `^3.25.0` (the SDK's peer requirement
   is `^3.25 || ^4.0`).
5. **No dependency install or verification has been run**: `npm install`,
   `npx prisma generate`, `npx prisma validate`, `npx tsc --noEmit`,
   `npm run lint`, `npm run build` have all **not** been executed against
   these changes.
6. **No `prisma/migrations/` entry** for the `McpApiToken` model or the
   `targetDate` default fix.
7. **`MCP_SETUP.md` has not been written.**
8. **Nothing has been tested** — no auth tests (valid/missing/revoked/
   cross-user token), no regression check of the existing cookie-based app,
   no manual MCP client connection.
9. Rate limiting is implemented but unverified under concurrency (the
   read-then-write to `rateLimitCount`/`rateLimitWindowStart` is not wrapped
   in a transaction, so two near-simultaneous requests on a cold path could
   both pass the check before either write lands — acceptable for a
   single-user app per the audit, but worth a `prisma.$transaction` pass
   later if this ever matters).

## Exact files changed or added in this checkpoint

**Modified:**
- `prisma/schema.prisma`
- `.env.example`
- `README.md`
- `app/dashboard/page.tsx`
- `middleware.ts`

**Added:**
- `lib/mcp/auth.ts`
- `lib/mcp/helpers.ts`
- `lib/mcp/tools/dashboard.ts`
- `lib/mcp/tools/subjects.ts`
- `lib/mcp/tools/topics.ts`
- `lib/mcp/tools/questions.ts`
- `lib/mcp/tools/questionAttempts.ts`
- `lib/mcp/tools/mistakes.ts`
- `lib/mcp/tools/notes.ts`
- `lib/mcp/tools/studyTasks.ts`
- `lib/mcp/tools/studySessions.ts`
- `lib/mcp/tools/analytics.ts`
- `STAGE2_STATUS.md` (this file)

**Not yet created** (planned, do not exist in this checkpoint):
- `app/api/mcp/route.ts`
- `scripts/mcp-token.ts`
- `MCP_SETUP.md`
- `prisma/migrations/...`

**Untouched** (per the handoff — leave as-is): the entire Luna/Optimizer
chat pipeline (`lib/ai/*`, `app/api/chat/route.ts`,
`app/api/conversations/**`, `components/chat/**`, `app/chat/**`), all
existing REST routes, all existing pages/components.

## Packages added/changed

Decided but **not yet written into `package.json`**:
- `@modelcontextprotocol/sdk`: add, pinned to `1.26.0`
- `mcp-handler`: add, `^1.1.0`
- `zod`: bump from `^3.23.8` to `^3.25.0`

No `npm install` has been run, so `package-lock.json` and `node_modules` in
this checkpoint are exactly as they were in the original uploaded ZIP —
they do **not** yet reflect the three lines above.

## Known unverified areas

- Whether `extra.authInfo.extra.userId` is really the correct, final shape
  at tool-call time was traced by reading `mcp-handler@1.1.0`'s compiled
  `dist/index.mjs` and the SDK's `dist/esm/server/streamableHttp.js` by
  hand (confirmed: `withMcpAuth` sets `req.auth`, the transport reads
  `req.auth` into `authInfo`, and the SDK forwards it to tool callbacks as
  `extra.authInfo`). This has **not** been confirmed by an actual running
  request yet.
- Whether `npm install` will resolve cleanly with `zod` bumped to `^3.25.0`
  alongside the project's existing zod usage in `lib/validation/schemas.ts`
  — expected to be a non-breaking bump, but untested.
- Whether `npm run build` succeeds at all — no build has been attempted
  since these changes were made.
- Live Vercel environment variables (per audit Section 11) — still cannot
  be seen from the repo.

## Continuation point

Resume by, in order:
1. Refactor all 10 files in `lib/mcp/tools/` to drop the `userId` parameter
   from each `registerXTools(server, userId)` function signature, and
   instead call `getAuthedUserId(extra)` inside each tool's callback
   (`(args, extra) => {...}`), returning `errorResult("Not authenticated.")`
   if it's `null`.
2. Update `package.json` with the three dependency changes listed above.
3. Write `app/api/mcp/route.ts`: `createMcpHandler` registering all 10 tool
   groups, wrapped in `withMcpAuth` calling `getUserFromMcpToken`, mapping
   its result to `{ token, clientId, scopes: [], extra: { userId } }` (401
   on `null`, and surfacing `McpRateLimitError` as 429).
4. Write `scripts/mcp-token.ts` (create/list/revoke), add an npm script for
   it.
5. Run `npm install`, `npx prisma validate`, `npx prisma generate`,
   `npx tsc --noEmit`, `npm run lint`, `npm run build` — fix whatever
   surfaces.
6. Generate the `prisma/migrations/...` entry via `npx prisma migrate dev`
   against a real database.
7. Write `MCP_SETUP.md`.
8. Run through the testing checklist in `MCP_HANDOFF.md` Section 9.
