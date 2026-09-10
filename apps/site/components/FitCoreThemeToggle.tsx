"use client";

import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.fcTheme = mode;
  localStorage.setItem("fitcore-theme", mode);
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  return mode === "dark" ? (
    <svg className="fcx-theme-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </svg>
  ) : (
    <svg className="fcx-theme-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.7 8.7 0 1 0 20.5 15.2Z" />
    </svg>
  );
}

export function FitCoreThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("fitcore-theme") as ThemeMode | null;
    const next = stored === "light" || stored === "dark" ? stored : "dark";
    setMode(next);
    document.documentElement.dataset.fcTheme = next;
  }, []);

  function toggle() {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      className={compact ? "fcx-theme-toggle is-compact" : "fcx-theme-toggle"}
      aria-label={mode === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
      aria-pressed={mode === "light"}
      onClick={toggle}
      title={mode === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
    >
      <ThemeIcon mode={mode} />
    </button>
  );
}
