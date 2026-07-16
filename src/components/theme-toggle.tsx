"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const value = window.localStorage.getItem("theme-mode");
  return value === "dark" ? "dark" : "light";
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    const initial = getStoredTheme();
    setMode(initial);
    applyTheme(initial);
  }, []);

  const toggle = () => {
    const nextMode: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(nextMode);
    window.localStorage.setItem("theme-mode", nextMode);
    applyTheme(nextMode);
  };

  return (
    <button
      onClick={toggle}
      className={`group flex items-center rounded-xl border border-slate-300/60 bg-white/90 text-[10px] font-black uppercase tracking-widest text-slate-700 transition-all hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 ${
        compact ? "gap-1.5 px-2.5 py-2" : "gap-2 px-4 py-2"
      }`}
      aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
    >
      {mode === "dark" ? (
        <>
          <Sun className="h-3.5 w-3.5 text-amber-400" />
          Light
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5 text-slate-500" />
          Dark
        </>
      )}
    </button>
  );
}
