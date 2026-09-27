import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createTaskSchema } from "@/lib/validation/schemas";
import { adjustTaskCounts } from "@/lib/db/dailyProgress";
import { dateKeyToDate } from "@/lib/utils/date";

// GET /api/study-tasks
//   ?date=yyyy-MM-dd            -> tasks for a single day (Day view)
//   ?from=yyyy-MM-dd&to=yyyy-MM-dd -> tasks in an inclusive date range (Week/Month views)
//   ?all=1                      -> every task, no date filter (List view)
//   (no params)                 -> defaults to today
// Optional filters: subjectId, completed=true|false (used by List view).
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const all = searchParams.get("all");
  const subjectId = searchParams.get("subjectId");
  const completed = searchParams.get("completed");

  const where: Record<string, unknown> = { userId: user.id };

  if (date) {
    where.date = dateKeyToDate(date);
  } else if (from && to) {
    where.date = { gte: dateKeyToDate(from), lte: dateKeyToDate(to) };
  } else if (!all) {
    where.date = dateKeyToDate(format(new Date(), "yyyy-MM-dd"));
  }

  if (subjectId) where.subjectId = subjectId;
  if (completed === "true") where.completed = true;
  if (completed === "false") where.completed = false;

  const tasks = await prisma.studyTask.findMany({
    where,
    include: { subject: true, topic: true },
    orderBy: [{ date: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid task data." }, { status: 400 });
  const d = parsed.data;

  // Ownership checks - a subject/topic id from another user must never be attachable.
  if (d.subjectId) {
    const subject = await prisma.subject.findFirst({ where: { id: d.subjectId, userId: user.id } });
    if (!subject) return NextResponse.json({ error: "Invalid subject." }, { status: 400 });
  }
  if (d.topicId) {
    const topic = await prisma.topic.findFirst({ where: { id: d.topicId, userId: user.id } });
    if (!topic) return NextResponse.json({ error: "Invalid topic." }, { status: 400 });
  }

  const task = await prisma.studyTask.create({
    data: {
      userId: user.id,
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

  await adjustTaskCounts(user.id, d.date, 0, 1);

  return NextResponse.json({ task }, { status: 201 });
}
