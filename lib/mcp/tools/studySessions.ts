import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/db/prisma";
import { addStudySeconds } from "@/lib/db/dailyProgress";
import { APP_TIMEZONE } from "@/lib/utils/date";
import { jsonResult, errorResult, getAuthedUserId } from "@/lib/mcp/helpers";

export function registerStudySessionTools(server: McpServer) {
  server.registerTool(
    "get_study_sessions",
    {
      title: "List study sessions",
      description: "Lists recent study-timer sessions, most recent first. Mirrors GET /api/study-sessions.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (default 30, max 100)."),
      },
    },
    async ({ limit }, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const sessions = await prisma.studySession.findMany({
        where: { userId },
        orderBy: { startTime: "desc" },
        take: Math.min(100, limit || 30),
      });
      return jsonResult({ sessions });
    }
  );

  // The in-app UI drives StudySession via a two-step start/stop timer flow
  // (POST /api/study-sessions, then PATCH .../[id]). For an MCP/chat client,
  // a single "I just studied for N minutes" call is a much more natural fit
  // than asking ChatGPT to hold open a "start" call across turns and remember
  // to send a matching "stop" later, so record_study_session logs one
  // already-completed session per call. It still writes the exact same
  // StudySession fields and calls addStudySeconds exactly like the stop
  // route, so DailyProgress/streaks stay in sync either way.
  server.registerTool(
    "record_study_session",
    {
      title: "Record a completed study session",
      description:
        "Logs one already-completed study session (e.g. \"I studied Operating Systems for 45 minutes just now\") and updates that day's study-time/streak counters. Note: StudySession.topicName is a free-text label, not a topic id - pass the topic's name as plain text, not update_topic_progress's topicId.",
      inputSchema: {
        durationMinutes: z.number().positive().max(1440).describe("How long the session lasted, in minutes."),
        subjectId: z.string().optional().nullable().describe("Subject this session was for, if any."),
        topicName: z
          .string()
          .max(200)
          .optional()
          .nullable()
          .describe("Free-text topic label for this session (StudySession has no topicId FK)."),
        endedAt: z
          .string()
          .datetime()
          .optional()
          .describe("ISO timestamp the session ended. Defaults to now."),
      },
    },
    async ({ durationMinutes, subjectId, topicName, endedAt }, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      if (subjectId) {
        const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId } });
        if (!subject) return errorResult("Invalid subjectId: no such subject.");
      }

      const durationSeconds = Math.round(durationMinutes * 60);
      const endTime = endedAt ? new Date(endedAt) : new Date();
      if (Number.isNaN(endTime.getTime())) return errorResult("Invalid endedAt timestamp.");
      const startTime = new Date(endTime.getTime() - durationSeconds * 1000);

      const session = await prisma.studySession.create({
        data: {
          userId,
          subjectId: subjectId || null,
          topicName: topicName || null,
          startTime,
          endTime,
          duration: durationSeconds,
        },
      });

      const dateKey = formatInTimeZone(startTime, APP_TIMEZONE, "yyyy-MM-dd");
      await addStudySeconds(userId, dateKey, durationSeconds);

      return jsonResult({ session });
    }
  );
}
