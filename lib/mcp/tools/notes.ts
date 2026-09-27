import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/db/prisma";
import { createNoteSchema } from "@/lib/validation/schemas";
import { jsonResult, errorResult, getAuthedUserId } from "@/lib/mcp/helpers";

export function registerNoteTools(server: McpServer) {
  server.registerTool(
    "get_notes",
    {
      title: "List notes",
      description:
        "Lists notes, optionally filtered to a subject and/or searched across title, content, and tags. Mirrors GET /api/notes.",
      inputSchema: {
        q: z.string().max(200).optional().describe("Case-insensitive search across title/content/tags."),
        subjectId: z.string().optional(),
      },
    },
    async ({ q, subjectId }, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const notes = await prisma.note.findMany({
        where: {
          userId,
          ...(subjectId ? { subjectId } : {}),
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: "insensitive" } },
                  { content: { contains: q, mode: "insensitive" } },
                  { tags: { has: q } },
                ],
              }
            : {}),
        },
        include: { subject: true, topic: true },
        orderBy: { updatedAt: "desc" },
      });
      return jsonResult({ notes });
    }
  );

  server.registerTool(
    "create_note",
    {
      title: "Create a note",
      description: "Adds a new note. Mirrors POST /api/notes.",
      inputSchema: createNoteSchema.shape,
    },
    async (body, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const parsed = createNoteSchema.safeParse(body);
      if (!parsed.success) return errorResult(`Invalid note data: ${parsed.error.message}`);
      const d = parsed.data;

      if (d.subjectId) {
        const subject = await prisma.subject.findFirst({ where: { id: d.subjectId, userId } });
        if (!subject) return errorResult("Invalid subjectId: no such subject.");
      }
      if (d.topicId) {
        const topic = await prisma.topic.findFirst({ where: { id: d.topicId, userId } });
        if (!topic) return errorResult("Invalid topicId: no such topic.");
      }

      const note = await prisma.note.create({
        data: {
          userId,
          subjectId: d.subjectId || null,
          topicId: d.topicId || null,
          title: d.title,
          content: d.content,
          tags: d.tags || [],
        },
      });
      return jsonResult({ note });
    }
  );
}
