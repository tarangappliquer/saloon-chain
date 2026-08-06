import { memo } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

function ThemeToggleBase({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-xs transition hover:bg-muted focus:outline-hidden ${className}`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 text-slate-700 dark:text-slate-300 transition-transform duration-200 hover:-rotate-12" />
      )}
    </button>
  );
}

export const ThemeToggle = memo(ThemeToggleBase);
