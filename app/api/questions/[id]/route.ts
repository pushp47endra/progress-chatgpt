import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { updateQuestionSchema } from "@/lib/validation/schemas";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await prisma.question.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Question not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateQuestionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid data." }, { status: 400 });
  const d = parsed.data;

  const question = await prisma.question.update({
    where: { id: params.id },
    data: {
      ...(d.subjectId !== undefined ? { subjectId: d.subjectId || null } : {}),
      ...(d.topicId !== undefined ? { topicId: d.topicId || null } : {}),
      ...(d.questionText ? { questionText: d.questionText } : {}),
      ...(d.difficulty ? { difficulty: d.difficulty } : {}),
      ...(d.source !== undefined ? { source: d.source || null } : {}),
      ...(d.userAnswer !== undefined ? { userAnswer: d.userAnswer || null } : {}),
      ...(d.correctAnswer !== undefined ? { correctAnswer: d.correctAnswer || null } : {}),
      ...(d.explanation !== undefined ? { explanation: d.explanation || null } : {}),
      ...(d.status ? { status: d.status } : {}),
    },
  });

  if (d.status === "correct" || d.status === "incorrect") {
    await prisma.questionAttempt.create({
      data: {
        userId: user.id,
        questionId: question.id,
        isCorrect: d.status === "correct",
        answer: d.userAnswer || existing.userAnswer,
      },
    });
  }

  return NextResponse.json({ question });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await prisma.question.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Question not found." }, { status: 404 });

  await prisma.question.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
