import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { subDays, format } from "date-fns";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const since = subDays(new Date(), 30);

  const [dailyProgress, subjects, questions, mistakesBySubject] = await Promise.all([
    prisma.dailyProgress.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: "asc" },
    }),
    prisma.subject.findMany({
      where: { userId: user.id },
      include: { topics: { select: { completed: true } }, questions: { select: { status: true } } },
    }),
    prisma.question.findMany({
      where: { userId: user.id },
      select: { status: true, date: true },
    }),
    prisma.mistake.groupBy({
      by: ["subjectId"],
      where: { userId: user.id },
      _count: { subjectId: true },
    }),
  ]);

  const studyTimeByDay = dailyProgress.map((d) => ({
    date: format(d.date, "MMM d"),
    minutes: Math.round(d.studySeconds / 60),
  }));

  const questionsByDay: Record<string, { attempted: number; solved: number }> = {};
  for (const q of questions) {
    if (q.status === "not_attempted") continue;
    const key = format(q.date, "MMM d");
    questionsByDay[key] = questionsByDay[key] || { attempted: 0, solved: 0 };
    questionsByDay[key].attempted++;
    if (q.status === "correct") questionsByDay[key].solved++;
  }

  const subjectCompletion = subjects.map((s) => {
    const total = s.topics.length;
    const done = s.topics.filter((t) => t.completed).length;
    return {
      subject: s.name,
      completionPct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });

  const attempted = questions.filter((q) => q.status !== "not_attempted").length;
  const solved = questions.filter((q) => q.status === "correct").length;
  const overallAccuracy = attempted > 0 ? Math.round((solved / attempted) * 100) : 0;

  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));
  const weakSubjects = mistakesBySubject
    .map((m) => ({
      subject: (m.subjectId && subjectNameById.get(m.subjectId)) || "General",
      mistakes: m._count.subjectId,
    }))
    .sort((a, b) => b.mistakes - a.mistakes)
    .slice(0, 5);

  return NextResponse.json({
    studyTimeByDay,
    questionsByDay: Object.entries(questionsByDay).map(([date, v]) => ({ date, ...v })),
    subjectCompletion,
    overallAccuracy,
    weakSubjects,
  });
}
