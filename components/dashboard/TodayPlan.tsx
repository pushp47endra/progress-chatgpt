"use client";

import { useState } from "react";
import Link from "next/link";
import { Checkbox, EmptyState, Badge } from "@/components/ui/Basics";
import { formatDuration } from "@/lib/utils/format";

export interface TodayTask {
  id: string;
  subtopic: string | null;
  estimatedTime: number | null;
  priority: string;
  difficulty: string;
  questionTarget: number | null;
  completed: boolean;
  subject: { name: string } | null;
  topic: { name: string } | null;
}

/**
 * Renders today's tasks on the dashboard with an inline complete/uncomplete
 * toggle. Full create/edit/delete happens on the Study Tracker page - this
 * is a lightweight, read-mostly view for the dashboard.
 */
export function TodayPlan({ tasks: initialTasks }: { tasks: TodayTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  async function toggle(task: TodayTask) {
    const nextCompleted = !task.completed;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: nextCompleted } : t)));
    setPending((prev) => ({ ...prev, [task.id]: true }));
    try {
      await fetch(`/api/study-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: nextCompleted }),
      });
    } catch {
      // Revert on failure - keep the dashboard consistent with the server.
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: task.completed } : t)));
    } finally {
      setPending((prev) => ({ ...prev, [task.id]: false }));
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState message="No tasks scheduled for today." />
        <Link
          href="/tracker?add=1"
          className="block text-center text-xs text-[var(--accent)] hover:underline"
        >
          Add today&apos;s first task
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {tasks.map((t) => {
        const title = t.topic?.name || t.subtopic || t.subject?.name || "Study task";
        const detailBits = [
          t.subject?.name,
          t.topic?.name && t.subtopic ? t.subtopic : null,
          t.estimatedTime ? formatDuration(t.estimatedTime * 60) : null,
          t.questionTarget ? `${t.questionTarget}q target` : null,
        ].filter(Boolean) as string[];

        return (
          <li
            key={t.id}
            className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface2)]/40 px-3 py-2.5"
          >
            <Checkbox
              checked={t.completed}
              onChange={() => toggle(t)}
              className={`mt-0.5 ${pending[t.id] ? "opacity-60" : ""}`}
            />
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium ${
                  t.completed ? "text-[var(--muted)] line-through" : ""
                }`}
              >
                {title}
              </p>
              {detailBits.length > 0 && (
                <p className="mt-1 text-xs text-[var(--muted)]">{detailBits.join(" \u00b7 ")}</p>
              )}
            </div>
            <Badge tone={t.priority}>{t.priority}</Badge>
          </li>
        );
      })}
    </ul>
  );
}
