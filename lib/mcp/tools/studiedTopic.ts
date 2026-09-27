/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  getAuthedUserId,
  jsonResult,
  errorResult,
} from "@/lib/mcp/helpers";

export function registerStudiedTopicTools(server: any) {
  server.tool(
    "save_studied_topic",
    "Save a topic studied with ChatGPT into the user's GATE tracker. Find or create the subject and topic, avoiding duplicates.",
    {
      subjectName: z.string().min(1).max(200),
      topicName: z.string().min(1).max(200),
      completed: z.boolean().optional().default(false),
      notes: z.string().max(10000).optional(),
    },
    async (
      args: {
        subjectName: string;
        topicName: string;
        completed?: boolean;
        notes?: string;
      },
      extra: any
    ) => {
      try {
        const userId = getAuthedUserId(extra);

        if (!userId) {
          return errorResult("Unauthorized");
        }

        const subject = await prisma.subject.upsert({
          where: {
            userId_name: {
              userId,
              name: args.subjectName.trim(),
            },
          },
          update: {},
          create: {
            userId,
            name: args.subjectName.trim(),
          },
        });

        const existingTopic = await prisma.topic.findFirst({
          where: {
            userId,
            subjectId: subject.id,
            name: args.topicName.trim(),
          },
        });

        const topic = existingTopic
          ? await prisma.topic.update({
              where: {
                id: existingTopic.id,
              },
              data: {
                completed:
                  args.completed !== undefined
                    ? args.completed
                    : existingTopic.completed,
                ...(args.notes ? { notes: args.notes } : {}),
              },
            })
          : await prisma.topic.create({
              data: {
                userId,
                subjectId: subject.id,
                name: args.topicName.trim(),
                completed: args.completed ?? false,
                notes: args.notes,
              },
            });

        return jsonResult({
          success: true,
          subject: {
            id: subject.id,
            name: subject.name,
          },
          topic: {
            id: topic.id,
            name: topic.name,
            completed: topic.completed,
          },
          action: existingTopic ? "updated" : "created",
        });
      } catch (error) {
        console.error("[mcp] save_studied_topic failed:", error);
        return errorResult("Failed to save studied topic");
      }
    }
  );
}