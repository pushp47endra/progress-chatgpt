import { getCurrentUser } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/db/stats";
import { formatDisplayDate } from "@/lib/utils/date";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { TodayPlan } from "@/components/dashboard/TodayPlan";
import { StudyTimer } from "@/components/dashboard/StudyTimer";
import { Card } from "@/components/ui/Basics";
import { formatDuration } from "@/lib/utils/format";
import Link from "next/link";
import {
  CalendarClock,
  Target,
  BookOpen,
  ListChecks,
  Percent,
  Clock,
  Flame,
  Trophy,
} from "lucide-react";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null; // middleware already redirects unauthenticated users

  const data = await getDashboardData(user.id);

  return (
    <AppShell title="Dashboard">
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <div>
          <h1 className="text-xl font-semibold">GATE AI</h1>
          <p className="text-sm text-[var(--muted)]">
            GATE CSE 2027 &middot; Target Date: {formatDisplayDate(
  data.targetDate && !Number.isNaN(new Date(data.targetDate).getTime())
    ? new Date(data.targetDate).toISOString().slice(0, 10)
    : "2027-02-07"
)}
          </p>
          <p className="text-sm text-[var(--muted)]">Today: {formatDisplayDate(data.todayKey)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Days Remaining" value={data.daysRemaining} icon={CalendarClock} />
          <StatCard label="Overall Progress" value={`${data.overallProgress}%`} icon={Target} />
          <StatCard
            label="Topics"
            value={`${data.topicsDone} / ${data.topicsTotal}`}
            sub={`${data.topicsRemaining} remaining`}
            icon={BookOpen}
          />
          <StatCard
            label="Tasks Completed"
            value={`${data.tasksDoneToday} / ${data.totalTasksToday}`}
            sub="Today"
            icon={ListChecks}
          />
          <StatCard label="Questions Attempted" value={data.questionsAttempted} icon={ListChecks} />
          <StatCard label="Accuracy" value={`${data.accuracy}%`} icon={Percent} />
          <StatCard label="Study Time (Today)" value={formatDuration(data.studyTime.today)} icon={Clock} />
          <StatCard label="Current Streak" value={`${data.currentStreak}d`} icon={Flame} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Today&apos;s Plan</h2>
              <Link href="/tracker" className="text-xs text-[var(--accent)] hover:underline">
                Manage tasks
              </Link>
            </div>
            <TodayPlan
              tasks={data.todayTasks.map((t) => ({
                id: t.id,
                subtopic: t.subtopic,
                estimatedTime: t.estimatedTime,
                priority: t.priority,
                difficulty: t.difficulty,
                questionTarget: t.questionTarget,
                completed: t.completed,
                subject: t.subject ? { name: t.subject.name } : null,
                topic: t.topic ? { name: t.topic.name } : null,
              }))}
            />
          </Card>

          <div className="space-y-4">
          <StudyTimer />
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Study Time</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">This week</span>
                <span>{formatDuration(data.studyTime.week)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">This month</span>
                <span>{formatDuration(data.studyTime.month)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">All time</span>
                <span>{formatDuration(data.studyTime.total)}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-2">
                <span className="flex items-center gap-1 text-[var(--muted)]">
                  <Trophy size={14} /> Longest streak
                </span>
                <span>{data.longestStreak}d</span>
              </div>
            </div>
          </Card>
          </div>
        </div>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            {[
              { href: "/tracker", label: "Start Today's Study" },
              { href: "/chat", label: "Open AI Chat" },
              { href: "/tracker?add=1", label: "Add Task" },
              { href: "/subjects", label: "Add Topic" },
              { href: "/questions", label: "Practice Questions" },
              { href: "/mistakes", label: "Review Mistakes" },
              { href: "/notes", label: "Open Notes" },
              { href: "/analytics", label: "View Analytics" },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface)]"
              >
                {a.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
