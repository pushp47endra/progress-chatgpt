"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Trash2, Check, X, MessageSquare, PanelLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { Input, EmptyState } from "@/components/ui/Basics";

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  async function handleNewChat() {
    const res = await fetch("/api/conversations", { method: "POST" });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.conversation) {
      setActiveId(data.conversation.id);
      setMobileListOpen(false);
      loadConversations();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) setActiveId(null);
    loadConversations();
  }

  function startRename(c: Conversation) {
    setEditingId(c.id);
    setEditTitle(c.title);
  }

  async function confirmRename() {
    if (!editingId || !editTitle.trim()) {
      setEditingId(null);
      return;
    }
    await fetch(`/api/conversations/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle.trim() }),
    });
    setEditingId(null);
    loadConversations();
  }

  const filtered = conversations.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));

  const listContent = (
    <>
      <div className="flex items-center gap-2 border-b border-[var(--border)] p-3">
        <button
          onClick={handleNewChat}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          <Plus size={15} /> New Chat
        </button>
      </div>
      <div className="border-b border-[var(--border)] p-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="pl-8 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {loaded && filtered.length === 0 && (
          <div className="px-2 py-6">
            <EmptyState message={search ? "No matching conversations." : "No conversations yet."} />
          </div>
        )}
        {filtered.map((c) => (
          <div
            key={c.id}
            className={`group flex items-center gap-1 rounded-lg px-2 py-2 text-sm ${
              activeId === c.id
                ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                : "text-[var(--text)] hover:bg-[var(--surface2)]"
            }`}
          >
            {editingId === c.id ? (
              <>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  className="h-7 flex-1 py-1 text-xs"
                />
                <button onClick={confirmRename} className="shrink-0 rounded p-1 hover:bg-[var(--surface2)]">
                  <Check size={13} />
                </button>
                <button onClick={() => setEditingId(null)} className="shrink-0 rounded p-1 hover:bg-[var(--surface2)]">
                  <X size={13} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setActiveId(c.id);
                    setMobileListOpen(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <MessageSquare size={14} className="shrink-0" />
                  <span className="truncate">{c.title}</span>
                </button>
                <button
                  onClick={() => startRename(c)}
                  className="shrink-0 rounded p-1 text-[var(--muted)] opacity-0 hover:bg-[var(--surface2)] hover:text-[var(--text)] group-hover:opacity-100"
                  title="Rename"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="shrink-0 rounded p-1 text-[var(--muted)] opacity-0 hover:bg-[var(--surface2)] hover:text-[var(--danger)] group-hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );

  return (
    <AppShell title="AI Chat">
      <div className="flex h-full">
        {/* Desktop conversation sidebar */}
        <div className="hidden w-72 shrink-0 flex-col border-r border-[var(--border)] md:flex">
          {listContent}
        </div>

        {/* Mobile conversation drawer */}
        {mobileListOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileListOpen(false)} />
            <div className="relative z-50 flex h-full w-72 flex-col bg-[var(--surface)]">{listContent}</div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 md:hidden">
            <button
              onClick={() => setMobileListOpen(true)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface2)]"
            >
              <PanelLeft size={14} /> Conversations
            </button>
          </div>
          <ChatWindow
            conversationId={activeId}
            onConversationCreated={(id) => {
              setActiveId(id);
              loadConversations();
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
