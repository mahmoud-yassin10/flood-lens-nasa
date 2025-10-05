import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";
export type BasemapChoice = "auto" | "light" | "dark" | "satellite";

export const THEME_STORAGE_KEY = "flood-lens-theme";
export const BASEMAP_LABELS: Record<BasemapChoice, string> = {
  auto: "Auto",
  light: "Light",
  dark: "Dark",
  satellite: "Satellite",
};
export const BASEMAP_CHOICES: BasemapChoice[] = ["auto", "light", "dark", "satellite"];

export function detectPreferredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.theme = mode;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  }
}

export function useThemeMode(): [ThemeMode, (mode: ThemeMode | ((prev: ThemeMode) => ThemeMode)) => void] {
  const [mode, setMode] = useState<ThemeMode>(() => detectPreferredTheme());

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(THEME_STORAGE_KEY) : null;
    if (stored === "light" || stored === "dark") {
      setMode(stored);
    }
  }, []);

  return [mode, setMode];
}
