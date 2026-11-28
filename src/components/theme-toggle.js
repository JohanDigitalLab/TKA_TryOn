"use client";

import { Moon, Sun } from "lucide-react";
import { createPortal } from "react-dom";
import { useTheme } from "@/components/theme-provider";

export default function ThemeToggle() {
  const { theme, toggleTheme, ready } = useTheme();
  if (!ready) return null;

  const dark = theme === "dark";
  const label = `Aktifkan mode ${dark ? "terang" : "gelap"}`;

  // Render outside page stacking contexts so headers and game overlays cannot cover it.
  return createPortal(
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      data-global-theme-toggle
      className="fixed z-[2147483647] flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 shadow-lg transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-slate-800"
      style={{
        left: "max(1rem, env(safe-area-inset-left))",
        bottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      {dark ? <Sun size={22} aria-hidden="true" /> : <Moon size={22} aria-hidden="true" />}
    </button>,
    document.body,
  );
}
