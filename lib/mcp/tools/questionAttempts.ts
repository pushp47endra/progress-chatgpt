import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/db/prisma";
import { jsonResult, errorResult, getAuthedUserId } from "@/lib/mcp/helpers";

// There is no existing dedicated REST route for QuestionAttempt reads (see
// MCP_AUDIT.md Section 7); this is a new read-only query following the same
// `where: { userId }` ownership-scoping pattern used everywhere else.
export function registerQuestionAttemptTools(server: McpServer) {
  server.registerTool(
    "get_question_attempts",
    {
      title: "List question attempts",
      description:
        "Lists recorded question attempts (created by record_question_attempt), optionally filtered to a single question, most recent first.",
      inputSchema: {
        questionId: z.string().optional().describe("Only return attempts for this question id."),
        limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
      },
    },
    async ({ questionId, limit }, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const attempts = await prisma.questionAttempt.findMany({
        where: { userId, ...(questionId ? { questionId } : {}) },
        include: { question: { select: { id: true, questionText: true } } },
        orderBy: { createdAt: "desc" },
        take: Math.min(200, limit || 50),
      });
      return jsonResult({ attempts });
    }
  );
}
