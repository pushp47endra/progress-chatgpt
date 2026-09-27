"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, Select, Input, Textarea, EmptyState } from "@/components/ui/Basics";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Plus, Trash2, Pencil, Search, Tag } from "lucide-react";

interface Subject {
  id: string;
  name: string;
}
interface Topic {
  id: string;
  name: string;
  subjectId: string;
}
interface Note {
  id: string;
  subjectId: string | null;
  topicId: string | null;
  subject: { name: string } | null;
  topic: { name: string } | null;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export default function NotesPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (subjectFilter) params.set("subjectId", subjectFilter);
    const res = await fetch(`/api/notes?${params}`);
    const data = await res.json();
    setNotes(data.notes || []);
  }, [search, subjectFilter]);

  useEffect(() => {
    fetch("/api/subjects").then((r) => r.json()).then((d) => setSubjects(d.subjects || []));
    fetch("/api/topics").then((r) => r.json()).then((d) => setTopics(d.topics || []));
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function deleteNote(id: string) {
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <AppShell title="Notes">
      <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Notes</h1>
            <p className="text-sm text-[var(--muted)]">Your personal GATE CSE study notes.</p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus size={14} /> New Note
          </Button>
        </div>

        <Card>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <Input
                placeholder="Search notes, content or tags..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
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

        {notes.length === 0 && <EmptyState message="No notes yet." />}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => {
            const expanded = openNoteId === n.id;
            return (
              <Card key={n.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold">{n.title}</h3>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => {
                        setEditing(n);
                        setModalOpen(true);
                      }}
                      className="rounded p-1 text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => deleteNote(n.id)}
                      className="rounded p-1 text-[var(--muted)] hover:text-[var(--danger)]"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {(n.subject || n.topic) && (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {n.subject?.name}
                    {n.topic ? ` \u00b7 ${n.topic.name}` : ""}
                  </p>
                )}
                <p
                  className={`mt-2 flex-1 whitespace-pre-wrap text-sm text-[var(--muted)] ${
                    expanded ? "" : "line-clamp-4"
                  }`}
                >
                  {n.content}
                </p>
                {n.content.length > 200 && (
                  <button
                    onClick={() => setOpenNoteId(expanded ? null : n.id)}
                    className="mt-1 self-start text-xs text-[var(--accent)] hover:underline"
                  >
                    {expanded ? "Show less" : "Read more"}
                  </button>
                )}
                {n.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {n.tags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 rounded-md bg-[var(--surface2)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
                      >
                        <Tag size={9} /> {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <NoteModal
        open={modalOpen}
        note={editing}
        subjects={subjects}
        topics={topics}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
    </AppShell>
  );
}

function NoteModal({
  open,
  note,
  subjects,
  topics,
  onClose,
  onSaved,
}: {
  open: boolean;
  note: Note | null;
  subjects: Subject[];
  topics: Topic[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSubjectId(note?.subjectId || "");
      setTopicId(note?.topicId || "");
      setTitle(note?.title || "");
      setContent(note?.content || "");
      setTagsInput((note?.tags || []).join(", "));
    }
  }, [open, note]);

  const filteredTopics = topics.filter((t) => t.subjectId === subjectId);

  async function save() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload = {
      subjectId: subjectId || null,
      topicId: topicId || null,
      title: title.trim(),
      content: content.trim(),
      tags,
    };
    await fetch(note ? `/api/notes/${note.id}` : "/api/notes", {
      method: note ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={note ? "Edit Note" : "New Note"}>
      <div className="space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" autoFocus />
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
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Note content" rows={8} />
        <Input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="Tags, comma separated (e.g. dbms, normalization)"
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
