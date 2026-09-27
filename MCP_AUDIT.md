# MCP_AUDIT.md — GATE AI Tracker: Technical Audit for ChatGPT/MCP Integration

Audit date: 2026-09-27
Scope: full repository (`tracker-main.zip`), read-only. No code was modified.

---

## 1. Project identity

- **Name**: GATE AI — "personal, single-user study platform for GATE CSE 2027 preparation" (README, line 3).
- **Stack**: Next.js 14 (App Router) + React 18 + TypeScript, Tailwind CSS, Prisma ORM + PostgreSQL (Neon), bcryptjs + opaque DB-backed cookie sessions (no NextAuth/Clerk/Auth.js), zod validation on every route, recharts for charts.
- **Deployment**: Vercel (no `vercel.json` — relies on Vercel's default Next.js detection/build).
- **Single-user in practice, multi-user in schema**: every model is scoped by `userId`, and a seed script (`prisma/seed.ts`) creates exactly one bootstrap user (default username `pushpendra`) from `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD`. There is no public sign-up route. This matters for the MCP auth design (Section 5) — you are not building multi-tenant OAuth for the general public, you are building single-owner secure remote access.

---

## 2. Repository map (relevant parts only)

```
app/
  api/
    auth/{login,logout,session}/route.ts   — cookie-session auth
    chat/route.ts                          — existing 2-stage AI chat (Optimizer -> Luna/Bedrock)
    conversations/, conversations/[id]/    — chat conversation CRUD
    dashboard/route.ts                     — GET only, wraps lib/db/stats.ts
    analytics/route.ts                     — GET only, 30-day rollups
    subjects/route.ts, subjects/[id]/      — GET/POST, PATCH/DELETE
    topics/route.ts, topics/[id]/          — GET/POST, PATCH/DELETE
    questions/route.ts, questions/[id]/    — GET/POST, PATCH/DELETE (+ auto QuestionAttempt)
    mistakes/route.ts, mistakes/[id]/      — GET/POST, PATCH/DELETE
    notes/route.ts, notes/[id]/            — GET/POST, PATCH/DELETE
    study-tasks/route.ts, study-tasks/[id]/ — GET/POST, PATCH/DELETE (+ DailyProgress sync)
    study-sessions/route.ts, [id]/         — POST start, PATCH stop (+ DailyProgress sync)
    settings/route.ts, settings/export/    — GET/PATCH, full-account JSON export
  dashboard/, tracker/, subjects/, questions/, mistakes/, notes/, analytics/, settings/, chat/, login/
    — page.tsx files, all server components calling getCurrentUser()/prisma directly or via the API
middleware.ts                              — edge cookie-presence gate
lib/
  auth/session.ts                          — session creation/validation/destruction (server-only)
  auth/password.ts                         — bcrypt hash/verify (server-only)
  ai/luna.ts, optimizer.ts, systemPrompt.ts, title.ts — existing AI chat pipeline (Bedrock-based, NOT OpenAI)
  db/prisma.ts                             — Prisma singleton
  db/stats.ts                              — dashboard aggregate queries
  db/dailyProgress.ts                      — DailyProgress upsert/increment helpers
  validation/schemas.ts                    — the single source of truth for every field name/shape
  utils/date.ts                            — TARGET_EXAM_DATE / APP_TIMEZONE / day-key helpers
prisma/schema.prisma                       — full DB schema
prisma/seed.ts                             — bootstrap user + default subjects
.env.example                               — documents all env vars (no real secrets present)
next.config.js                             — default config, nothing MCP-relevant
```

No `vercel.json`, no existing MCP code, no OpenAI SDK/key anywhere in the repo (`grep` for "MCP"/"mcp" and "openai" returned nothing relevant). The existing AI chat ("Luna") talks to **Amazon Bedrock**, not OpenAI — it is a fully separate system from the requested ChatGPT MCP integration and does not conflict with it.

---

## 3. Database schema (Prisma) — source of truth for MCP tool fields

All models below key off `userId` (String, FK to `User.id`, cascade delete). I am listing **only** the fields that actually exist — do not let the next developer invent fields not shown here.

### User / Session (auth)
- `User { id, username (unique), passwordHash, createdAt, updatedAt }` + relations to every other model.
- `Session { id, token (unique), userId, expiresAt, createdAt }` — session tokens are **opaque random 96-hex-char strings** (`crypto.randomBytes(48).toString("hex")`), stored server-side, looked up by exact match. They are not JWTs and are not signed with `AUTH_SECRET` (that env var is currently unused — see `.env.example` note: "Sessions themselves are opaque, randomly-generated, database-backed tokens ... this value is not currently used to sign them").

### Subject
`id, userId, name, isDefault, createdAt, updatedAt`. Unique on `(userId, name)`.

### Topic
`id, userId, subjectId, name, completed, priority (low|medium|high), estimatedTime (Int minutes, nullable), questionTarget (Int, nullable), notes (Text, nullable), createdAt, updatedAt`.

### StudyTask (date-wise tracker)
`id, userId, date (Date), subjectId (nullable), topicId (nullable), subtopic (String, nullable), estimatedTime (Int minutes, nullable), priority (low|medium|high), difficulty (easy|medium|hard), questionTarget (Int, nullable), notes (Text, nullable), completed, completedAt, createdAt, updatedAt`.

### StudySession (timer sessions)
`id, userId, subjectId (nullable), topicName (String, nullable — NOT a topicId FK), startTime, endTime (nullable), duration (Int seconds, nullable), createdAt`.
**Note the schema quirk**: `StudySession` stores `topicName` as a free-text string, not a `topicId` relation, unlike every other model. Any MCP "record study session" tool must respect this — do not invent a `topicId` field for this model.

### DailyProgress (derived/aggregate table, not directly user-editable via existing API)
`id, userId, date (Date, unique per user), tasksTotal, tasksDone, studySeconds, isActiveDay, createdAt, updatedAt`. Only ever written by `lib/db/dailyProgress.ts` helpers (`addStudySeconds`, `adjustTaskCounts`), triggered by StudyTask/StudySession mutations. **No existing API route lets a client write to this table directly** — it's a derived cache, not a primary record type. MCP should not expose a raw "update daily progress" write tool; it should keep going through StudyTask/StudySession writes so the derived counters stay correct.

### Question
`id, userId, subjectId (nullable), topicId (nullable), questionText (Text), difficulty (easy|medium|hard), source (String, nullable), userAnswer (Text, nullable), correctAnswer (Text, nullable), explanation (Text, nullable), status (not_attempted|attempted|correct|incorrect|skipped), date (defaults now), createdAt, updatedAt`.

### QuestionAttempt
`id, userId, questionId, isCorrect (Boolean), answer (Text, nullable), createdAt`.
**Important existing behavior**: `QuestionAttempt` rows are **not created via a dedicated endpoint**. They are created as a *side effect* inside `PATCH /api/questions/[id]` whenever the update sets `status` to `"correct"` or `"incorrect"` (see `app/api/questions/[id]/route.ts`). There is no standalone "create question attempt" route today. This is the single most important reuse point for the "record question attempt" MCP tool (Section 6).

### Mistake
`id, userId, subjectId (nullable), topicId (nullable), question (Text), myAnswer (Text, nullable), correctAnswer (Text, nullable), whyWrong (Text, nullable), correctConcept (Text, nullable), revisionStatus (not_revised|revised|mastered), date (defaults now), createdAt, updatedAt`.

### Note
`id, userId, subjectId (nullable), topicId (nullable), title, content (Text), tags (String[], default []), createdAt, updatedAt`.

### UserSettings
`id, userId (unique), targetDate (Date, DB default `'2027-02-25'::date` — see Section 8, this is a bug), dailyTargetMinutes (default 120), preferredLanguage (default "hinglish"), preferredDifficulty, theme, debugMode, timezone (default "Asia/Kolkata"), createdAt, updatedAt`.

### Conversation / Message (existing AI chat — not in MCP scope per your request, listed for completeness)
`Conversation { id, userId, title, createdAt, updatedAt }`, `Message { id, conversationId, role (user|assistant), content, model, promptTokens, completionTokens, optimizedPrompt, createdAt }`.

---

## 4. Authentication mechanism (current)

1. **Login**: `POST /api/auth/login` — validates `username`/`password` via `loginSchema` (zod), looks up `User` by username, verifies bcrypt hash, and on success calls `createSession(userId)`.
2. **Session creation** (`lib/auth/session.ts`): generates a 96-char hex random token (`crypto.randomBytes(48)`), stores it in the `Session` table with a 30-day expiry, and sets it as an **HTTP-only, `sameSite=lax`, `secure` (in prod) cookie** named `gate_ai_session`.
3. **Session validation**: `getCurrentUser()` reads the cookie, looks the token up in the `Session` table, checks `expiresAt`, and deletes+returns-null if expired. Every API route calls this manually at the top (no shared wrapper/middleware does the DB check).
4. **Edge middleware** (`middleware.ts`): runs on Vercel's Edge runtime, and — because Prisma/Postgres can't be queried from the Edge runtime — only checks **cookie presence**, not validity. It redirects to `/login` (pages) or returns 401 JSON (`/api/*`) if the cookie is entirely absent. The *real* check is always the per-route `getCurrentUser()`/`requireUser()` call.
5. **Logout**: `POST /api/auth/logout` deletes the `Session` row and clears the cookie.
6. **Authorization / data ownership**: every single query in every route is scoped with `where: { ..., userId: user.id }` (or `findFirst({ id, userId })` before any mutation). This is applied consistently — I did not find a single route that skips the ownership check. This is a real strength of the existing codebase.

### Why this auth mechanism does not work for ChatGPT/MCP as-is
- Cookies are browser-session artifacts. An MCP client (ChatGPT's MCP connector, or any custom MCP server acting on ChatGPT's behalf) is a **server-to-server HTTP client**, not a browser — it has no cookie jar tied to a login flow, and you don't want to paste a raw session cookie into a third-party tool config (cookies are also short-lived by design — 30 days — and rotate on every login).
- There is currently **no bearer-token / API-key mechanism, and no OAuth server**, anywhere in the codebase. This must be added; it is the core of the MCP handoff work (Section 5).

---

## 5. Security audit summary

| Area | Finding |
|---|---|
| Authentication mechanism | Cookie + DB-backed opaque session token. No OAuth, no API keys, no JWT. |
| User identity mechanism | Single `User` row per person; `username` unique; no email, no multi-factor. |
| Authorization | Consistently enforced per-row `userId` scoping on every route audited. No cross-user data leakage found. |
| Data ownership | Every model has a direct `userId` FK; cascade deletes on `User` are correctly configured. |
| Exposed APIs | All `/api/*` routes require a valid session except `/login` and `/api/auth/login` (explicitly public in `middleware.ts`). No route returns another user's data. |
| Secret handling | Secrets are read only from `process.env` inside `server-only`-marked files (`lib/auth/*`, `lib/db/prisma.ts`, `lib/ai/*`). `.gitignore` correctly excludes all `.env*` files except `.env.example`. No secrets are hardcoded or committed. `AUTH_SECRET` is generated/documented but currently **unused** by any code path — flag this to the next developer; it should either be wired in (e.g. to sign a future JWT/OAuth token) or removed from docs to avoid false security assumptions. |
| Possible database exposure | Neon `DATABASE_URL` is only read in `lib/db/prisma.ts`, server-only. No route ever returns raw connection info. Standard Prisma parameterized queries are used throughout — no string-concatenated SQL, so no obvious SQL-injection surface. |
| Possible MCP authentication approach | See Section 5a below. |
| Vercel limitations | (1) Edge middleware cannot query Postgres/Prisma — already worked around by doing real auth in route handlers, and the same constraint applies to any new MCP-adjacent middleware. (2) Vercel serverless functions have execution time limits (typically 10s on Hobby, up to 60s+/800s depending on plan) — relevant if an MCP tool call chains multiple Prisma queries or is placed behind a slow OAuth token-introspection call. (3) No persistent in-memory state across invocations — any MCP session/rate-limit state must live in Postgres (or a dedicated KV store), not in a module-level variable. |
| Risks of a bearer token | A long-lived static bearer token (e.g. a single `MCP_API_KEY` env var) is simple and Vercel-compatible, but: it is an all-or-nothing credential (anyone with it has full read/write access to all of your data with no per-tool scoping unless you build that yourself); it must be stored securely inside ChatGPT's connector config (outside your control once entered) with no built-in expiry/rotation unless you build one; if it leaks, the only remedy is manual rotation. This is an acceptable risk **only** because this is a single-user personal app with one real account — it would not be acceptable for a multi-tenant product. |
| Whether OAuth is needed | Not strictly required for a single-user personal deployment. A well-implemented long-lived, revocable, hashed API token (Section 5a, Option A) is a reasonable, much-lower-effort alternative to standing up a full OAuth 2.0 authorization server, and ChatGPT's MCP connector UI supports both "API key" and "OAuth" connection types — so either is viable from ChatGPT's side. Recommend Option A for v1, with a note that Option B (OAuth) is the correct choice if this ever becomes multi-user or is exposed more broadly. |

### 5a. Recommended MCP authentication approaches (for the next developer to choose from)

**Option A — Hashed, revocable API token (recommended for v1)**
- Add a new Prisma model, e.g. `McpApiToken { id, userId, name, tokenHash (unique), lastUsedAt, createdAt, revokedAt (nullable) }`. Store only a **hash** (e.g. SHA-256 or bcrypt) of the token, never the raw value — same principle already used for `passwordHash`/`Session.token`.
- Generate the token once (`crypto.randomBytes`), show it to the user exactly once (e.g. on a new `/settings` "MCP Access" panel or a one-off CLI/script), and store the hash.
- The MCP server validates incoming requests by hashing the presented token and looking up `McpApiToken.tokenHash`, checking `revokedAt IS NULL`, then resolving `userId` — mirroring `getCurrentUser()` but keyed by token instead of cookie.
- This reuses the exact same ownership-scoping pattern already used everywhere else in the codebase (`where: { userId }`), so no query logic needs to change — only the identity-resolution step at the top of each handler.
- Supports rotation/revocation trivially (set `revokedAt`), and supports multiple tokens (e.g. one for ChatGPT, one for a future integration) without extra design work.

**Option B — Full OAuth 2.0 (authorization code + refresh tokens)**
- Needed only if you expect multiple users, or want ChatGPT's "Sign in" UX instead of pasting a key. Requires standing up token issuance/introspection endpoints, a consent screen, and refresh-token rotation — meaningfully more work for a single-user app. Documented here for completeness per your request, not recommended as the v1 path.

**Either option must be paired with:**
- HTTPS only (already guaranteed by Vercel).
- Rate limiting on the MCP endpoint (Vercel Edge Config, Upstash Redis, or a simple DB-backed counter — there is currently no rate limiting anywhere in the app, including the existing login route, which is a pre-existing gap worth flagging but out of scope to fix here).
- Never logging the raw token/key (`console.error` calls in the codebase, e.g. in `app/api/chat/route.ts`, currently log validation errors and pipeline errors but not credentials — keep that discipline in the new MCP code).

---

## 6. Existing functions/patterns to reuse for MCP tools

The next developer should **not** re-derive query logic. Reuse:

- **`getCurrentUser()` pattern** (`lib/auth/session.ts`) → replace with an equivalent `getUserFromMcpToken(token)` that returns the same `User` shape, so every downstream Prisma call is unchanged.
- **`lib/validation/schemas.ts`** → every zod schema listed there (`createSubjectSchema`, `createTopicSchema`, `updateTopicSchema`, `createQuestionSchema`, `updateQuestionSchema`, `createMistakeSchema`, `updateMistakeSchema`, `createNoteSchema`, `updateNoteSchema`, `createTaskSchema`, `updateTaskSchema`, `studySessionStartSchema`, `studySessionStopSchema`) should be imported and reused verbatim as the MCP tool input schemas (or turned into the MCP tool's JSON-schema equivalent field-for-field) — this guarantees the MCP layer can never accept a field the REST API wouldn't.
- **`lib/db/stats.ts:getDashboardData(userId)`** → reuse directly for the "read dashboard progress" MCP tool; it already returns exactly the dashboard's shape (days remaining, streaks, accuracy, study time, today's tasks).
- **`lib/db/dailyProgress.ts` (`addStudySeconds`, `adjustTaskCounts`)** → must be called from any MCP write tool that creates/updates/deletes a `StudyTask` or stops a `StudySession`, exactly as the existing REST routes do, or the dashboard/analytics counters will silently drift out of sync (see Section 8, bug risk #1).
- **The `PATCH /api/questions/[id]` side-effect logic** (auto-creating a `QuestionAttempt` when `status` flips to `correct`/`incorrect`) → the "record question attempt" MCP tool should either (a) call this same update path, or (b) explicitly replicate both writes (`Question.status`/`userAnswer` update **and** `QuestionAttempt.create`) atomically. Do not add a naïve "create QuestionAttempt" tool that forgets to also update the parent `Question.status` — that would desync the two records that every other UI screen assumes are in sync.
- **`lib/utils/date.ts`** (`dateKeyToDate`, `getTodayKey`, `TARGET_EXAM_DATE`, `APP_TIMEZONE`) → reuse for any MCP tool that accepts a `date` (StudyTask) so date-key handling stays identical to the REST API (`yyyy-MM-dd` strings, `Asia/Kolkata` timezone).
- **Ownership-check pattern**: `prisma.<model>.findFirst({ where: { id, userId: user.id } })` before every update/delete, exactly as done in every `[id]/route.ts` file today.

---

## 7. Recommended MCP tool list (matched to actual schema — no invented fields)

### READ tools
| Tool | Backing logic to reuse | Notes |
|---|---|---|
| `get_dashboard` | `lib/db/stats.ts:getDashboardData` | No params. |
| `list_subjects` | `GET /api/subjects` query logic | Returns enriched subjects (topic/question/study-time rollups). |
| `list_topics` | `GET /api/topics` query logic | Optional `subjectId` filter. |
| `list_questions` | `GET /api/questions` query logic | Optional `status`, `subjectId`, `q` (search), `page`. |
| `list_question_attempts` | New query on `QuestionAttempt`, scoped by `userId` (no existing dedicated route — build read-only, following the same `where: { userId }` pattern) | Optional `questionId` filter. |
| `list_mistakes` | `GET /api/mistakes` query logic | Optional `revisionStatus`, `subjectId`; also exposes `weakTopics`. |
| `list_notes` | `GET /api/notes` query logic | Optional `q` (search across title/content/tags), `subjectId`. |
| `list_study_tasks` | `GET /api/study-tasks` query logic | Supports `date`, `from`/`to`, `all`, `subjectId`, `completed` — replicate all of these filters. |
| `list_study_sessions` | `GET /api/study-sessions` query logic | Optional `limit` (max 100). |
| `get_analytics` | `GET /api/analytics` query logic | No params; fixed 30-day window as in the existing route. |

### WRITE tools
| Tool | Backing logic to reuse | Notes |
|---|---|---|
| `create_question` | `createQuestionSchema` + `POST /api/questions` logic | Fields: `subjectId?, topicId?, questionText, difficulty?, source?, userAnswer?, correctAnswer?, explanation?, status?`. |
| `record_question_attempt` | `PATCH /api/questions/[id]` logic (status→correct/incorrect side effect) | Do not skip the `QuestionAttempt.create` + `Question.status` dual-write (Section 6). Inputs should be `questionId, isCorrect, answer?` mapped through the existing update path. |
| `create_mistake` | `createMistakeSchema` + `POST /api/mistakes` logic | Fields as listed in Section 3. |
| `create_note` | `createNoteSchema` + `POST /api/notes` logic | Fields as listed in Section 3, including `tags` array. |
| `create_study_task` | `createTaskSchema` + `POST /api/study-tasks` logic | Must call `adjustTaskCounts(userId, date, 0, 1)` after create, and must validate `subjectId`/`topicId` ownership exactly as the existing route does. |
| `update_study_task` | `updateTaskSchema` + `PATCH /api/study-tasks/[id]` logic | Must replicate the date-move / completion-toggle `adjustTaskCounts` bookkeeping (Section 6) — this is the most stateful write in the app. |
| `record_study_session` | `studySessionStartSchema`/`studySessionStopSchema` + `POST`/`PATCH /api/study-sessions[/[id]]` logic | Two-step in the UI (start, then stop) — decide with the user whether the MCP tool should be a single "record a completed session with duration" call (simpler for a chat client) or mirror the two-step start/stop flow. Either way, a stop/record must call `addStudySeconds`. |
| `update_topic_progress` | `updateTopicSchema` + `PATCH /api/topics/[id]` logic | Fields: `name?, priority?, estimatedTime?, questionTarget?, notes?, completed?`. |

**Explicitly not recommended as MCP tools**: direct `DailyProgress` writes (derived table, Section 3), direct `Session`/`User` mutation (auth-only, not tracker data), and anything touching `Conversation`/`Message` (existing Luna chat, out of scope per your instructions).

---

## 8. Date audit — `2027-02-25` vs `2027-02-07`

Correct exam date per your instructions: **2027-02-07**, timezone **Asia/Kolkata**.

**Already correct** (no change needed):
- `lib/utils/date.ts` line 13: `TARGET_EXAM_DATE = process.env.TARGET_EXAM_DATE || "2027-02-07"` ✅
- `lib/utils/date.ts` line 31: fallback-on-invalid-date also uses `"2027-02-07"` ✅
- `APP_TIMEZONE` default is already `"Asia/Kolkata"` ✅ (also the `UserSettings.timezone` DB default)

**Still incorrect — 3 remaining `2027-02-25` references, none of which affect the actual computed "days remaining" value shown on the dashboard (that value comes from `lib/utils/date.ts`, which is already correct), but all of which are misleading/inconsistent and should be corrected in the same pass as the MCP work (or immediately before it, at the implementer's discretion):**

1. **`prisma/schema.prisma` line 304** — `UserSettings.targetDate` has a **Postgres-level column default**: `@default(dbgenerated("'2027-02-25'::date"))`. This only affects the value stored in the `UserSettings` row (used for display on `/settings`, not for the dashboard's days-remaining calculation, which uses `TARGET_EXAM_DATE` from env/code instead). Still, it's a real, wrong stored default that a fresh `UserSettings` row would get. **Requires a Prisma migration to fix**, not just a code edit.
2. **`app/dashboard/page.tsx` line 37** — a dead-code fallback string `"2027-02-25"`, only reached if `data.targetDate` is ever `undefined`/`NaN` (which it structurally cannot be, since `data.targetDate` always comes from `TARGET_EXAM_DATE`, a non-empty string). Low risk, but should be corrected for consistency.
3. **`README.md` line 73** — documentation only: `TARGET_EXAM_DATE | No (defaults to 2027-02-25)`. Should read `2027-02-07`.
4. **`.env.example` line 33** — `TARGET_EXAM_DATE=2027-02-25`. This is the **highest-impact** one of the four: if a real deployment's `.env.local`/Vercel env vars were copied from this example and a value was actually set here (rather than left blank to fall through to the code default), the app would use the wrong date. Confirm during implementation whether the live Vercel deployment has `TARGET_EXAM_DATE` explicitly set in its environment variables — if so, it must be corrected there too (this audit cannot see Vercel's configured env vars).

No occurrences of `02-25`, "Feb 25", or "February 25" were found anywhere else in the codebase.

---

## 9. Existing bugs / known issues (must not regress, not required to fix)

- **`lib/db/stats.ts` `longestStreak` calculation**: contains a dead/no-op branch (`if (prevKey && format(subDays(new Date(key), 0), "yyyy-MM-dd") === key) { // handled below via date diff check }`) that does nothing. It doesn't currently produce wrong output (the real logic is in the block below it), but it's confusing dead code. Not in MCP scope — just don't let an AI "cleanup" pass touch this file while doing something else, or verify streak math still matches if it does.
- **`DailyProgress` counters can only be trusted if every StudyTask/StudySession write goes through `adjustTaskCounts`/`addStudySeconds`.** Any new MCP write path that bypasses these (e.g. a raw `prisma.studyTask.create()` without also calling `adjustTaskCounts`) will silently corrupt the dashboard's streak/task counts. This is the single biggest regression risk in this project (Section 6, 7).
- **No rate limiting anywhere**, including `/api/auth/login` (no lockout after repeated failed attempts). Pre-existing, out of scope, but do not make it worse by adding an unthrottled MCP endpoint that also lacks rate limiting.
- **`AUTH_SECRET` is documented but unused.** Do not assume it provides any security today.

---

## 10. Existing AI chat code — remain or remove

The Optimizer → Luna (Amazon Bedrock) chat pipeline (`lib/ai/luna.ts`, `lib/ai/optimizer.ts`, `lib/ai/systemPrompt.ts`, `lib/ai/title.ts`, `app/api/chat/route.ts`, `app/api/conversations/**`, `components/chat/**`, `app/chat/**`, the `Conversation`/`Message` Prisma models) is:
- **Completely independent of the requested MCP work.** It does not use OpenAI, does not conflict with a ChatGPT MCP server, and requires no changes to support MCP.
- **Recommendation: leave it entirely as-is.** It is not "existing AI code" that competes with the new MCP integration — it is a separate feature (an in-app tutor chat) sitting alongside the new capability (letting ChatGPT itself read/write the tracker). There is no reason to remove or modify it as part of this project unless the user says otherwise.

---

## 11. What I could not verify from static code alone

- Whether `TARGET_EXAM_DATE` (or any other env var) is explicitly set to an outdated value in the **live Vercel project's environment variables** — that's outside the repo and must be checked in the Vercel dashboard directly.
- Actual Vercel plan (Hobby vs Pro) and its function-duration/region limits, which affect how much work an MCP tool call can safely do per invocation.
- Whether a real Neon database migration history exists beyond what's implied by `schema.prisma` (no `prisma/migrations/` folder was present in this ZIP) — the next developer should run `npx prisma migrate status` against the real database before adding new models (e.g. `McpApiToken`) to confirm the current migration baseline.

---

**Audit complete — ready for implementation.**
