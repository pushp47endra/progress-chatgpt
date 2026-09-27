import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { studySessionStopSchema } from "@/lib/validation/schemas";
import { addStudySeconds } from "@/lib/db/dailyProgress";
import { formatInTimeZone } from "date-fns-tz";
import { APP_TIMEZONE } from "@/lib/utils/date";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await prisma.studySession.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  if (existing.endTime) {
    return NextResponse.json({ error: "This session was already stopped." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = studySessionStopSchema.safeParse({ id: params.id, ...body });
  if (!parsed.success) return NextResponse.json({ error: "Invalid data." }, { status: 400 });

  const endTime = new Date();
  const durationSeconds = Math.max(0, Math.round((endTime.getTime() - existing.startTime.getTime()) / 1000));

  const session = await prisma.studySession.update({
    where: { id: params.id },
    data: {
      endTime,
      duration: durationSeconds,
      subjectId: parsed.data.subjectId ?? existing.subjectId,
      topicName: parsed.data.topicName ?? existing.topicName,
    },
  });

  const dateKey = formatInTimeZone(existing.startTime, APP_TIMEZONE, "yyyy-MM-dd");
  await addStudySeconds(user.id, dateKey, durationSeconds);

  return NextResponse.json({ session });
}