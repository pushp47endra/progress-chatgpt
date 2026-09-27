import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createTopicSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const subjectId = searchParams.get("subjectId");

  const topics = await prisma.topic.findMany({
    where: { userId: user.id, ...(subjectId ? { subjectId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ topics });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createTopicSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid topic data." }, { status: 400 });

  const subject = await prisma.subject.findFirst({
    where: { id: parsed.data.subjectId, userId: user.id },
  });
  if (!subject) return NextResponse.json({ error: "Invalid subject." }, { status: 400 });

  const topic = await prisma.topic.create({
    data: {
      userId: user.id,
      subjectId: parsed.data.subjectId,
      name: parsed.data.name,
      priority: parsed.data.priority ?? "medium",
      estimatedTime: parsed.data.estimatedTime ?? null,
      questionTarget: parsed.data.questionTarget ?? null,
      notes: parsed.data.notes || null,
    },
  });
  return NextResponse.json({ topic }, { status: 201 });
}