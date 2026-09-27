import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { updateTaskSchema } from "@/lib/validation/schemas";
import { adjustTaskCounts } from "@/lib/db/dailyProgress";
import { dateKeyToDate } from "@/lib/utils/date";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await prisma.studyTask.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid data." }, { status: 400 });
  const d = parsed.data;

  if (d.subjectId) {
    const subject = await prisma.subject.findFirst({ where: { id: d.subjectId, userId: user.id } });
    if (!subject) return NextResponse.json({ error: "Invalid subject." }, { status: 400 });
  }
  if (d.topicId) {
    const topic = await prisma.topic.findFirst({ where: { id: d.topicId, userId: user.id } });
    if (!topic) return NextResponse.json({ error: "Invalid topic." }, { status: 400 });
  }

  const existingDateKey = format(existing.date, "yyyy-MM-dd");
  const newDateKey = d.date ?? existingDateKey;
  const newCompleted = d.completed ?? existing.completed;

  const task = await prisma.studyTask.update({
    where: { id: params.id },
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

  // Keep the DailyProgress counters (used by the dashboard/analytics) in sync
  // whenever a task moves to a different day or its completion state flips.
  if (newDateKey !== existingDateKey) {
    await adjustTaskCounts(user.id, existingDateKey, existing.completed ? -1 : 0, -1);
    await adjustTaskCounts(user.id, newDateKey, newCompleted ? 1 : 0, 1);
  } else if (newCompleted !== existing.completed) {
    await adjustTaskCounts(user.id, existingDateKey, newCompleted ? 1 : -1, 0);
  }

  return NextResponse.json({ task });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await prisma.studyTask.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  await prisma.studyTask.delete({ where: { id: params.id } });

  const dateKey = format(existing.date, "yyyy-MM-dd");
  await adjustTaskCounts(user.id, dateKey, existing.completed ? -1 : 0, -1);

  return NextResponse.json({ ok: true });
}
