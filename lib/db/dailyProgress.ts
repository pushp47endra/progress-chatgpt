import "server-only";
import { prisma } from "@/lib/db/prisma";
import { dateKeyToDate } from "@/lib/utils/date";

/**
 * Adds `seconds` of study time to the DailyProgress row for `dateKey`
 * (creating it if needed) and marks the day as active. Called when a
 * StudyTimer session is stopped.
 */
export async function addStudySeconds(userId: string, dateKey: string, seconds: number) {
  if (seconds <= 0) return;
  const date = dateKeyToDate(dateKey);

  await prisma.dailyProgress.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, studySeconds: seconds, isActiveDay: true },
    update: { studySeconds: { increment: seconds }, isActiveDay: true },
  });
}

/**
 * Adjusts the tasksDone/tasksTotal counters for a given day when a
 * StudyTask is created, deleted, or its `completed` flag is toggled.
 * `doneDelta`/`totalDelta` are typically -1, 0, or +1.
 */
export async function adjustTaskCounts(
  userId: string,
  dateKey: string,
  doneDelta: number,
  totalDelta: number
) {
  if (doneDelta === 0 && totalDelta === 0) return;
  const date = dateKeyToDate(dateKey);

  const existing = await prisma.dailyProgress.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      tasksDone: Math.max(0, doneDelta),
      tasksTotal: Math.max(0, totalDelta),
      isActiveDay: doneDelta > 0,
    },
    update: {
      tasksDone: { increment: doneDelta },
      tasksTotal: { increment: totalDelta },
    },
  });

  // Never let counters go negative (e.g. deleting an already-uncompleted task).
  if (existing.tasksDone < 0 || existing.tasksTotal < 0) {
    await prisma.dailyProgress.update({
      where: { id: existing.id },
      data: {
        tasksDone: Math.max(0, existing.tasksDone),
        tasksTotal: Math.max(0, existing.tasksTotal),
      },
    });
  }

  if (doneDelta > 0) {
    await prisma.dailyProgress.update({
      where: { id: existing.id },
      data: { isActiveDay: true },
    });
  }
}
