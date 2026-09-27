"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  List as ListIcon,
  LayoutGrid,
  CalendarRange,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, Checkbox, Badge, EmptyState, Input, Select, Textarea } from "@/components/ui/Basics";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatDuration } from "@/lib/utils/format";

type ViewMode = "day" | "week" | "month" | "list";

interface SubjectOption {
  id: string;
  name: string;
}
interface TopicOption {
  id: string;
  name: string;
  subjectId: string;
}

interface StudyTask {
  id: string;
  date: string;
  subjectId: string | null;
  topicId: string | null;
  subtopic: string | null;
  estimatedTime: number | null;
  priority: "low" | "medium" | "high";
  difficulty: "easy" | "medium" | "hard";
  questionTarget: number | null;
  notes: string | null;
  completed: boolean;
  subject: { id: string; name: string } | null;
  topic: { id: string; name: string } | null;
}

const VIEW_OPTIONS: { key: ViewMode; label: string; icon: typeof CalendarDays }[] = [
  { key: "day", label: "Day", icon: CalendarDays },
  { key: "week", label: "Week", icon: CalendarRange },
  { key: "month", label: "Month", icon: LayoutGrid },
  { key: "list", label: "List", icon: ListIcon },
];

export default function TrackerPage() {
  return (
    <Suspense fallback={null}>
      <TrackerContent />
    </Suspense>
  );
}

function TrackerContent() {
  const searchParams = useSearchParams();

  const [view, setView] = useState<ViewMode>("day");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [listCompletedFilter, setListCompletedFilter] = useState<"all" | "pending" | "completed">("all");
  const [listSubjectFilter, setListSubjectFilter] = useState<string>("");
  const [taskModal, setTaskModal] = useState<{ task?: StudyTask; date?: string } | null>(null);

  useEffect(() => {
    fetch("/api/subjects")
      .then((r) => r.json())
      .then((d) => setSubjects((d.subjects || []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))))
      .catch(() => {});
  }, []);

  // Auto-open the "add task" modal for today when arriving via ?add=1 (Dashboard quick action).
  useEffect(() => {
    if (searchParams.get("add") === "1") {
      setTaskModal({ date: format(new Date(), "yyyy-MM-dd") });
    }
    // Only run once on mount - intentionally not depending on searchParams identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      let url: string;
      if (view === "day") {
        url = `/api/study-tasks?date=${format(anchorDate, "yyyy-MM-dd")}`;
      } else if (view === "week") {
        const from = startOfWeek(anchorDate, { weekStartsOn: 1 });
        const to = endOfWeek(anchorDate, { weekStartsOn: 1 });
        url = `/api/study-tasks?from=${format(from, "yyyy-MM-dd")}&to=${format(to, "yyyy-MM-dd")}`;
      } else if (view === "month") {
        const gridStart = startOfWeek(startOfMonth(anchorDate), { weekStartsOn: 1 });
        const gridEnd = endOfWeek(endOfMonth(anchorDate), { weekStartsOn: 1 });
        url = `/api/study-tasks?from=${format(gridStart, "yyyy-MM-dd")}&to=${format(gridEnd, "yyyy-MM-dd")}`;
      } else {
        const params = new URLSearchParams({ all: "1" });
        if (listSubjectFilter) params.set("subjectId", listSubjectFilter);
        if (listCompletedFilter === "pending") params.set("completed", "false");
        if (listCompletedFilter === "completed") params.set("completed", "true");
        url = `/api/study-tasks?${params.toString()}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setTasks(data.tasks || []);
    } finally {
      setLoading(false);
    }
  }, [view, anchorDate, listSubjectFilter, listCompletedFilter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function toggleComplete(task: StudyTask) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t)));
    await fetch(`/api/study-tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed }),
    });
    loadTasks();
  }

  async function deleteTask(task: StudyTask) {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/study-tasks/${task.id}`, { method: "DELETE" });
    loadTasks();
  }

  function stepDate(direction: 1 | -1) {
    if (view === "day") setAnchorDate((d) => addDays(d, direction));
    else if (view === "week") setAnchorDate((d) => addWeeks(d, direction));
    else if (view === "month") setAnchorDate((d) => addMonths(d, direction));
  }

  const headerLabel =
    view === "day"
      ? format(anchorDate, "EEEE, MMMM d, yyyy")
      : view === "week"
      ? `${format(startOfWeek(anchorDate, { weekStartsOn: 1 }), "MMM d")} - ${format(
          endOfWeek(anchorDate, { weekStartsOn: 1 }),
          "MMM d, yyyy"
        )}`
      : view === "month"
      ? format(anchorDate, "MMMM yyyy")
      : "All Tasks";

  return (
    <AppShell title="Study Tracker">
      <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Study Tracker</h1>
            <p className="text-sm text-[var(--muted)]">Plan and track your daily GATE preparation.</p>
          </div>
          <Button size="sm" onClick={() => setTaskModal({ date: format(anchorDate, "yyyy-MM-dd") })}>
            <Plus size={14} /> Add Task
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-0.5">
            {VIEW_OPTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === key ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          {view !== "list" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => stepDate(-1)}
                className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--surface2)]"
                aria-label="Previous"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setAnchorDate(new Date())}
                className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface2)]"
              >
                Today
              </button>
              <button
                onClick={() => stepDate(1)}
                className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--surface2)]"
                aria-label="Next"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        <p className="text-sm font-medium text-[var(--text)]">{headerLabel}</p>

        {loading ? (
          <EmptyState message="Loading tasks..." />
        ) : view === "day" ? (
          <DayView
            tasks={tasks}
            onToggle={toggleComplete}
            onEdit={(t) => setTaskModal({ task: t })}
            onDelete={deleteTask}
            onAddForDate={(dateKey) => setTaskModal({ date: dateKey })}
            emptyDateKey={format(anchorDate, "yyyy-MM-dd")}
          />
        ) : view === "week" ? (
          <WeekView
            anchorDate={anchorDate}
            tasks={tasks}
            onToggle={toggleComplete}
            onEdit={(t) => setTaskModal({ task: t })}
            onDelete={deleteTask}
            onAddForDate={(dateKey) => setTaskModal({ date: dateKey })}
          />
        ) : view === "month" ? (
          <MonthView
            anchorDate={anchorDate}
            tasks={tasks}
            onSelectDate={(date) => {
              setAnchorDate(date);
              setView("day");
            }}
          />
        ) : (
          <ListView
            tasks={tasks}
            subjects={subjects}
            subjectFilter={listSubjectFilter}
            completedFilter={listCompletedFilter}
            onSubjectFilterChange={setListSubjectFilter}
            onCompletedFilterChange={setListCompletedFilter}
            onToggle={toggleComplete}
            onEdit={(t) => setTaskModal({ task: t })}
            onDelete={deleteTask}
          />
        )}
      </div>

      {taskModal && (
        <TaskModal
          task={taskModal.task}
          defaultDate={taskModal.date}
          subjects={subjects}
          onClose={() => setTaskModal(null)}
          onSaved={() => {
            setTaskModal(null);
            loadTasks();
          }}
        />
      )}
    </AppShell>
  );
}

// ------------------------------------------------------------
// Shared task row
// ------------------------------------------------------------

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
  showDate,
}: {
  task: StudyTask;
  onToggle: (task: StudyTask) => void;
  onEdit: (task: StudyTask) => void;
  onDelete: (task: StudyTask) => void;
  showDate?: boolean;
}) {
  const title = task.topic?.name || task.subtopic || task.subject?.name || "Study task";
  const detailBits = [
    task.subject?.name,
    task.topic?.name && task.subtopic ? task.subtopic : null,
    task.estimatedTime ? formatDuration(task.estimatedTime * 60) : null,
    task.questionTarget ? `${task.questionTarget}q target` : null,
    showDate ? format(parseISO(task.date.slice(0, 10)), "MMM d") : null,
  ].filter(Boolean) as string[];

  return (
    <li className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface2)]/40 px-3 py-2.5">
      <Checkbox checked={task.completed} onChange={() => onToggle(task)} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${task.completed ? "text-[var(--muted)] line-through" : ""}`}>
          {title}
        </p>
        {detailBits.length > 0 && (
          <p className="mt-1 text-xs text-[var(--muted)]">{detailBits.join(" \u00b7 ")}</p>
        )}
        {task.notes && <p className="mt-1 text-xs text-[var(--muted)]">{task.notes}</p>}
      </div>
      <Badge tone={task.difficulty}>{task.difficulty}</Badge>
      <Badge tone={task.priority}>{task.priority}</Badge>
      <button onClick={() => onEdit(task)} className="rounded p-1 text-[var(--muted)] hover:text-[var(--text)]">
        <Pencil size={13} />
      </button>
      <button onClick={() => onDelete(task)} className="rounded p-1 text-[var(--muted)] hover:text-[var(--danger)]">
        <Trash2 size={13} />
      </button>
    </li>
  );
}

// ------------------------------------------------------------
// Day view
// ------------------------------------------------------------

function DayView({
  tasks,
  onToggle,
  onEdit,
  onDelete,
  onAddForDate,
  emptyDateKey,
}: {
  tasks: StudyTask[];
  onToggle: (task: StudyTask) => void;
  onEdit: (task: StudyTask) => void;
  onDelete: (task: StudyTask) => void;
  onAddForDate: (dateKey: string) => void;
  emptyDateKey: string;
}) {
  if (tasks.length === 0) {
    return (
      <Card>
        <EmptyState message="No tasks planned for this day." />
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="secondary" onClick={() => onAddForDate(emptyDateKey)}>
            <Plus size={13} /> Add a task
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </ul>
  );
}

// ------------------------------------------------------------
// Week view (agenda-style: one section per day)
// ------------------------------------------------------------

function WeekView({
  anchorDate,
  tasks,
  onToggle,
  onEdit,
  onDelete,
  onAddForDate,
}: {
  anchorDate: Date;
  tasks: StudyTask[];
  onToggle: (task: StudyTask) => void;
  onEdit: (task: StudyTask) => void;
  onDelete: (task: StudyTask) => void;
  onAddForDate: (dateKey: string) => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(anchorDate, { weekStartsOn: 1 }),
    end: endOfWeek(anchorDate, { weekStartsOn: 1 }),
  });

  return (
    <div className="space-y-3">
      {days.map((day) => {
        const dateKey = format(day, "yyyy-MM-dd");
        const dayTasks = tasks.filter((t) => t.date.slice(0, 10) === dateKey);
        return (
          <Card key={dateKey}>
            <div className="mb-2 flex items-center justify-between">
              <p className={`text-sm font-semibold ${isToday(day) ? "text-[var(--accent)]" : ""}`}>
                {format(day, "EEEE, MMM d")}
                {dayTasks.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                    {dayTasks.filter((t) => t.completed).length}/{dayTasks.length} done
                  </span>
                )}
              </p>
              <button
                onClick={() => onAddForDate(dateKey)}
                className="rounded p-1 text-[var(--muted)] hover:text-[var(--text)]"
                aria-label="Add task"
              >
                <Plus size={14} />
              </button>
            </div>
            {dayTasks.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No tasks.</p>
            ) : (
              <ul className="space-y-1.5">
                {dayTasks.map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------
// Month view (calendar grid)
// ------------------------------------------------------------

function MonthView({
  anchorDate,
  tasks,
  onSelectDate,
}: {
  anchorDate: Date;
  tasks: StudyTask[];
  onSelectDate: (date: Date) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(anchorDate), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(anchorDate), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <Card>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-[var(--muted)]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayTasks = tasks.filter((t) => t.date.slice(0, 10) === dateKey);
          const done = dayTasks.filter((t) => t.completed).length;
          const inMonth = isSameMonth(day, anchorDate);
          return (
            <button
              key={dateKey}
              onClick={() => onSelectDate(day)}
              className={`flex min-h-[64px] flex-col items-start rounded-lg border border-[var(--border)] p-1.5 text-left transition-colors hover:bg-[var(--surface2)] ${
                inMonth ? "" : "opacity-40"
              } ${isSameDay(day, anchorDate) ? "ring-1 ring-[var(--accent)]" : ""}`}
            >
              <span className={`text-xs font-medium ${isToday(day) ? "text-[var(--accent)]" : ""}`}>
                {format(day, "d")}
              </span>
              {dayTasks.length > 0 && (
                <span className="mt-auto text-[10px] text-[var(--muted)]">
                  {done}/{dayTasks.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------
// List view
// ------------------------------------------------------------

function ListView({
  tasks,
  subjects,
  subjectFilter,
  completedFilter,
  onSubjectFilterChange,
  onCompletedFilterChange,
  onToggle,
  onEdit,
  onDelete,
}: {
  tasks: StudyTask[];
  subjects: SubjectOption[];
  subjectFilter: string;
  completedFilter: "all" | "pending" | "completed";
  onSubjectFilterChange: (v: string) => void;
  onCompletedFilterChange: (v: "all" | "pending" | "completed") => void;
  onToggle: (task: StudyTask) => void;
  onEdit: (task: StudyTask) => void;
  onDelete: (task: StudyTask) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select
          value={subjectFilter}
          onChange={(e) => onSubjectFilterChange(e.target.value)}
          className="w-auto"
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          value={completedFilter}
          onChange={(e) => onCompletedFilterChange(e.target.value as "all" | "pending" | "completed")}
          className="w-auto"
        >
          <option value="all">All tasks</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
        </Select>
      </div>

      {tasks.length === 0 ? (
        <EmptyState message="No tasks match these filters." />
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} showDate />
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Create / edit task modal
// ------------------------------------------------------------

function TaskModal({
  task,
  defaultDate,
  subjects,
  onClose,
  onSaved,
}: {
  task?: StudyTask;
  defaultDate?: string;
  subjects: SubjectOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(task?.date.slice(0, 10) || defaultDate || format(new Date(), "yyyy-MM-dd"));
  const [subjectId, setSubjectId] = useState(task?.subjectId || "");
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [topicId, setTopicId] = useState(task?.topicId || "");
  const [subtopic, setSubtopic] = useState(task?.subtopic || "");
  const [estimatedTime, setEstimatedTime] = useState(task?.estimatedTime?.toString() || "");
  const [priority, setPriority] = useState(task?.priority || "medium");
  const [difficulty, setDifficulty] = useState(task?.difficulty || "medium");
  const [questionTarget, setQuestionTarget] = useState(task?.questionTarget?.toString() || "");
  const [notes, setNotes] = useState(task?.notes || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!subjectId) {
      setTopics([]);
      return;
    }
    fetch(`/api/topics?subjectId=${subjectId}`)
      .then((r) => r.json())
      .then((d) => setTopics(d.topics || []))
      .catch(() => {});
  }, [subjectId]);

  async function save() {
    setSaving(true);
    const payload = {
      date,
      subjectId: subjectId || null,
      topicId: topicId || null,
      subtopic: subtopic || null,
      estimatedTime: estimatedTime ? Number(estimatedTime) : null,
      priority,
      difficulty,
      questionTarget: questionTarget ? Number(questionTarget) : null,
      notes: notes || null,
    };
    try {
      await fetch(task ? `/api/study-tasks/${task.id}` : "/api/study-tasks", {
        method: task ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={task ? "Edit Task" : "Add Task"}>
      <div className="space-y-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        <div className="grid grid-cols-2 gap-3">
          <Select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setTopicId("");
            }}
          >
            <option value="">No subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId}>
            <option value="">No topic</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>

        <Input value={subtopic} onChange={(e) => setSubtopic(e.target.value)} placeholder="Subtopic (optional)" />

        <div className="grid grid-cols-2 gap-3">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as StudyTask["priority"])}>
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </Select>
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as StudyTask["difficulty"])}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            placeholder="Planned minutes"
            value={estimatedTime}
            onChange={(e) => setEstimatedTime(e.target.value)}
          />
          <Input
            type="number"
            placeholder="Question target"
            value={questionTarget}
            onChange={(e) => setQuestionTarget(e.target.value)}
          />
        </div>

        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={3}
        />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
