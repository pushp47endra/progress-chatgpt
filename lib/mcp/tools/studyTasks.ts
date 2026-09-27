import { z } from "zod";
import { format } from "date-fns";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/db/prisma";
import { createTaskSchema, updateTaskSchema } from "@/lib/validation/schemas";
import { adjustTaskCounts } from "@/lib/db/dailyProgress";
import { dateKeyToDate } from "@/lib/utils/date";
import { jsonResult, errorResult, getAuthedUserId } from "@/lib/mcp/helpers";

export function registerStudyTaskTools(server: McpServer) {
  server.registerTool(
    "get_study_tasks",
    {
      title: "List study tasks",
      description:
        "Lists date-wise study-tracker tasks. Give `date` for a single day, `from`+`to` for an inclusive range, or `all: true` for every task with no date filter; with none of these it defaults to today. Optional subjectId/completed filters. Mirrors GET /api/study-tasks.",
      inputSchema: {
        date: z.string().optional().describe("yyyy-MM-dd. Tasks for a single day."),
        from: z.string().optional().describe("yyyy-MM-dd. Start of an inclusive date range (use with `to`)."),
        to: z.string().optional().describe("yyyy-MM-dd. End of an inclusive date range (use with `from`)."),
        all: z.boolean().optional().describe("If true, return every task with no date filter."),
        subjectId: z.string().optional(),
        completed: z.boolean().optional(),
      },
    },
    async ({ date, from, to, all, subjectId, completed }, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const where: Record<string, unknown> = { userId };

      if (date) {
        where.date = dateKeyToDate(date);
      } else if (from && to) {
        where.date = { gte: dateKeyToDate(from), lte: dateKeyToDate(to) };
      } else if (!all) {
        where.date = dateKeyToDate(format(new Date(), "yyyy-MM-dd"));
      }

      if (subjectId) where.subjectId = subjectId;
      if (completed !== undefined) where.completed = completed;

      const tasks = await prisma.studyTask.findMany({
        where,
        include: { subject: true, topic: true },
        orderBy: [{ date: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
      });
      return jsonResult({ tasks });
    }
  );

  server.registerTool(
    "create_study_task",
    {
      title: "Create a study task",
      description:
        "Adds a new task to the date-wise study tracker for a given date, and updates that day's DailyProgress counters. Mirrors POST /api/study-tasks.",
      inputSchema: createTaskSchema.shape,
    },
    async (body, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const parsed = createTaskSchema.safeParse(body);
      if (!parsed.success) return errorResult(`Invalid task data: ${parsed.error.message}`);
      const d = parsed.data;

      if (d.subjectId) {
        const subject = await prisma.subject.findFirst({ where: { id: d.subjectId, userId } });
        if (!subject) return errorResult("Invalid subjectId: no such subject.");
      }
      if (d.topicId) {
        const topic = await prisma.topic.findFirst({ where: { id: d.topicId, userId } });
        if (!topic) return errorResult("Invalid topicId: no such topic.");
      }

      const task = await prisma.studyTask.create({
        data: {
          userId,
          date: dateKeyToDate(d.date),
          subjectId: d.subjectId || null,
          topicId: d.topicId || null,
          subtopic: d.subtopic || null,
          estimatedTime: d.estimatedTime ?? null,
          priority: d.priority ?? "medium",
          difficulty: d.difficulty ?? "medium",
          questionTarget: d.questionTarget ?? null,
          notes: d.notes || null,
        },
        include: { subject: true, topic: true },
      });

      await adjustTaskCounts(userId, d.date, 0, 1);

      return jsonResult({ task });
    }
  );

  server.registerTool(
    "update_study_task",
    {
      title: "Update a study task",
      description:
        "Updates an existing study task (any field, including moving it to a different date or toggling `completed`), keeping the DailyProgress tasksDone/tasksTotal counters for the affected day(s) in sync exactly as PATCH /api/study-tasks/[id] does. Only fields you supply are changed.",
      inputSchema: {
        taskId: z.string().min(1).describe("The id of the study task to update."),
        ...updateTaskSchema.shape,
      },
    },
    async ({ taskId, ...body }, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const existing = await prisma.studyTask.findFirst({ where: { id: taskId, userId } });
      if (!existing) return errorResult("Study task not found.");

      const parsed = updateTaskSchema.safeParse(body);
      if (!parsed.success) return errorResult(`Invalid data: ${parsed.error.message}`);
      const d = parsed.data;

      if (d.subjectId) {
        const subject = await prisma.subject.findFirst({ where: { id: d.subjectId, userId } });
        if (!subject) return errorResult("Invalid subjectId: no such subject.");
      }
      if (d.topicId) {
        const topic = await prisma.topic.findFirst({ where: { id: d.topicId, userId } });
        if (!topic) return errorResult("Invalid topicId: no such topic.");
      }

      const existingDateKey = format(existing.date, "yyyy-MM-dd");
      const newDateKey = d.date ?? existingDateKey;
      const newCompleted = d.completed ?? existing.completed;

      const task = await prisma.studyTask.update({
        where: { id: taskId },
        data: {
          ...(d.date ? { date: dateKeyToDate(d.date) } : {}),
          ...(d.subjectId !== undefined ? { subjectId: d.subjectId || null } : {}),
          ...(d.topicId !== undefined ? { topicId: d.topicId || null } : {}),
          ...(d.subtopic !== undefined ? { subtopic: d.subtopic || null } : {}),
          ...(d.estimatedTime !== undefined ? { estimatedTime: d.estimatedTime } : {}),
          ...(d.priority ? { priority: d.priority } : {}),
          ...(d.difficulty ? { difficulty: d.difficulty } : {}),
          ...(d.questionTarget !== undefined ? { questionTarget: d.questionTarget } : {}),
          ...(d.notes !== undefined ? { notes: d.notes } : {}),
          ...(d.completed !== undefined
            ? { completed: d.completed, completedAt: d.completed ? new Date() : null }
            : {}),
        },
        include: { subject: true, topic: true },
      });

      if (newDateKey !== existingDateKey) {
        await adjustTaskCounts(userId, existingDateKey, existing.completed ? -1 : 0, -1);
        await adjustTaskCounts(userId, newDateKey, newCompleted ? 1 : 0, 1);
      } else if (newCompleted !== existing.completed) {
        await adjustTaskCounts(userId, existingDateKey, newCompleted ? 1 : -1, 0);
      }

      return jsonResult({ task });
    }
  );
}
