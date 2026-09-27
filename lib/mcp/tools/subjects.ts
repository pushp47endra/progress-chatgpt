import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/db/prisma";
import { jsonResult, errorResult, getAuthedUserId } from "@/lib/mcp/helpers";

// Reuses the exact enrichment logic from GET /api/subjects.
async function getEnrichedSubjects(userId: string) {
  const subjects = await prisma.subject.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  return Promise.all(
    subjects.map(async (s) => {
      const [totalTopics, completedTopics, questionsAttempted, questionsSolved, studyAgg] =
        await Promise.all([
          prisma.topic.count({ where: { subjectId: s.id } }),
          prisma.topic.count({ where: { subjectId: s.id, completed: true } }),
          prisma.question.count({
            where: { subjectId: s.id, status: { in: ["attempted", "correct", "incorrect"] } },
          }),
          prisma.question.count({ where: { subjectId: s.id, status: "correct" } }),
          prisma.studySession.aggregate({ where: { subjectId: s.id }, _sum: { duration: true } }),
        ]);

      const remainingTopics = totalTopics - completedTopics;
      const completionPct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
      const accuracy =
        questionsAttempted > 0 ? Math.round((questionsSolved / questionsAttempted) * 100) : 0;

      return {
        ...s,
        totalTopics,
        completedTopics,
        remainingTopics,
        completionPct,
        questionsAttempted,
        questionsSolved,
        accuracy,
        studySeconds: studyAgg._sum.duration || 0,
      };
    })
  );
}

export function registerSubjectTools(server: McpServer) {
  server.registerTool(
    "get_subjects",
    {
      title: "List subjects",
      description:
        "Lists every subject in the tracker, each enriched with topic completion counts, question accuracy, and total study time - the same data shown on the Subjects page. Takes no parameters.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const subjects = await getEnrichedSubjects(userId);
      return jsonResult({ subjects });
    }
  );
}
