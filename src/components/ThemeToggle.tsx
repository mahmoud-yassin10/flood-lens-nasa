import { useEffect, useState } from "react";

import type { ThemeMode } from "@/lib/theme";

interface ThemeToggleProps {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}

export function ThemeToggle({ mode, onModeChange }: ThemeToggleProps) {
  const [isDark, setIsDark] = useState(mode === "dark");

  useEffect(() => {
    setIsDark(mode === "dark");
  }, [mode]);

  const handleToggle = () => {
    const next = isDark ? "light" : "dark";
    setIsDark((prev) => !prev);
    onModeChange(next);
  };

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={handleToggle}
      className="rounded-md border border-border bg-panel px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-secondary"
    >
      {isDark ? "Dark" : "Light"} mode
    </button>
  );
}
