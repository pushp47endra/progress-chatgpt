import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/db/prisma";
import { RevisionStatus } from "@prisma/client";
import { createMistakeSchema, revisionStatusEnum } from "@/lib/validation/schemas";
import { jsonResult, errorResult, getAuthedUserId } from "@/lib/mcp/helpers";

export function registerMistakeTools(server: McpServer) {
  server.registerTool(
    "get_mistakes",
    {
      title: "List mistakes",
      description:
        "Lists mistake-log entries, optionally filtered by revision status or subject, plus the top 5 weakest topics (most unmastered mistakes). Mirrors GET /api/mistakes.",
      inputSchema: {
        revisionStatus: revisionStatusEnum.optional(),
        subjectId: z.string().optional(),
      },
    },
    async ({ revisionStatus, subjectId }, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const mistakes = await prisma.mistake.findMany({
        where: {
          userId,
          ...(revisionStatus ? { revisionStatus: revisionStatus as RevisionStatus } : {}),
          ...(subjectId ? { subjectId } : {}),
        },
        include: { subject: true, topic: true },
        orderBy: { date: "desc" },
      });

      const weakTopicsRaw = await prisma.mistake.groupBy({
        by: ["topicId"],
        where: { userId, topicId: { not: null }, revisionStatus: { not: "mastered" } },
        _count: { topicId: true },
        orderBy: { _count: { topicId: "desc" } },
        take: 5,
      });
      const topicIds = weakTopicsRaw.map((w) => w.topicId).filter(Boolean) as string[];
      const topics = await prisma.topic.findMany({ where: { id: { in: topicIds } } });
      const weakTopics = weakTopicsRaw.map((w) => ({
        topic: topics.find((t) => t.id === w.topicId)?.name || "Unknown",
        count: w._count.topicId,
      }));

      return jsonResult({ mistakes, weakTopics });
    }
  );

  server.registerTool(
    "create_mistake",
    {
      title: "Log a mistake",
      description: "Adds a new entry to the mistake log. Mirrors POST /api/mistakes.",
      inputSchema: createMistakeSchema.shape,
    },
    async (body, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const parsed = createMistakeSchema.safeParse(body);
      if (!parsed.success) return errorResult(`Invalid mistake data: ${parsed.error.message}`);
      const d = parsed.data;

      if (d.subjectId) {
        const subject = await prisma.subject.findFirst({ where: { id: d.subjectId, userId } });
        if (!subject) return errorResult("Invalid subjectId: no such subject.");
      }
      if (d.topicId) {
        const topic = await prisma.topic.findFirst({ where: { id: d.topicId, userId } });
        if (!topic) return errorResult("Invalid topicId: no such topic.");
      }

      const mistake = await prisma.mistake.create({
        data: {
          userId,
          subjectId: d.subjectId || null,
          topicId: d.topicId || null,
          question: d.question,
          myAnswer: d.myAnswer || null,
          correctAnswer: d.correctAnswer || null,
          whyWrong: d.whyWrong || null,
          correctConcept: d.correctConcept || null,
          revisionStatus: d.revisionStatus ?? "not_revised",
        },
      });
      return jsonResult({ mistake });
    }
  );
}
