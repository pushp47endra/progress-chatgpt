import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createSubjectSchema } from "@/lib/validation/schemas";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await prisma.subject.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Subject not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = createSubjectSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid subject data." }, { status: 400 });

  const subject = await prisma.subject.update({
    where: { id: params.id },
    data: { name: parsed.data.name },
  });

  return NextResponse.json({ subject });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await prisma.subject.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Subject not found." }, { status: 404 });

  // Topic rows cascade-delete with their subject (schema: onDelete: Cascade).
  // StudyTask/Question/Mistake rows use onDelete: SetNull, so they survive
  // as "unassigned" rather than being destroyed.
  await prisma.subject.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
