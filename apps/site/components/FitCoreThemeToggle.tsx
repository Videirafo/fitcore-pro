"use client";

import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.fcTheme = mode;
  localStorage.setItem("fitcore-theme", mode);
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
      aria-label="Alternar contraste claro ou escuro"
      aria-pressed={mode === "light"}
      onClick={toggle}
      title={mode === "dark" ? "Ativar contraste claro" : "Ativar contraste escuro"}
    >
      <span>{mode === "dark" ? "◐" : "☀"}</span>
    </button>
  );
}
