import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createSubjectSchema } from "@/lib/validation/schemas";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const subjects = await prisma.subject.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  const enriched = await Promise.all(
    subjects.map(async (s) => {
      const [totalTopics, completedTopics, questionsAttempted, questionsSolved, studyAgg] =
        await Promise.all([
          prisma.topic.count({ where: { subjectId: s.id } }),
          prisma.topic.count({ where: { subjectId: s.id, completed: true } }),
          prisma.question.count({
            where: { subjectId: s.id, status: { in: ["attempted", "correct", "incorrect"] } },
          }),
          prisma.question.count({ where: { subjectId: s.id, status: "correct" } }),
          prisma.studySession.aggregate({ where: { subjectId: s.id }, _sum: { duration: true } }),
        ]);

      const remainingTopics = totalTopics - completedTopics;
      const completionPct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
      const accuracy =
        questionsAttempted > 0 ? Math.round((questionsSolved / questionsAttempted) * 100) : 0;

      return {
        ...s,
        totalTopics,
        completedTopics,
        remainingTopics,
        completionPct,
        questionsAttempted,
        questionsSolved,
        accuracy,
        studySeconds: studyAgg._sum.duration || 0,
      };
    })
  );

  return NextResponse.json({ subjects: enriched });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSubjectSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid subject data." }, { status: 400 });

  const subject = await prisma.subject.create({
    data: { userId: user.id, name: parsed.data.name },
  });

  return NextResponse.json({ subject }, { status: 201 });
}
