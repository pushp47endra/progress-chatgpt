import clsx from "clsx";
import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx("h-2 w-full rounded-full bg-[var(--surface2)]", className)}>
      <div
        className="h-2 rounded-full bg-[var(--accent)] transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

const statusColors: Record<string, string> = {
  low: "text-[var(--muted)] bg-[var(--surface2)]",
  medium: "text-[var(--warning)] bg-[var(--surface2)]",
  high: "text-[var(--danger)] bg-[var(--surface2)]",
  completed: "text-[var(--success)] bg-[var(--surface2)]",
  missed: "text-[var(--danger)] bg-[var(--surface2)]",
  not_started: "text-[var(--muted)] bg-[var(--surface2)]",
};

export function Badge({ tone = "medium", children }: { tone?: string; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-block rounded-md px-2 py-0.5 text-xs font-medium",
        statusColors[tone] || statusColors.medium
      )}
    >
      {children}
    </span>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "w-full rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
        props.className
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        "w-full rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
        props.className
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "w-full rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
        props.className
      )}
    />
  );
}

export function Checkbox({
  checked,
  onChange,
  className,
}: {
  checked: boolean;
  onChange: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={clsx(
        "h-5 w-5 flex items-center justify-center rounded border transition-colors shrink-0",
        checked
          ? "bg-[var(--accent)] border-[var(--accent)]"
          : "border-[var(--border)] bg-[var(--surface2)]",
        className
      )}
    >
      {checked && (
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
          <path
            d="M4 10l4 4 8-8"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-10 text-sm text-[var(--muted)]">
      {message}
    </div>
  );
}