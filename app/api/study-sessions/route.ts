import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { studySessionStartSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Number(searchParams.get("limit") || "30"));

  const sessions = await prisma.studySession.findMany({
    where: { userId: user.id },
    orderBy: { startTime: "desc" },
    take: limit,
  });
  return NextResponse.json({ sessions });
}

// Starts a new study-timer session (Start button).
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = studySessionStartSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid data." }, { status: 400 });

  const session = await prisma.studySession.create({
    data: {
      userId: user.id,
      subjectId: parsed.data.subjectId || null,
      topicName: parsed.data.topicName || null,
      startTime: new Date(),
    },
  });
  return NextResponse.json({ session }, { status: 201 });
}