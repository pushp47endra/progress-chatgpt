# STAGE3_STATUS.md — MCP Implementation: Code Complete, Execution-Blocked

**Status: CODE COMPLETE. NOT RUNTIME-VERIFIED.**

Every remaining item listed in `STAGE2_STATUS.md`'s "Continuation point" has
been implemented. However, **this sandboxed environment has no network
access** (`npm install` returns `403 Forbidden` against the npm registry, and
there is no local cache of `@modelcontextprotocol/sdk`, `mcp-handler`, or any
other package — `node_modules` does not exist at all) and no reachable
Postgres/Neon database. This is a genuine external limitation, not something
skipped by choice: `npm install`, `npx prisma generate`, `npx prisma
validate`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and any real
MCP client/handshake test **could not be executed**, and this document does
not claim otherwise anywhere.

What *was* done to compensate, and exactly what still needs to be run by
someone with network + database access, are both below.

---

## 1. What was completed this session

### 1.1 Tool files refactored to per-request auth (the #1 item from STAGE2_STATUS)

All 10 files in `lib/mcp/tools/` were refactored from
`registerXTools(server: McpServer, userId: string)` to
`registerXTools(server: McpServer)`, with every individual tool callback
changed from `async (args) => {...}` to `async (args, extra) => {...}`,
calling `getAuthedUserId(extra)` (already written in `lib/mcp/helpers.ts`)
and returning `errorResult("Not authenticated.")` if it's `null`. This
removes the closure-bound `userId` that would otherwise be wrong/dangerous
under `createMcpHandler`'s stateless-per-request model (a single constructed
`McpServer` must never have one user's id baked in at registration time).

Files changed: `dashboard.ts`, `subjects.ts`, `topics.ts`, `questions.ts`,
`questionAttempts.ts`, `mistakes.ts`, `notes.ts`, `studyTasks.ts`,
`studySessions.ts`, `analytics.ts`. All Prisma/zod/business logic inside each
tool is otherwise byte-for-byte identical to the STAGE2 checkpoint — only the
identity-resolution wiring changed, per the audit's explicit instruction not
to re-derive query logic.

### 1.2 `app/api/mcp/route.ts` (new)

Implements `createMcpHandler` (registering all 10 tool groups, stateless,
no Redis) wrapped in `withMcpAuth` (calling `getUserFromMcpToken` from
`lib/mcp/auth.ts`, mapping a valid token to
`{ token, clientId, scopes: [], extra: { userId } }`, returning `undefined`
on invalid/missing/revoked token or on `McpRateLimitError` — both surfaced by
`withMcpAuth` as `401`). Exports `GET`/`POST`/`DELETE` per the Streamable
HTTP transport. Explicit route-segment config added: `runtime = "nodejs"`
(Prisma cannot run on Edge), `dynamic = "force-dynamic"`, `maxDuration = 60`.

### 1.3 `package.json` (modified)

Added the three dependency changes STAGE2 had decided but not written:
- `@modelcontextprotocol/sdk`: `"1.26.0"` (pinned, matching the checkpoint's
  own security-motivated pin — not re-researched this session, see Section 3)
- `mcp-handler`: `"^1.1.0"`
- `zod`: bumped `"^3.23.8"` → `"^3.25.0"`

Added `"mcp:token": "tsx scripts/mcp-token.ts"` to `scripts`.

### 1.4 `scripts/mcp-token.ts` (new)

A CLI (`npm run mcp:token -- create|list|revoke`) mirroring `prisma/seed.ts`
in style. `create` mints a token for a user (defaulting to
`INITIAL_ADMIN_USERNAME`/`pushpendra`, since this is a single-user app) and
prints the raw token exactly once; `list` shows non-secret metadata for all
of a user's tokens; `revoke` sets `revokedAt`. Uses a relative import
(`../lib/mcp/auth`) rather than the `@/` path alias so it runs standalone
under `tsx` without depending on tsconfig path-alias resolution working
outside the Next.js build pipeline.

### 1.5 `MCP_SETUP.md` (new)

Full setup doc: architecture, endpoint, auth/token lifecycle, environment
variables (none new required), local testing (including `curl` commands and
a note on `mcp-inspector`), ChatGPT connector configuration, security
summary, and a troubleshooting table.

### 1.6 `README.md` (modified further)

Added an "MCP / ChatGPT Integration" section pointing to `MCP_SETUP.md`, and
extended the pre-existing "What I could not run in this environment" section
(this README already had one from an earlier, unrelated recovery stage of
this same project) to specifically flag the MCP packages as unverified.

### 1.7 Static verification actually performed (see Section 2 for what this does *not* prove)

- Every `.ts`/`.tsx` file in the repository (77 files) was parsed with
  esbuild (`transformSync`, TS/TSX loader, no type resolution) to confirm
  syntactic validity. **Result: 0 failures.** This catches unbalanced
  braces/parens, invalid syntax, and malformed JSX — it does **not** catch
  type errors, missing-module errors, or incorrect API usage.
- Every new/modified file's imports were manually cross-checked against the
  actual exported names in their target files (e.g. every
  `getAuthedUserId`/`jsonResult`/`errorResult` import against
  `lib/mcp/helpers.ts`'s actual exports; every `registerXTools` call in
  `app/api/mcp/route.ts` against each tool file's actual export and
  signature). Zero mismatches found.
- `prisma/schema.prisma`, `.env.example`, `README.md`, and
  `app/dashboard/page.tsx` were re-checked and confirmed to already contain
  the `2027-02-07` fix from the STAGE2 checkpoint (no `2027-02-25` remains
  anywhere except this file's own historical narration of the bug).
- `middleware.ts`'s `/api/mcp` bypass was re-read and confirmed correct
  against the new route's actual path.
- Every tool's Prisma query shape was re-checked field-by-field against
  `prisma/schema.prisma` (Section 3 of `MCP_AUDIT.md`) — no invented fields.

---

## 2. What genuinely could NOT be verified, and why

This is the section the task instructions require: a real limitation, not a
place where effort was skipped.

| Command | Why it could not run here |
|---|---|
| `npm install` | No network access (`403 Forbidden` from the sandbox's egress proxy against `registry.npmjs.org`); no local package cache for `@modelcontextprotocol/sdk`, `mcp-handler`, or any other npm package. `node_modules` does not exist at all in this checkpoint. |
| `npx prisma generate` / `npx prisma validate` | Requires the `prisma` CLI package, which is not installed (see above), and `prisma generate` additionally requires reaching Prisma's binary-download CDN. |
| `npx tsc --noEmit` | Requires type declarations for every dependency (`@prisma/client`, `next`, `@modelcontextprotocol/sdk`, `mcp-handler`, `zod`, `date-fns`, etc.), none of which are installed. Running the *globally* installed `tsc` in this sandbox against this project would report hundreds of "cannot find module" errors that are artifacts of the missing `node_modules`, not real bugs — so it was not run, to avoid a misleading result. |
| `npm run lint` | Depends on `eslint`/`eslint-config-next`, not installed. |
| `npm run build` | Depends on the entire dependency tree, not installed. |
| Any live MCP handshake / tool call / `mcp-inspector` session | Requires a running Node process with real dependencies installed **and** a reachable Postgres/Neon database with `DATABASE_URL` set — neither is available in this sandbox. |
| Cross-user isolation test, rate-limit test, auth-failure test (401/429), regression test of the existing cookie-based app | All require the same running app + real database as above. |
| Whether `@modelcontextprotocol/sdk@1.26.0` / `mcp-handler@1.1.0` are still the current recommended pins, and whether the `createMcpHandler`/`withMcpAuth` config keys used in `app/api/mcp/route.ts` (e.g. `maxDuration`, `verboseLogs`, the `verifyToken(req, bearerToken)` signature, the `{ required: true }` option) exactly match those packages' real, current type definitions | No registry access to fetch/inspect the packages. The code was written from the STAGE2 checkpoint's own prior research (which explicitly stated it had read the compiled `dist/index.mjs`/`dist/esm/server/streamableHttp.js` by hand) plus well-established `mcp-handler` usage conventions, but this session could not independently re-confirm it against a live package install. |

**Bottom line: the code is complete and has been reviewed as carefully as
possible without execution, but it has not been proven to compile or run.**
Do not deploy this to production before running the commands in Section 4.

---

## 3. Exact continuation steps for the next session (with network + DB access)

1. `npm install` — watch for any peer-dependency conflict between the zod
   bump (`^3.25.0`) and other packages' zod peer ranges.
2. `npx prisma validate && npx prisma generate`.
3. Confirm the current migration baseline before touching the schema
   further: `npx prisma migrate status` against the real database. **No
   `prisma/migrations/` folder exists anywhere in this project** (confirmed
   again this session — the audit flagged this as unusual/unverifiable from
   a static read back in `MCP_AUDIT.md` Section 11). This most likely means
   the project's database was provisioned via `npx prisma db push` rather
   than the migration workflow. Two safe paths, in order of preference:
   - If you intend to adopt migrations going forward: run
     `npx prisma migrate dev --name add_mcp_api_token` once, after
     confirming with `prisma migrate status`/a manual schema diff that the
     live database's current shape actually matches everything in
     `schema.prisma` *except* `McpApiToken` and `UserSettings.targetDate`'s
     default — otherwise Prisma may propose a much larger, wrong diff.
   - If the project stays on `db push`: run `npx prisma db push` instead.
     Simpler and matches how this schema apparently got here, but does not
     create a migration history file.
   Either way, this is a step this session had no way to perform safely
   without a real, reachable `DATABASE_URL`.
4. `npx tsc --noEmit` — fix whatever surfaces. Pay closest attention to
   `app/api/mcp/route.ts` and `lib/mcp/helpers.ts`, since those two files
   contain every assumption about `mcp-handler`/SDK types that could not be
   checked this session.
5. `npm run lint`.
6. `npm run build`.
7. `npm run seed` (if the target database has no user yet), then
   `npm run mcp:token -- create` to mint a token.
8. Manually test the endpoint (curl commands are in `MCP_SETUP.md` Section
   5), then ideally run `mcp-inspector` against it for full tool-by-tool
   verification, then connect an actual ChatGPT MCP connector.
9. Run the full test checklist in `MCP_HANDOFF.md` Section 9 and the
   regression list in the original task prompt (login, dashboard, tracker,
   subjects, topics, questions, mistakes, notes, study timer, study
   sessions, analytics, settings, existing chat/AI — confirm none of them
   changed behavior).
10. Only after all of the above passes: deploy to Vercel, set no new
    environment variables (none are needed — see `MCP_SETUP.md` Section 4),
    and connect ChatGPT using `MCP_SETUP.md` Section 6.

---

## 4. Files changed or added this session

**Modified:**
- `lib/mcp/tools/dashboard.ts`, `subjects.ts`, `topics.ts`, `questions.ts`,
  `questionAttempts.ts`, `mistakes.ts`, `notes.ts`, `studyTasks.ts`,
  `studySessions.ts`, `analytics.ts` (auth refactor, Section 1.1)
- `package.json` (dependencies + `mcp:token` script, Section 1.3)
- `README.md` (MCP section + updated "could not run" note, Section 1.6)

**Added:**
- `app/api/mcp/route.ts`
- `scripts/mcp-token.ts`
- `MCP_SETUP.md`
- `STAGE3_STATUS.md` (this file)

**Not created (needs real DB access, see Section 3, item 3):**
- `prisma/migrations/...`

**Untouched, confirmed already correct from STAGE2:**
- `prisma/schema.prisma`, `.env.example`, `app/dashboard/page.tsx`,
  `middleware.ts`, `lib/mcp/auth.ts`, `lib/mcp/helpers.ts`
- The entire Luna/Optimizer chat pipeline and every existing REST route —
  not read/write-touched at all this session.

---

## 5. Final report summary (for the task's requested format)

- **Files changed**: see Section 4.
- **MCP endpoint**: `POST/GET/DELETE https://<vercel-domain>/api/mcp`
  (Streamable HTTP).
- **Authentication method**: hashed (SHA-256), revocable, DB-backed bearer
  token (`McpApiToken`), resolved per-request via `withMcpAuth` →
  `getUserFromMcpToken`; no OAuth, no static env-var secret.
- **Tools implemented**: 10 read tools (`get_dashboard_progress`,
  `get_subjects`, `get_topics`, `get_questions`, `get_question_attempts`,
  `get_mistakes`, `get_notes`, `get_study_tasks`, `get_study_sessions`,
  `get_analytics`) + 8 write tools (`create_question`,
  `record_question_attempt`, `create_mistake`, `create_note`,
  `create_study_task`, `update_study_task`, `record_study_session`,
  `update_topic_progress`) — 18 tools total, matching `MCP_AUDIT.md`
  Section 7 exactly, no invented fields.
- **Tests passed**: static syntax check only (77/77 files parse cleanly via
  esbuild) and manual cross-reference of every import/export/Prisma field.
  **No compiler, linter, build, or live MCP test was run** — see Section 2.
- **Build result**: not run (no network/dependencies — Section 2).
- **Remaining issues**: everything in Section 3's continuation checklist;
  most notably, the `mcp-handler`/SDK API surface in
  `app/api/mcp/route.ts` needs a real `npm install` + `tsc` pass to confirm,
  and the database needs a real migration/push before first deploy.
- **Exact Vercel environment variable NAMES**: no new ones. Existing:
  `DATABASE_URL`, `AUTH_SECRET`, `INITIAL_ADMIN_USERNAME`,
  `INITIAL_ADMIN_PASSWORD` (seed-only), `OPTIMIZER_API_KEY`,
  `OPTIMIZER_API_URL`, `OPTIMIZER_MODEL`, `LUNA_API_KEY`, `LUNA_API_URL`,
  `LUNA_MODEL_ID`, `AWS_REGION`, `APP_TIMEZONE`, `TARGET_EXAM_DATE`. (No
  values shown here or anywhere in this checkpoint.)
- **Exact ChatGPT MCP configuration**: Type = Streamable HTTP; URL =
  `https://<your-vercel-domain>/api/mcp`; Authentication = API key/Bearer
  token, using the raw value printed once by
  `npm run mcp:token -- create`.
