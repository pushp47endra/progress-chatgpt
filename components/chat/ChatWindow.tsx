"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Bug, AlertTriangle } from "lucide-react";
import { ChatMessage } from "./types";
import { MessageBubble } from "./MessageBubble";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea, EmptyState } from "@/components/ui/Basics";

type LoadingStage = null | "optimizing" | "thinking";

interface PendingError {
  type: "luna_unavailable";
  userMessageId: string;
}

export function ChatWindow({
  conversationId,
  onConversationCreated,
}: {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingStage, setLoadingStage] = useState<LoadingStage>(null);
  const [pendingError, setPendingError] = useState<PendingError | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);
  const [saveModalContent, setSaveModalContent] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [optimizerDegraded, setOptimizerDegraded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    fetch(`/api/conversations/${conversationId}`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loadingStage]);

  async function sendMessage(opts?: { skipOptimizer?: boolean; retryMessageId?: string }) {
    const text = opts?.retryMessageId ? undefined : input.trim();
    if (!opts?.retryMessageId && !text) return;

    setPendingError(null);
    setDebugInfo(null);
    setOptimizerDegraded(false);

    if (!opts?.retryMessageId) {
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          role: "user",
          content: text!,
          createdAt: new Date().toISOString(),
        },
      ]);
      setInput("");
    }

    setLoadingStage(opts?.skipOptimizer ? "thinking" : "optimizing");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: text,
          debugMode,
          skipOptimizer: opts?.skipOptimizer,
          retryMessageId: opts?.retryMessageId,
        }),
      });
      const data = await res.json();

      if (data.error === "luna_unavailable") {
        setPendingError({ type: "luna_unavailable", userMessageId: data.userMessageId });
        setLoadingStage(null);
        return;
      }
      if (!res.ok) {
        setPendingError({ type: "luna_unavailable", userMessageId: data.userMessageId });
        setLoadingStage(null);
        return;
      }

      if (!conversationId) onConversationCreated(data.conversationId);

      setLoadingStage("thinking");
      // Reconcile: replace temp user message + append assistant message.
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => !m.id.startsWith("temp-"));
        return [...withoutTemp, data.userMessage, data.assistantMessage];
      });
      if (data.debug) setDebugInfo(data.debug);
      // The optimizer failed but we safely fell back to sending the
      // original message straight to Luna - the reply still went through,
      // so this is just a soft heads-up, not a blocking error.
      if (data.optimizerFailed) setOptimizerDegraded(true);
    } catch {
      setPendingError({ type: "luna_unavailable", userMessageId: "" });
    } finally {
      setLoadingStage(null);
    }
  }

  function handleSaveNote(content: string) {
    setSaveModalContent(content);
    setNoteTitle(content.slice(0, 60));
  }

  async function confirmSaveNote() {
    if (!saveModalContent) return;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: noteTitle || "Saved from chat", content: saveModalContent }),
    });
    setSaveModalContent(null);
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <p className="text-sm font-medium">GATE AI Chat</p>
        <button
          onClick={() => setDebugMode((v) => !v)}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
            debugMode ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--muted)]"
          }`}
          title="Toggle developer/debug mode"
        >
          <Bug size={13} /> Debug {debugMode ? "On" : "Off"}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-8">
        {messages.length === 0 && !loadingStage && <EmptyState message="No conversations yet. Ask Luna anything about GATE CSE." />}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onRegenerate={
              m.role === "assistant"
                ? () => {
                    const priorUser = [...messages].reverse().find((x) => x.role === "user");
                    if (priorUser) sendMessage({ retryMessageId: priorUser.id });
                  }
                : undefined
            }
            onSave={m.role === "assistant" ? handleSaveNote : undefined}
          />
        ))}

        {loadingStage && (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
            {loadingStage === "optimizing" ? "Optimizing your question..." : "Luna is thinking..."}
          </div>
        )}

        {pendingError && (
          <div className="flex items-start gap-3 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 p-3 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--warning)]" />
            <div className="flex-1">
              <p className="font-medium">Luna is unavailable right now.</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">Your message was saved. You can retry.</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => sendMessage({ retryMessageId: pendingError.userMessageId })}
                >
                  Retry
                </Button>
              </div>
            </div>
          </div>
        )}

        {optimizerDegraded && (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)]/50 px-3 py-2 text-xs text-[var(--muted)]">
            <AlertTriangle size={13} className="shrink-0" />
            Optimizer AI was unavailable, so your message was sent to Luna as-is.
          </div>
        )}

        {debugInfo && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface2)]/50 p-3 text-xs">
            <p className="mb-1 font-semibold text-[var(--muted)]">Debug Mode</p>
            <p>
              <span className="text-[var(--muted)]">Original message:</span>{" "}
              {String(debugInfo.originalMessage)}
            </p>
            <p>
              <span className="text-[var(--muted)]">Optimizer used:</span>{" "}
              {String(debugInfo.optimizerUsed)}
              {Boolean(debugInfo.optimizerFailed) && " (failed - fell back to original message)"}
            </p>
            <p>
              <span className="text-[var(--muted)]">Optimized prompt:</span>{" "}
              {String(debugInfo.optimizedPrompt)}
            </p>
            <p>
              <span className="text-[var(--muted)]">Luna model:</span> {String(debugInfo.lunaModel)}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] p-3 md:p-4">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask Luna anything about GATE CSE..."
            rows={1}
            className="max-h-40 flex-1 resize-none"
          />
          <Button onClick={() => sendMessage()} disabled={!input.trim() || !!loadingStage}>
            <Send size={16} />
          </Button>
        </div>
      </div>

      <Modal open={!!saveModalContent} onClose={() => setSaveModalContent(null)} title="Save to Notes">
        <div className="space-y-3">
          <Input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Note title" />
          <Textarea value={saveModalContent || ""} readOnly rows={6} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSaveModalContent(null)}>
              Cancel
            </Button>
            <Button onClick={confirmSaveNote}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
