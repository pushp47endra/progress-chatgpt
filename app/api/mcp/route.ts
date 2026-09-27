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
import { registerStudiedTopicTools } from "@/lib/mcp/tools/studiedTopic";

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
 * bearer token.
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

    // Allows ChatGPT to save studied subjects/topics into the tracker.
    registerStudiedTopicTools(server);
  },
  {
    serverInfo: {
      name: "gate-ai-tracker",
      version: "1.0.0",
    },
  },
  {
    maxDuration: 60,
    verboseLogs: false,
  }
);

/**
 * withMcpAuth wraps the handler above so every request is authenticated
 * before any tool runs.
 */
const authenticatedHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    try {
      const result = await getUserFromMcpToken(bearerToken);

      if (!result) return undefined;

      return {
        token: bearerToken as string,
        clientId: result.user.id,
        scopes: [],
        extra: { userId: result.user.id },
      };
    } catch (err) {
      if (err instanceof McpRateLimitError) {
        console.error("[mcp] rate limit exceeded for a token");
        return undefined;
      }

      console.error(
        "[mcp] token verification failed:",
        err instanceof Error ? err.message : err
      );

      return undefined;
    }
  },
  {
    required: true,
  }
);

export {
  authenticatedHandler as GET,
  authenticatedHandler as POST,
  authenticatedHandler as DELETE,
};

// --- Vercel route segment config ---

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export const maxDuration = 60;