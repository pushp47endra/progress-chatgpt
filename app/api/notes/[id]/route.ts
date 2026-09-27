import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { updateNoteSchema } from "@/lib/validation/schemas";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await prisma.note.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Note not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateNoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid data." }, { status: 400 });
  const d = parsed.data;

  const note = await prisma.note.update({
    where: { id: params.id },
    data: {
      ...(d.subjectId !== undefined ? { subjectId: d.subjectId || null } : {}),
      ...(d.topicId !== undefined ? { topicId: d.topicId || null } : {}),
      ...(d.title ? { title: d.title } : {}),
      ...(d.content ? { content: d.content } : {}),
      ...(d.tags ? { tags: d.tags } : {}),
    },
  });
  return NextResponse.json({ note });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await prisma.note.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Note not found." }, { status: 404 });

  await prisma.note.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
