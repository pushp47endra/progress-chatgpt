"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, Badge, Select, Input, Textarea, EmptyState } from "@/components/ui/Basics";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Plus, Trash2, Pencil, AlertTriangle } from "lucide-react";

interface Subject {
  id: string;
  name: string;
}
interface Topic {
  id: string;
  name: string;
  subjectId: string;
}
interface Mistake {
  id: string;
  subjectId: string | null;
  topicId: string | null;
  subject: { name: string } | null;
  topic: { name: string } | null;
  question: string;
  myAnswer: string | null;
  correctAnswer: string | null;
  whyWrong: string | null;
  correctConcept: string | null;
  revisionStatus: string;
  date: string;
}
interface WeakTopic {
  topic: string;
  count: number;
}

const REVISION_LABEL: Record<string, string> = {
  not_revised: "Not revised",
  revised: "Revised",
  mastered: "Mastered",
};

export default function MistakesPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [revisionFilter, setRevisionFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Mistake | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (revisionFilter) params.set("revisionStatus", revisionFilter);
    if (subjectFilter) params.set("subjectId", subjectFilter);
    const res = await fetch(`/api/mistakes?${params}`);
    const data = await res.json();
    setMistakes(data.mistakes || []);
    setWeakTopics(data.weakTopics || []);
  }, [revisionFilter, subjectFilter]);

  useEffect(() => {
    fetch("/api/subjects").then((r) => r.json()).then((d) => setSubjects(d.subjects || []));
    fetch("/api/topics").then((r) => r.json()).then((d) => setTopics(d.topics || []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteMistake(id: string) {
    if (!confirm("Delete this mistake entry?")) return;
    await fetch(`/api/mistakes/${id}`, { method: "DELETE" });
    load();
  }

  async function cycleRevisionStatus(m: Mistake) {
    const order = ["not_revised", "revised", "mastered"];
    const next = order[(order.indexOf(m.revisionStatus) + 1) % order.length];
    await fetch(`/api/mistakes/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisionStatus: next }),
    });
    load();
  }

  return (
    <AppShell title="Mistakes">
      <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Mistake Tracker</h1>
            <p className="text-sm text-[var(--muted)]">Review what went wrong and revise until mastered.</p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus size={14} /> Log Mistake
          </Button>
        </div>

        {weakTopics.length > 0 && (
          <Card>
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle size={14} className="text-[var(--warning)]" />
              <h2 className="text-sm font-semibold">Weakest Topics</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {weakTopics.map((w) => (
                <span
                  key={w.topic}
                  className="rounded-md bg-[var(--surface2)] px-2.5 py-1 text-xs text-[var(--muted)]"
                >
                  {w.topic} &middot; {w.count} unmastered
                </span>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select value={revisionFilter} onChange={(e) => setRevisionFilter(e.target.value)}>
              <option value="">All revision statuses</option>
              {Object.entries(REVISION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        </Card>

        {mistakes.length === 0 && <EmptyState message="No mistakes logged yet." />}

        <div className="space-y-3">
          {mistakes.map((m) => (
            <Card key={m.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <button onClick={() => cycleRevisionStatus(m)}>
                      <Badge
                        tone={
                          m.revisionStatus === "mastered"
                            ? "completed"
                            : m.revisionStatus === "revised"
                            ? "medium"
                            : "missed"
                        }
                      >
                        {REVISION_LABEL[m.revisionStatus]}
                      </Badge>
                    </button>
                    {m.subject && <span className="text-xs text-[var(--muted)]">{m.subject.name}</span>}
                    {m.topic && <span className="text-xs text-[var(--muted)]">&middot; {m.topic.name}</span>}
                  </div>
                  <p className="whitespace-pre-wrap text-sm font-medium">{m.question}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => {
                      setEditing(m);
                      setModalOpen(true);
                    }}
                    className="rounded p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteMistake(m.id)}
                    className="rounded p-1.5 text-[var(--muted)] hover:text-[var(--danger)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 border-t border-[var(--border)] pt-3 text-sm sm:grid-cols-2">
                {m.myAnswer && (
                  <p>
                    <span className="font-medium text-[var(--danger)]">My answer:</span> {m.myAnswer}
                  </p>
                )}
                {m.correctAnswer && (
                  <p>
                    <span className="font-medium text-[var(--success)]">Correct answer:</span>{" "}
                    {m.correctAnswer}
                  </p>
                )}
                {m.whyWrong && (
                  <p className="sm:col-span-2">
                    <span className="font-medium text-[var(--muted)]">Why I was wrong:</span> {m.whyWrong}
                  </p>
                )}
                {m.correctConcept && (
                  <p className="sm:col-span-2">
                    <span className="font-medium text-[var(--muted)]">Correct concept:</span>{" "}
                    {m.correctConcept}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <MistakeModal
        open={modalOpen}
        mistake={editing}
        subjects={subjects}
        topics={topics}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
    </AppShell>
  );
}

function MistakeModal({
  open,
  mistake,
  subjects,
  topics,
  onClose,
  onSaved,
}: {
  open: boolean;
  mistake: Mistake | null;
  subjects: Subject[];
  topics: Topic[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [question, setQuestion] = useState("");
  const [myAnswer, setMyAnswer] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [whyWrong, setWhyWrong] = useState("");
  const [correctConcept, setCorrectConcept] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSubjectId(mistake?.subjectId || "");
      setTopicId(mistake?.topicId || "");
      setQuestion(mistake?.question || "");
      setMyAnswer(mistake?.myAnswer || "");
      setCorrectAnswer(mistake?.correctAnswer || "");
      setWhyWrong(mistake?.whyWrong || "");
      setCorrectConcept(mistake?.correctConcept || "");
    }
  }, [open, mistake]);

  const filteredTopics = topics.filter((t) => t.subjectId === subjectId);

  async function save() {
    if (!question.trim()) return;
    setSaving(true);
    const payload = {
      subjectId: subjectId || null,
      topicId: topicId || null,
      question: question.trim(),
      myAnswer: myAnswer || null,
      correctAnswer: correctAnswer || null,
      whyWrong: whyWrong || null,
      correctConcept: correctConcept || null,
    };
    await fetch(mistake ? `/api/mistakes/${mistake.id}` : "/api/mistakes", {
      method: mistake ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={mistake ? "Edit Mistake" : "Log Mistake"}>
      <div className="space-y-3">
        <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question" rows={3} autoFocus />
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
            {filteredTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <Input value={myAnswer} onChange={(e) => setMyAnswer(e.target.value)} placeholder="My answer" />
        <Input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} placeholder="Correct answer" />
        <Textarea value={whyWrong} onChange={(e) => setWhyWrong(e.target.value)} placeholder="Why I was wrong" rows={2} />
        <Textarea
          value={correctConcept}
          onChange={(e) => setCorrectConcept(e.target.value)}
          placeholder="Correct concept / how to think about it"
          rows={2}
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
