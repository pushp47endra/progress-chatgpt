"use client";

import { useEffect } from "react";

/**
 * Applies the user's saved theme (dark/light) to <body> on load.
 * Renders nothing - this is a side-effect-only component included once in
 * the root layout so theme preference (set on the Settings page) takes
 * effect across the whole app without a full page reload.
 */
export function ThemeSync() {
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const theme = d?.settings?.theme;
        if (theme === "light" || theme === "dark") {
          document.body.classList.remove("theme-dark", "theme-light");
          document.body.classList.add(`theme-${theme}`);
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
