import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/db/prisma";
import { updateTopicSchema } from "@/lib/validation/schemas";
import { jsonResult, errorResult, getAuthedUserId } from "@/lib/mcp/helpers";

export function registerTopicTools(server: McpServer) {
  server.registerTool(
    "get_topics",
    {
      title: "List topics",
      description:
        "Lists topics, optionally filtered to a single subject. Mirrors GET /api/topics.",
      inputSchema: {
        subjectId: z
          .string()
          .optional()
          .describe("Only return topics belonging to this subject id."),
      },
    },
    async ({ subjectId }, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const topics = await prisma.topic.findMany({
        where: { userId, ...(subjectId ? { subjectId } : {}) },
        orderBy: { createdAt: "asc" },
      });
      return jsonResult({ topics });
    }
  );

  server.registerTool(
    "update_topic_progress",
    {
      title: "Update topic progress",
      description:
        "Updates a topic's name, priority, estimated time, question target, notes, and/or completion state. Mirrors PATCH /api/topics/[id]. Only fields you supply are changed.",
      inputSchema: {
        topicId: z.string().min(1).describe("The id of the topic to update."),
        ...updateTopicSchema.shape,
      },
    },
    async ({ topicId, ...body }, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const existing = await prisma.topic.findFirst({ where: { id: topicId, userId } });
      if (!existing) return errorResult("Topic not found.");

      const parsed = updateTopicSchema.safeParse(body);
      if (!parsed.success) return errorResult(`Invalid data: ${parsed.error.message}`);
      const d = parsed.data;

      const topic = await prisma.topic.update({
        where: { id: topicId },
        data: {
          ...(d.name ? { name: d.name } : {}),
          ...(d.priority ? { priority: d.priority } : {}),
          ...(d.estimatedTime !== undefined ? { estimatedTime: d.estimatedTime } : {}),
          ...(d.questionTarget !== undefined ? { questionTarget: d.questionTarget } : {}),
          ...(d.notes !== undefined ? { notes: d.notes } : {}),
          ...(d.completed !== undefined ? { completed: d.completed } : {}),
        },
      });

      return jsonResult({ topic });
    }
  );
}
