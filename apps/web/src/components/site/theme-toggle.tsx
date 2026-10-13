"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      aria-label="Toggle color theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="group inline-flex size-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
    >
      <span className="inline-flex size-9 items-center justify-center rounded-md transition-colors group-hover:bg-accent">
        <Sun className="size-4 dark:hidden" />
        <Moon className="hidden size-4 dark:block" />
      </span>
    </button>
  );
}
