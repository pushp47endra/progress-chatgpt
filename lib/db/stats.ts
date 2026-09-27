import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  getTodayDate,
  getTodayKey,
  getDaysRemaining,
  TARGET_EXAM_DATE,
} from "@/lib/utils/date";
import { subDays, format } from "date-fns";

export async function getDashboardData(userId: string) {
  const todayDate = getTodayDate();
  const todayKey = getTodayKey();

  const [
    todayTasks,
    subjects,
    topicsTotal,
    topicsDone,
    questionsAttempted,
    questionsCorrect,
    studySessionsAgg,
    dailyProgressRows,
  ] = await Promise.all([
    prisma.studyTask.findMany({
      where: { userId, date: todayDate },
      include: { subject: true, topic: true },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    prisma.subject.findMany({ where: { userId } }),
    prisma.topic.count({ where: { userId } }),
    prisma.topic.count({ where: { userId, completed: true } }),
    prisma.question.count({
      where: { userId, status: { in: ["attempted", "correct", "incorrect"] } },
    }),
    prisma.question.count({ where: { userId, status: "correct" } }),
    prisma.studySession.aggregate({
      where: { userId },
      _sum: { duration: true },
    }),
    prisma.dailyProgress.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 400,
    }),
  ]);

  const tasksDoneToday = todayTasks.filter((t) => t.completed).length;
  const totalTasksToday = todayTasks.length;

  const attempted = questionsAttempted;
  const accuracy = attempted > 0 ? Math.round((questionsCorrect / attempted) * 100) : 0;

  const totalStudySeconds = studySessionsAgg._sum.duration || 0;

  // Weekly / monthly study time from DailyProgress rows.
  const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

  let weekSeconds = 0;
  let monthSeconds = 0;
  let todaySeconds = 0;
  for (const row of dailyProgressRows) {
    const key = format(row.date, "yyyy-MM-dd");
    if (key === todayKey) todaySeconds = row.studySeconds;
    if (key >= sevenDaysAgo) weekSeconds += row.studySeconds;
    if (key >= thirtyDaysAgo) monthSeconds += row.studySeconds;
  }

  // Streak calculation: consecutive active days ending today or yesterday.
  const activeDaySet = new Set(
    dailyProgressRows.filter((r) => r.isActiveDay).map((r) => format(r.date, "yyyy-MM-dd"))
  );
  let currentStreak = 0;
  {
    let cursor = todayDate;
    // If today isn't active yet, streak counts up to yesterday.
    if (!activeDaySet.has(todayKey)) {
      cursor = subDays(todayDate, 1);
    }
    while (activeDaySet.has(format(cursor, "yyyy-MM-dd"))) {
      currentStreak++;
      cursor = subDays(cursor, 1);
    }
  }
  let longestStreak = 0;
  {
    const sortedKeys = Array.from(activeDaySet).sort();
    let run = 0;
    let prevKey: string | null = null;
    for (const key of sortedKeys) {
      if (prevKey && format(subDays(new Date(key), 0), "yyyy-MM-dd") === key) {
        // handled below via date diff check
      }
      if (prevKey) {
        const diffDays = Math.round(
          (new Date(key).getTime() - new Date(prevKey).getTime()) / 86400000
        );
        run = diffDays === 1 ? run + 1 : 1;
      } else {
        run = 1;
      }
      longestStreak = Math.max(longestStreak, run);
      prevKey = key;
    }
  }

  const overallProgress =
    topicsTotal > 0 ? Math.round((topicsDone / topicsTotal) * 100) : 0;

  return {
    daysRemaining: getDaysRemaining(),
    targetDate: TARGET_EXAM_DATE,
    todayKey,
    todayTasks,
    tasksDoneToday,
    totalTasksToday,
    subjectsCount: subjects.length,
    topicsTotal,
    topicsDone,
    topicsRemaining: topicsTotal - topicsDone,
    overallProgress,
    questionsAttempted: attempted,
    questionsCorrect,
    accuracy,
    studyTime: {
      today: todaySeconds,
      week: weekSeconds,
      month: monthSeconds,
      total: totalStudySeconds,
    },
    currentStreak,
    longestStreak,
  };
}
