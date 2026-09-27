import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { RevisionStatus } from "@prisma/client";
import { createMistakeSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const revisionStatus = searchParams.get("revisionStatus");
  const subjectId = searchParams.get("subjectId");

  const mistakes = await prisma.mistake.findMany({
    where: {
      userId: user.id,
      ...(revisionStatus
    ? { revisionStatus: revisionStatus as RevisionStatus }
    : {}),
      ...(subjectId ? { subjectId } : {}),
    },
    include: { subject: true, topic: true },
    orderBy: { date: "desc" },
  });

  // Weak topics: topics with the most unmastered mistakes.
  const weakTopicsRaw = await prisma.mistake.groupBy({
    by: ["topicId"],
    where: { userId: user.id, topicId: { not: null }, revisionStatus: { not: "mastered" } },
    _count: { topicId: true },
    orderBy: { _count: { topicId: "desc" } },
    take: 5,
  });
  const topicIds = weakTopicsRaw.map((w) => w.topicId).filter(Boolean) as string[];
  const topics = await prisma.topic.findMany({ where: { id: { in: topicIds } } });
  const weakTopics = weakTopicsRaw.map((w) => ({
    topic: topics.find((t) => t.id === w.topicId)?.name || "Unknown",
    count: w._count.topicId,
  }));

  return NextResponse.json({ mistakes, weakTopics });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createMistakeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid mistake data." }, { status: 400 });
  const d = parsed.data;

  const mistake = await prisma.mistake.create({
    data: {
      userId: user.id,
      subjectId: d.subjectId || null,
      topicId: d.topicId || null,
      question: d.question,
      myAnswer: d.myAnswer || null,
      correctAnswer: d.correctAnswer || null,
      whyWrong: d.whyWrong || null,
      correctConcept: d.correctConcept || null,
      revisionStatus: d.revisionStatus ?? "not_revised",
    },
  });
  return NextResponse.json({ mistake }, { status: 201 });
}
