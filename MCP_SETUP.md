# MCP_SETUP.md — Connecting GATE AI Tracker to ChatGPT via MCP

This document explains the MCP (Model Context Protocol) integration that lets
ChatGPT read and write your GATE AI tracker data directly. Read this before
issuing a token or connecting ChatGPT.

---

## 1. Architecture

```
ChatGPT (MCP client)
   │  HTTPS, Authorization: Bearer <mcp-token>
   ▼
POST/GET/DELETE /api/mcp   (this Next.js app, on Vercel)
   │  withMcpAuth resolves the token -> userId (lib/mcp/auth.ts)
   ▼
lib/mcp/tools/*.ts   (same Prisma + zod logic as the existing REST API)
   │
   ▼
Prisma  ->  Neon PostgreSQL   (same database, same tables)
```

The website itself stays on Vercel, unchanged. The MCP server is **not** a
separate service — it is one more API route inside this same Next.js app.
There is no OpenAI key anywhere in this project: ChatGPT is the client
connecting *out* to your MCP endpoint; the tracker never calls an LLM API to
serve a tool call.

---

## 2. The MCP endpoint

```
https://<your-vercel-domain>/api/mcp
```

- Transport: **Streamable HTTP** (the current MCP transport; not the older
  HTTP+SSE transport).
- Methods: `GET`, `POST`, `DELETE` — all three are wired to the same
  authenticated handler, matching what the Streamable HTTP transport
  requires (POST for RPC calls, GET for an optional server-initiated stream,
  DELETE to explicitly end a session).
- The route runs stateless per request (no in-memory session state), which
  is required on Vercel serverless functions — every request re-resolves
  identity from its bearer token independently.

---

## 3. Authentication

The tracker uses a **hashed, revocable API token** (not OAuth — see
`MCP_AUDIT.md` Section 5a for the tradeoffs). This is a deliberate v1 choice
appropriate for a single-user personal app.

- Every request must include `Authorization: Bearer <token>`.
- The server hashes the presented token (SHA-256) and looks it up in the
  `McpApiToken` table. A missing, unknown, or revoked token is rejected with
  `401`.
- A per-token rate limit (60 requests/minute) is enforced; requests over the
  limit are rejected.
- The raw token is **never** stored — only its hash. If you lose the raw
  token, revoke it and mint a new one.
- Every tool handler derives `userId` **only** from the verified token
  (`extra.authInfo.extra.userId`) — never from anything in the request body.
  One token cannot be used to read or write another user's data.

### 3.1 Creating a token

Run this locally (or against your deployed database via `vercel env pull`),
**never** from a public route:

```bash
npm run mcp:token -- create
# or, to name it and/or target a specific username explicitly:
npm run mcp:token -- create pushpendra --name "ChatGPT"
```

This prints the raw token **exactly once**:

```
Created MCP token "ChatGPT MCP connector" (id: cl123...) for user "pushpendra".

Raw token (shown ONLY this once - store it now, e.g. in a password manager):

  9f2a1c...            <- 64 hex characters

Use it as: Authorization: Bearer <token above>
```

Copy it immediately into ChatGPT's connector configuration (Section 6) and a
password manager. It cannot be displayed again.

### 3.2 Listing tokens

```bash
npm run mcp:token -- list
```

Shows each token's id, name, creation time, last-used time, and revoked
status — never the raw token itself (only the hash is stored, so it
couldn't be shown even if we wanted to).

### 3.3 Revoking a token

```bash
npm run mcp:token -- revoke <tokenId>
```

Takes effect immediately — the next request with that token gets `401`.
Revoke a token if it may have leaked, or if you're rotating credentials.

---

## 4. Environment variables

**No new environment variables are required for MCP.** The token mechanism
is entirely database-backed (a hash stored in `McpApiToken`), not
env-configured — the same principle as `Session.token`.

The only environment variables this project uses are the ones already
documented in `.env.example`:

| Variable | Required for MCP? | Notes |
|---|---|---|
| `DATABASE_URL` | Yes (already required for the whole app) | MCP tools use the same Prisma client. |
| `INITIAL_ADMIN_USERNAME` | Only for `npm run mcp:token` if you don't pass a username explicitly | Defaults to `pushpendra`, matching `prisma/seed.ts`. |
| `TARGET_EXAM_DATE`, `APP_TIMEZONE` | No | Used by `get_dashboard_progress`/`get_study_tasks` indirectly via existing date utilities; unrelated to auth. |

Do not add an `OPENAI_API_KEY` (or similar) for this feature — it is not
needed and out of scope.

---

## 5. Local testing

1. `npm install`
2. Ensure `.env.local` has a working `DATABASE_URL` (and the user you'll mint
   a token for already exists — run `npm run seed` if not).
3. `npm run mcp:token -- create` and copy the printed token.
4. `npm run dev`
5. Test the endpoint responds and requires auth:
   ```bash
   # Missing token -> expect 401
   curl -i -X POST http://localhost:3000/api/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

   # Valid token -> expect a successful MCP initialize response
   curl -i -X POST http://localhost:3000/api/mcp \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
   ```
6. If the environment has network access to run one, use
   [`mcp-inspector`](https://github.com/modelcontextprotocol/inspector)
   against `http://localhost:3000/api/mcp` with the bearer token to walk
   through tool discovery and call every read/write tool interactively —
   this is the most reliable way to confirm tool schemas and outputs before
   connecting ChatGPT. **This was not run as part of this checkpoint** (see
   `STAGE3_STATUS.md` — no network/registry access was available in the
   implementation environment).

---

## 6. ChatGPT configuration

In ChatGPT's MCP/connector settings, add a connector with:

- **Type**: Streamable HTTP
- **URL**: `https://<your-vercel-domain>/api/mcp`
- **Authentication**: API key / Bearer token — paste the raw token from
  Section 3.1.

ChatGPT will call `initialize`, then `tools/list`, then invoke individual
tools (`get_dashboard_progress`, `create_study_task`, etc.) as needed during
conversation. There is no ChatGPT-side OAuth "Sign in" flow here — that's
Option B from `MCP_AUDIT.md`, not implemented in this v1.

---

## 7. Security notes

- Tokens are SHA-256 hashed before storage; the raw value is shown only once
  and cannot be recovered later.
- Every tool query is scoped by `userId` derived from the verified token —
  the same ownership pattern already used by every REST route
  (`findFirst({ id, userId })` before any update/delete).
- Rate limiting (60 req/min/token) is DB-backed, since Vercel serverless
  functions share no in-memory state between invocations.
- The MCP route bypasses the cookie-presence middleware check (it
  authenticates itself via bearer token), but every other route is
  unaffected.
- Raw tokens and `Authorization` headers are never logged.
- No `DailyProgress` write tool is exposed (it's a derived/cache table) —
  writes go through `create_study_task`/`update_study_task`/
  `record_study_session`, which correctly call `adjustTaskCounts`/
  `addStudySeconds` so the dashboard's streaks/counters stay accurate.

---

## 8. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `401` on every request | Missing/incorrect `Authorization` header, or the token was revoked. Mint a new one with `npm run mcp:token -- create`. |
| `429` / "Too many MCP requests" | Over the 60 req/min/token limit. Wait, or reduce call frequency. |
| ChatGPT can't discover any tools | Confirm the URL is exactly `/api/mcp` (not `/api/mcp/`), and that `middleware.ts`'s MCP bypass matches your deployed path. |
| A tool call errors with "Invalid subjectId/topicId" | The referenced id doesn't belong to the authenticated user (or doesn't exist) — this is the ownership check working correctly, not a bug. |
| Dashboard/streak numbers look wrong after MCP writes | Should not happen if `create_study_task`/`update_study_task`/`record_study_session` are the only write paths used — see Section 7. If it does, check for a bypass of `adjustTaskCounts`/`addStudySeconds`. |
| Build/type errors mentioning `mcp-handler` or `@modelcontextprotocol/sdk` | These packages were added to `package.json` but could not be installed or type-checked in the environment that produced this checkpoint (no network/registry access) — run `npm install` fresh and consult `STAGE3_STATUS.md`. |

---

## 9. What this integration deliberately does NOT do

- No OAuth authorization server (Option A/token, not Option B — see
  `MCP_AUDIT.md` Section 5a).
- No changes to the existing cookie/session-based website login.
- No changes to the existing Luna/Optimizer AI chat feature.
- No new AWS infrastructure — everything runs inside the existing Vercel +
  Neon setup.
- No `OPENAI_API_KEY` or any LLM credential inside this project.
