"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, ProgressBar, Badge, Checkbox, Input, Select, EmptyState } from "@/components/ui/Basics";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Plus, ChevronDown, ChevronUp, Trash2, Pencil } from "lucide-react";

interface Subject {
  id: string;
  name: string;
  isDefault: boolean;
  totalTopics: number;
  completedTopics: number;
  remainingTopics: number;
  completionPct: number;
  questionsAttempted: number;
  questionsSolved: number;
  accuracy: number;
  studySeconds: number;
}

interface Topic {
  id: string;
  name: string;
  subjectId: string;
  completed: boolean;
  priority: string;
  estimatedTime: number | null;
  questionTarget: number | null;
  notes: string | null;
}

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topicsBySubject, setTopicsBySubject] = useState<Record<string, Topic[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newSubjectOpen, setNewSubjectOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [topicModal, setTopicModal] = useState<{ subjectId: string; topic?: Topic } | null>(null);

  const loadSubjects = useCallback(async () => {
    const res = await fetch("/api/subjects");
    const data = await res.json();
    setSubjects(data.subjects || []);
  }, []);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  async function loadTopics(subjectId: string) {
    const res = await fetch(`/api/topics?subjectId=${subjectId}`);
    const data = await res.json();
    setTopicsBySubject((prev) => ({ ...prev, [subjectId]: data.topics || [] }));
  }

  async function toggleExpand(subjectId: string) {
    if (expanded === subjectId) {
      setExpanded(null);
      return;
    }
    setExpanded(subjectId);
    if (!topicsBySubject[subjectId]) await loadTopics(subjectId);
  }

  async function createSubject() {
    if (!newSubjectName.trim()) return;
    const res = await fetch("/api/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSubjectName.trim() }),
    });
    if (res.ok) {
      setNewSubjectName("");
      setNewSubjectOpen(false);
      loadSubjects();
    }
  }

  async function deleteSubject(id: string) {
    if (!confirm("Delete this subject and all its topics?")) return;
    await fetch(`/api/subjects/${id}`, { method: "DELETE" });
    loadSubjects();
  }

  async function toggleTopicComplete(topic: Topic) {
    await fetch(`/api/topics/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !topic.completed }),
    });
    loadTopics(topic.subjectId);
    loadSubjects();
  }

  async function deleteTopic(topic: Topic) {
    if (!confirm("Delete this topic?")) return;
    await fetch(`/api/topics/${topic.id}`, { method: "DELETE" });
    loadTopics(topic.subjectId);
    loadSubjects();
  }

  return (
    <AppShell title="Subjects">
      <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Subjects</h1>
            <p className="text-sm text-[var(--muted)]">GATE CSE 2027 syllabus, fully customizable.</p>
          </div>
          <Button size="sm" onClick={() => setNewSubjectOpen(true)}>
            <Plus size={14} /> Add Subject
          </Button>
        </div>

        {subjects.length === 0 && <EmptyState message="No subjects yet." />}

        <div className="space-y-3">
          {subjects.map((s) => (
            <Card key={s.id}>
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => toggleExpand(s.id)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  {expanded === s.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  <span className="text-sm font-semibold">{s.name}</span>
                </button>
                <span className="text-xs text-[var(--muted)]">
                  {s.completedTopics}/{s.totalTopics} topics
                </span>
                <button
                  onClick={() => deleteSubject(s.id)}
                  className="rounded p-1.5 text-[var(--muted)] hover:text-[var(--danger)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Completion" value={`${s.completionPct}%`} />
                <MiniStat label="Questions" value={`${s.questionsSolved}/${s.questionsAttempted}`} />
                <MiniStat label="Accuracy" value={`${s.accuracy}%`} />
                <MiniStat label="Study Time" value={`${Math.round(s.studySeconds / 60)}m`} />
              </div>
              <ProgressBar value={s.completionPct} className="mt-3" />

              {expanded === s.id && (
                <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-[var(--muted)]">Topics</p>
                    <Button size="sm" variant="secondary" onClick={() => setTopicModal({ subjectId: s.id })}>
                      <Plus size={13} /> Add Topic
                    </Button>
                  </div>
                  {(topicsBySubject[s.id] || []).length === 0 ? (
                    <EmptyState message="No topics yet." />
                  ) : (
                    <ul className="space-y-1.5">
                      {(topicsBySubject[s.id] || []).map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)]/40 px-3 py-2"
                        >
                          <Checkbox checked={t.completed} onChange={() => toggleTopicComplete(t)} />
                          <span className={`flex-1 text-sm ${t.completed ? "text-[var(--muted)] line-through" : ""}`}>
                            {t.name}
                          </span>
                          <Badge tone={t.priority}>{t.priority}</Badge>
                          <button
                            onClick={() => setTopicModal({ subjectId: s.id, topic: t })}
                            className="rounded p-1 text-[var(--muted)] hover:text-[var(--text)]"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => deleteTopic(t)}
                            className="rounded p-1 text-[var(--muted)] hover:text-[var(--danger)]"
                          >
                            <Trash2 size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      <Modal open={newSubjectOpen} onClose={() => setNewSubjectOpen(false)} title="Add Subject">
        <div className="space-y-3">
          <Input
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            placeholder="Subject name"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNewSubjectOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createSubject}>Create</Button>
          </div>
        </div>
      </Modal>

      {topicModal && (
        <TopicModal
          subjectId={topicModal.subjectId}
          topic={topicModal.topic}
          onClose={() => setTopicModal(null)}
          onSaved={() => {
            loadTopics(topicModal.subjectId);
            loadSubjects();
          }}
        />
      )}
    </AppShell>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function TopicModal({
  subjectId,
  topic,
  onClose,
  onSaved,
}: {
  subjectId: string;
  topic?: Topic;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(topic?.name || "");
  const [priority, setPriority] = useState(topic?.priority || "medium");
  const [estimatedTime, setEstimatedTime] = useState(topic?.estimatedTime?.toString() || "");
  const [questionTarget, setQuestionTarget] = useState(topic?.questionTarget?.toString() || "");
  const [notes, setNotes] = useState(topic?.notes || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      subjectId,
      name: name.trim(),
      priority,
      estimatedTime: estimatedTime ? Number(estimatedTime) : null,
      questionTarget: questionTarget ? Number(questionTarget) : null,
      notes: notes || null,
    };
    await fetch(topic ? `/api/topics/${topic.id}` : "/api/topics", {
      method: topic ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={topic ? "Edit Topic" : "Add Topic"}>
      <div className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Topic name" autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </Select>
          <Input
            type="number"
            placeholder="Estimated minutes"
            value={estimatedTime}
            onChange={(e) => setEstimatedTime(e.target.value)}
          />
        </div>
        <Input
          type="number"
          placeholder="Question target"
          value={questionTarget}
          onChange={(e) => setQuestionTarget(e.target.value)}
        />
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
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