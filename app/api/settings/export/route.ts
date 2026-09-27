import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [
    conversations,
    subjects,
    topics,
    studyTasks,
    questions,
    mistakes,
    notes,
    studySessions,
    dailyProgress,
  ] = await Promise.all([
    prisma.conversation.findMany({ where: { userId: user.id }, include: { messages: true } }),
    prisma.subject.findMany({ where: { userId: user.id } }),
    prisma.topic.findMany({ where: { userId: user.id } }),
    prisma.studyTask.findMany({ where: { userId: user.id } }),
    prisma.question.findMany({ where: { userId: user.id } }),
    prisma.mistake.findMany({ where: { userId: user.id } }),
    prisma.note.findMany({ where: { userId: user.id } }),
    prisma.studySession.findMany({ where: { userId: user.id } }),
    prisma.dailyProgress.findMany({ where: { userId: user.id } }),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    username: user.username,
    conversations,
    subjects,
    topics,
    studyTasks,
    questions,
    mistakes,
    notes,
    studySessions,
    dailyProgress,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="gate-ai-export-${user.username}.json"`,
    },
  });
}
