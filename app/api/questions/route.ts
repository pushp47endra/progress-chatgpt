import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createQuestionSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const subjectId = searchParams.get("subjectId");
  const search = searchParams.get("q");
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = 25;

  const where: Record<string, unknown> = { userId: user.id };
  if (status) where.status = status;
  if (subjectId) where.subjectId = subjectId;
  if (search) where.questionText = { contains: search, mode: "insensitive" };

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      include: { subject: true, topic: true },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.question.count({ where }),
  ]);

  return NextResponse.json({ questions, total, page, pageSize });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createQuestionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid question data." }, { status: 400 });
  const d = parsed.data;

  const question = await prisma.question.create({
    data: {
      userId: user.id,
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
  return NextResponse.json({ question }, { status: 201 });
}
