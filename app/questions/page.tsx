"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, Badge, Select, Input, Textarea, EmptyState } from "@/components/ui/Basics";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Plus, Trash2, Pencil, Check, SkipForward } from "lucide-react";

interface Subject {
  id: string;
  name: string;
}
interface Topic {
  id: string;
  name: string;
  subjectId: string;
}
interface Question {
  id: string;
  subjectId: string | null;
  topicId: string | null;
  subject: { name: string } | null;
  topic: { name: string } | null;
  questionText: string;
  difficulty: string;
  source: string | null;
  userAnswer: string | null;
  correctAnswer: string | null;
  explanation: string | null;
  status: string;
  date: string;
}

const STATUS_LABEL: Record<string, string> = {
  not_attempted: "Not attempted",
  attempted: "Attempted",
  correct: "Correct",
  incorrect: "Incorrect",
  skipped: "Skipped",
};

export default function QuestionsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [revealAnswer, setRevealAnswer] = useState<Record<string, boolean>>({});
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});

  const loadQuestions = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (subjectFilter) params.set("subjectId", subjectFilter);
    if (search) params.set("q", search);
    params.set("page", String(page));
    const res = await fetch(`/api/questions?${params}`);
    const data = await res.json();
    setQuestions(data.questions || []);
    setTotal(data.total || 0);
  }, [statusFilter, subjectFilter, search, page]);

  useEffect(() => {
    fetch("/api/subjects")
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects || []));
    fetch("/api/topics")
      .then((r) => r.json())
      .then((d) => setTopics(d.topics || []))
      .catch(() => setTopics([]));
  }, []);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  async function deleteQuestion(id: string) {
    if (!confirm("Delete this question?")) return;
    await fetch(`/api/questions/${id}`, { method: "DELETE" });
    loadQuestions();
  }

  async function submitAnswer(q: Question) {
    const userAnswer = answerDrafts[q.id] ?? "";
    if (!userAnswer.trim()) return;
    const isCorrect =
      q.correctAnswer != null &&
      userAnswer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
    await fetch(`/api/questions/${q.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userAnswer,
        status: q.correctAnswer ? (isCorrect ? "correct" : "incorrect") : "attempted",
      }),
    });
    setRevealAnswer((prev) => ({ ...prev, [q.id]: true }));
    loadQuestions();
  }

  async function markStatus(q: Question, status: string) {
    await fetch(`/api/questions/${q.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadQuestions();
  }

  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <AppShell title="Questions">
      <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Question Bank</h1>
            <p className="text-sm text-[var(--muted)]">
              GATE-level practice questions, tracked with attempt status.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus size={14} /> Add Question
          </Button>
        </div>

        <Card>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}>
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select value={subjectFilter} onChange={(e) => { setPage(1); setSubjectFilter(e.target.value); }}>
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Input
              placeholder="Search question text..."
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            />
          </div>
        </Card>

        {questions.length === 0 && <EmptyState message="No questions found." />}

        <div className="space-y-3">
          {questions.map((q) => {
            const revealed = revealAnswer[q.id] || q.status === "correct" || q.status === "incorrect";
            return (
              <Card key={q.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone={q.difficulty}>{q.difficulty}</Badge>
                      <Badge tone={q.status === "correct" ? "completed" : q.status === "incorrect" ? "missed" : "medium"}>
                        {STATUS_LABEL[q.status]}
                      </Badge>
                      {q.subject && <span className="text-xs text-[var(--muted)]">{q.subject.name}</span>}
                      {q.topic && <span className="text-xs text-[var(--muted)]">&middot; {q.topic.name}</span>}
                      {q.source && <span className="text-xs text-[var(--muted)]">&middot; {q.source}</span>}
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{q.questionText}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => {
                        setEditing(q);
                        setModalOpen(true);
                      }}
                      className="rounded p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteQuestion(q.id)}
                      className="rounded p-1.5 text-[var(--muted)] hover:text-[var(--danger)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                  <Input
                    placeholder="Your answer..."
                    value={answerDrafts[q.id] ?? q.userAnswer ?? ""}
                    onChange={(e) => setAnswerDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    className="max-w-xs"
                  />
                  <Button size="sm" variant="secondary" onClick={() => submitAnswer(q)}>
                    <Check size={13} /> Submit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => markStatus(q, "skipped")}>
                    <SkipForward size={13} /> Skip
                  </Button>
                  {!revealed && (q.correctAnswer || q.explanation) && (
                    <button
                      onClick={() => setRevealAnswer((prev) => ({ ...prev, [q.id]: true }))}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Reveal answer
                    </button>
                  )}
                </div>

                {revealed && (q.correctAnswer || q.explanation) && (
                  <div className="mt-2 space-y-1 rounded-lg bg-[var(--surface2)]/50 p-3 text-sm">
                    {q.correctAnswer && (
                      <p>
                        <span className="font-medium text-[var(--success)]">Correct answer:</span>{" "}
                        {q.correctAnswer}
                      </p>
                    )}
                    {q.explanation && (
                      <p className="whitespace-pre-wrap text-[var(--muted)]">{q.explanation}</p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-[var(--muted)]">
              Page {page} of {totalPages}
            </span>
            <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>

      <QuestionModal
        open={modalOpen}
        question={editing}
        subjects={subjects}
        topics={topics}
        onClose={() => setModalOpen(false)}
        onSaved={loadQuestions}
      />
    </AppShell>
  );
}

function QuestionModal({
  open,
  question,
  subjects,
  topics,
  onClose,
  onSaved,
}: {
  open: boolean;
  question: Question | null;
  subjects: Subject[];
  topics: Topic[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [source, setSource] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSubjectId(question?.subjectId || "");
      setTopicId(question?.topicId || "");
      setQuestionText(question?.questionText || "");
      setDifficulty(question?.difficulty || "medium");
      setSource(question?.source || "");
      setCorrectAnswer(question?.correctAnswer || "");
      setExplanation(question?.explanation || "");
    }
  }, [open, question]);

  const filteredTopics = topics.filter((t) => t.subjectId === subjectId);

  async function save() {
    if (!questionText.trim()) return;
    setSaving(true);
    const payload = {
      subjectId: subjectId || null,
      topicId: topicId || null,
      questionText: questionText.trim(),
      difficulty,
      source: source || null,
      correctAnswer: correctAnswer || null,
      explanation: explanation || null,
    };
    await fetch(question ? `/api/questions/${question.id}` : "/api/questions", {
      method: question ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={question ? "Edit Question" : "Add Question"}>
      <div className="space-y-3">
        <Textarea
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          placeholder="Question text"
          rows={4}
          autoFocus
        />
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
        <div className="grid grid-cols-2 gap-3">
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source (e.g. GATE 2023)" />
        </div>
        <Input
          value={correctAnswer}
          onChange={(e) => setCorrectAnswer(e.target.value)}
          placeholder="Correct answer (optional)"
        />
        <Textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="Explanation (optional)"
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
