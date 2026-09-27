import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createNoteSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("q");
  const subjectId = searchParams.get("subjectId");

  const notes = await prisma.note.findMany({
    where: {
      userId: user.id,
      ...(subjectId ? { subjectId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { content: { contains: search, mode: "insensitive" } },
              { tags: { has: search } },
            ],
          }
        : {}),
    },
    include: { subject: true, topic: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ notes });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid note data." }, { status: 400 });
  const d = parsed.data;

  const note = await prisma.note.create({
    data: {
      userId: user.id,
      subjectId: d.subjectId || null,
      topicId: d.topicId || null,
      title: d.title,
      content: d.content,
      tags: d.tags || [],
    },
  });
  return NextResponse.json({ note }, { status: 201 });
}
