import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";
export type Accent = "rose" | "indigo" | "violet";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  accent: Accent;
  setAccent: (a: Accent) => void;
};

const STORAGE_THEME_KEY = "saloon.theme";
const STORAGE_ACCENT_KEY = "saloon.accent";

function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

function resolveInitialAccent(): Accent {
  if (typeof window === "undefined") return "rose";
  const stored = window.localStorage.getItem(STORAGE_ACCENT_KEY) as Accent;
  if (stored && ["rose", "indigo", "violet"].includes(stored)) return stored;
  return "rose";
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(resolveInitialTheme);
  const [accent, setAccentState] = useState<Accent>(resolveInitialAccent);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    window.localStorage.setItem(STORAGE_THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("accent-rose", "accent-indigo", "accent-violet");
    root.classList.add(`accent-${accent}`);
    window.localStorage.setItem(STORAGE_ACCENT_KEY, accent);
  }, [accent]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
      accent,
      setAccent: setAccentState,
    }),
    [theme, accent],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside a <ThemeProvider>");
  }
  return ctx;
}
