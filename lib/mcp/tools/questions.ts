import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/db/prisma";
import { createQuestionSchema, questionStatusEnum } from "@/lib/validation/schemas";
import { jsonResult, errorResult, getAuthedUserId } from "@/lib/mcp/helpers";

export function registerQuestionTools(server: McpServer) {
  server.registerTool(
    "get_questions",
    {
      title: "List questions",
      description:
        "Lists questions from the question bank, with optional status/subject filters and text search, paginated 25 at a time. Mirrors GET /api/questions.",
      inputSchema: {
        status: questionStatusEnum.optional().describe("Filter by question status."),
        subjectId: z.string().optional().describe("Filter to a single subject id."),
        q: z.string().max(200).optional().describe("Case-insensitive search within questionText."),
        page: z.number().int().min(1).optional().describe("1-indexed page number (25 per page)."),
      },
    },
    async ({ status, subjectId, q, page }, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const pageNum = Math.max(1, page || 1);
      const pageSize = 25;

      const where: Record<string, unknown> = { userId };
      if (status) where.status = status;
      if (subjectId) where.subjectId = subjectId;
      if (q) where.questionText = { contains: q, mode: "insensitive" };

      const [questions, total] = await Promise.all([
        prisma.question.findMany({
          where,
          include: { subject: true, topic: true },
          orderBy: { date: "desc" },
          skip: (pageNum - 1) * pageSize,
          take: pageSize,
        }),
        prisma.question.count({ where }),
      ]);

      return jsonResult({ questions, total, page: pageNum, pageSize });
    }
  );

  server.registerTool(
    "create_question",
    {
      title: "Create a question",
      description:
        "Adds a new question to the question bank. Mirrors POST /api/questions. subjectId/topicId, if given, must belong to you.",
      inputSchema: createQuestionSchema.shape,
    },
    async (body, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const parsed = createQuestionSchema.safeParse(body);
      if (!parsed.success) return errorResult(`Invalid question data: ${parsed.error.message}`);
      const d = parsed.data;

      if (d.subjectId) {
        const subject = await prisma.subject.findFirst({ where: { id: d.subjectId, userId } });
        if (!subject) return errorResult("Invalid subjectId: no such subject.");
      }
      if (d.topicId) {
        const topic = await prisma.topic.findFirst({ where: { id: d.topicId, userId } });
        if (!topic) return errorResult("Invalid topicId: no such topic.");
      }

      const question = await prisma.question.create({
        data: {
          userId,
          subjectId: d.subjectId || null,
          topicId: d.topicId || null,
          questionText: d.questionText,
          difficulty: d.difficulty ?? "medium",
          source: d.source || null,
          userAnswer: d.userAnswer || null,
          correctAnswer: d.correctAnswer || null,
          explanation: d.explanation || null,
          status: d.status ?? "not_attempted",
        },
      });

      return jsonResult({ question });
    }
  );

  server.registerTool(
    "record_question_attempt",
    {
      title: "Record a question attempt",
      description:
        "Records an attempt at an existing question: updates the Question's status (to correct/incorrect) and userAnswer, AND creates the corresponding QuestionAttempt row - replicating both writes that PATCH /api/questions/[id] performs as a side effect when status flips to correct/incorrect. Use this instead of any other way of logging a question result, so the question's status and its attempt history never drift apart.",
      inputSchema: {
        questionId: z.string().min(1).describe("The id of the question that was attempted."),
        isCorrect: z.boolean().describe("Whether the attempt was correct."),
        answer: z
          .string()
          .max(5000)
          .optional()
          .describe("The answer given for this attempt. Defaults to the question's existing userAnswer if omitted."),
      },
    },
    async ({ questionId, isCorrect, answer }, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const existing = await prisma.question.findFirst({ where: { id: questionId, userId } });
      if (!existing) return errorResult("Question not found.");

      const status = isCorrect ? "correct" : "incorrect";

      const question = await prisma.question.update({
        where: { id: questionId },
        data: {
          status,
          ...(answer !== undefined ? { userAnswer: answer || null } : {}),
        },
      });

      const attempt = await prisma.questionAttempt.create({
        data: {
          userId,
          questionId: question.id,
          isCorrect,
          answer: answer !== undefined ? answer || null : existing.userAnswer,
        },
      });

      return jsonResult({ question, attempt });
    }
  );
}
