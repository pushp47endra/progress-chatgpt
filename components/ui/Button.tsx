"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed",
          size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm",
          variant === "primary" &&
            "bg-[var(--accent)] text-white hover:brightness-110",
          variant === "secondary" &&
            "bg-[var(--surface2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface)]",
          variant === "ghost" && "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)]",
          variant === "danger" && "bg-[var(--danger)] text-white hover:brightness-110",
          className
        )}
        {...props}
      >
        {loading && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";