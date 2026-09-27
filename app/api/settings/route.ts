import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { updateSettingsSchema } from "@/lib/validation/schemas";
import { isOptimizerConfigured } from "@/lib/ai/optimizer";
import { isLunaConfigured } from "@/lib/ai/luna";
import { TARGET_EXAM_DATE } from "@/lib/utils/date";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const settings = await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });

  return NextResponse.json({
    settings,
    account: { username: user.username, createdAt: user.createdAt },
    aiStatus: {
      optimizerConfigured: isOptimizerConfigured(),
      lunaConfigured: isLunaConfigured(),
    },
    targetDate: TARGET_EXAM_DATE,
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings." }, { status: 400 });

  const settings = await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...parsed.data },
    update: parsed.data,
  });

  return NextResponse.json({ settings });
}
