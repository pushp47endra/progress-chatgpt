import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { updateTopicSchema } from "@/lib/validation/schemas";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await prisma.topic.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Topic not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateTopicSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid data." }, { status: 400 });
  const d = parsed.data;

  const topic = await prisma.topic.update({
    where: { id: params.id },
    data: {
      ...(d.name ? { name: d.name } : {}),
      ...(d.priority ? { priority: d.priority } : {}),
      ...(d.estimatedTime !== undefined ? { estimatedTime: d.estimatedTime } : {}),
      ...(d.questionTarget !== undefined ? { questionTarget: d.questionTarget } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
      ...(d.completed !== undefined ? { completed: d.completed } : {}),
    },
  });

  return NextResponse.json({ topic });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await prisma.topic.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Topic not found." }, { status: 404 });

  await prisma.topic.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
