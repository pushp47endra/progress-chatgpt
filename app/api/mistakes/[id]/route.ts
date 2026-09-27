import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { updateMistakeSchema } from "@/lib/validation/schemas";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await prisma.mistake.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Mistake not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateMistakeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid data." }, { status: 400 });
  const d = parsed.data;

  const mistake = await prisma.mistake.update({
    where: { id: params.id },
    data: {
      ...(d.subjectId !== undefined ? { subjectId: d.subjectId || null } : {}),
      ...(d.topicId !== undefined ? { topicId: d.topicId || null } : {}),
      ...(d.question ? { question: d.question } : {}),
      ...(d.myAnswer !== undefined ? { myAnswer: d.myAnswer || null } : {}),
      ...(d.correctAnswer !== undefined ? { correctAnswer: d.correctAnswer || null } : {}),
      ...(d.whyWrong !== undefined ? { whyWrong: d.whyWrong || null } : {}),
      ...(d.correctConcept !== undefined ? { correctConcept: d.correctConcept || null } : {}),
      ...(d.revisionStatus ? { revisionStatus: d.revisionStatus } : {}),
    },
  });
  return NextResponse.json({ mistake });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await prisma.mistake.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Mistake not found." }, { status: 404 });

  await prisma.mistake.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
