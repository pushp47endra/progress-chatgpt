import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getUserFromMcpToken, McpRateLimitError } from "@/lib/mcp/auth";
import { registerDashboardTools } from "@/lib/mcp/tools/dashboard";
import { registerSubjectTools } from "@/lib/mcp/tools/subjects";
import { registerTopicTools } from "@/lib/mcp/tools/topics";
import { registerQuestionTools } from "@/lib/mcp/tools/questions";
import { registerQuestionAttemptTools } from "@/lib/mcp/tools/questionAttempts";
import { registerMistakeTools } from "@/lib/mcp/tools/mistakes";
import { registerNoteTools } from "@/lib/mcp/tools/notes";
import { registerStudyTaskTools } from "@/lib/mcp/tools/studyTasks";
import { registerStudySessionTools } from "@/lib/mcp/tools/studySessions";
import { registerAnalyticsTools } from "@/lib/mcp/tools/analytics";

/**
 * The GATE AI MCP server, exposed to ChatGPT (or any MCP client) over
 * Streamable HTTP at POST/GET/DELETE /api/mcp.
 *
 * Architecture:
 *   ChatGPT (MCP client)
 *     -> HTTPS, Authorization: Bearer <mcp-token>
 *     -> this route (createMcpHandler, wrapped in withMcpAuth)
 *     -> lib/mcp/tools/* (same Prisma/zod logic as the REST API)
 *     -> Prisma -> Neon PostgreSQL
 *
 * This route deliberately runs on Vercel's default Next.js (Node.js)
 * serverless runtime, not the Edge runtime, because every tool handler needs
 * Prisma, and Prisma cannot run on the Edge runtime. Each invocation is
 * stateless: createMcpHandler builds a brand-new McpServer per request and
 * calls the function below to register tools on it. No user identity is
 * ever bound at this registration step - every tool handler instead reads
 * `extra.authInfo.extra.userId` at call time (via getAuthedUserId in
 * lib/mcp/helpers.ts), which withMcpAuth populates below from the resolved
 * bearer token. This is required, not optional: since a single deployed
 * McpServer instance could in principle serve tool calls for different
 * requests/users, closing over a userId at registration time would let one
 * user's request see another user's bound identity.
 */
const handler = createMcpHandler(
  (server: McpServer) => {
    registerDashboardTools(server);
    registerSubjectTools(server);
    registerTopicTools(server);
    registerQuestionTools(server);
    registerQuestionAttemptTools(server);
    registerMistakeTools(server);
    registerNoteTools(server);
    registerStudyTaskTools(server);
    registerStudySessionTools(server);
    registerAnalyticsTools(server);
  },
  {
    // Server metadata advertised during MCP initialization/handshake.
    serverInfo: {
      name: "gate-ai-tracker",
      version: "1.0.0",
    },
  },
  {
    // No Redis URL configured -> mcp-handler runs in stateless mode (no
    // resumable SSE sessions across invocations), which is exactly right
    // for Vercel serverless functions that share no in-memory state.
    // NOTE: this route is mounted at a fixed path (app/api/mcp/route.ts),
    // not the `app/[transport]/route.ts` pattern some mcp-handler examples
    // use, so there is a single Streamable HTTP endpoint at /api/mcp with
    // no separate SSE fallback route - correct for ChatGPT's MCP connector,
    // which speaks Streamable HTTP. Re-verify this config object's accepted
    // keys against the installed mcp-handler version's type defs once
    // `npm install` can actually run (see STAGE3_STATUS.md) - it was not
    // possible to confirm against the live package in this environment.
    maxDuration: 60,
    verboseLogs: false,
  }
);

/**
 * withMcpAuth wraps the handler above so every request is authenticated
 * before any tool runs. It reads the `Authorization: Bearer <token>` header
 * itself; we only need to verify the token and return an AuthInfo-shaped
 * object (or undefined to reject with 401).
 *
 * The resolved `userId` is placed under `extra.userId` (not top-level) so it
 * arrives at each tool callback as `extra.authInfo.extra.userId` - the exact
 * shape lib/mcp/helpers.ts:getAuthedUserId expects, confirmed against
 * mcp-handler@1.1.0 / SDK 1.26.0's compiled source (see STAGE2_STATUS.md).
 *
 * IMPORTANT: never trust a client-supplied userId anywhere else - this is
 * the one and only place `userId` is established, always derived from the
 * verified bearer token, never from request body/args.
 */
const authenticatedHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    try {
      const result = await getUserFromMcpToken(bearerToken);
      if (!result) return undefined; // withMcpAuth turns this into 401

      return {
        token: bearerToken as string,
        clientId: result.user.id,
        scopes: [],
        extra: { userId: result.user.id },
      };
    } catch (err) {
      if (err instanceof McpRateLimitError) {
        // withMcpAuth has no first-class 429 path for a verifyToken throw,
        // so we surface it the same way as an auth failure (401) but with a
        // distinguishable, non-secret log line. ChatGPT/ MCP clients treat
        // both as "cannot proceed right now" and should back off/retry.
        console.error("[mcp] rate limit exceeded for a token");
        return undefined;
      }
      // Never log the raw token or the Authorization header.
      console.error("[mcp] token verification failed:", err instanceof Error ? err.message : err);
      return undefined;
    }
  },
  {
    required: true,
  }
);

export { authenticatedHandler as GET, authenticatedHandler as POST, authenticatedHandler as DELETE };

// --- Vercel route segment config ---
// Prisma cannot run on the Edge runtime, so this route must use the default
// Node.js runtime (explicit here so it can never be accidentally switched to
// "edge" by an unrelated change elsewhere in the file).
export const runtime = "nodejs";
// MCP requests are per-call RPCs against live data, never a cacheable GET -
// force Next.js to treat every request as dynamic rather than attempting to
// statically optimize/cache the route.
export const dynamic = "force-dynamic";
// Matches the maxDuration passed to createMcpHandler above. On Vercel Hobby
// this is capped at 10s regardless of this value; Pro/Enterprise plans can
// use up to 60s (or more, per plan) - set your actual plan's ceiling here.
export const maxDuration = 60;
