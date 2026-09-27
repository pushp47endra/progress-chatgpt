"use client";

import { useState } from "react";
import { Bot, User, RotateCcw, Copy, Check, BookmarkPlus } from "lucide-react";
import { ChatMessage } from "./types";

export function MessageBubble({
  message,
  onRegenerate,
  onSave,
}: {
  message: ChatMessage;
  onRegenerate?: () => void;
  onSave?: (content: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (e.g. insecure context) - not worth surfacing an error for.
    }
  }

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-[var(--surface2)] text-[var(--text)]"
            : "bg-[var(--accent)]/15 text-[var(--accent)]"
        }`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      <div className={`flex min-w-0 max-w-[85%] flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-[var(--accent)] text-white"
              : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
          }`}
        >
          {message.content}
        </div>

        {!isUser && (
          <div className="flex items-center gap-1 px-1 text-[var(--muted)]">
            <button
              onClick={handleCopy}
              className="rounded p-1 hover:bg-[var(--surface2)] hover:text-[var(--text)]"
              title="Copy"
              aria-label="Copy message"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="rounded p-1 hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                title="Regenerate response"
                aria-label="Regenerate response"
              >
                <RotateCcw size={13} />
              </button>
            )}
            {onSave && (
              <button
                onClick={() => onSave(message.content)}
                className="rounded p-1 hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                title="Save to Notes"
                aria-label="Save to Notes"
              >
                <BookmarkPlus size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
