"use client";

import { useEffect } from "react";
import { resolveTheme, THEME_STORAGE_KEY } from "@/lib/theme.mjs";

function applyTheme(preference) {
  const theme = resolveTheme(preference, window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeSync() {
  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystem = () => {
      let preference;
      try { preference = localStorage.getItem(THEME_STORAGE_KEY); } catch {}
      applyTheme(preference);
    };
    const syncStorage = (event) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) syncSystem();
    };
    syncSystem();
    system.addEventListener("change", syncSystem);
    window.addEventListener("storage", syncStorage);
    return () => {
      system.removeEventListener("change", syncSystem);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);
  return null;
}

export default function ThemeToggle({ floating = false }) {
  function toggle() {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
  }

  // Both icons are server-rendered; CSS selects the correct one before hydration.
  return (
    <button type="button" onClick={toggle} className={`theme-toggle${floating ? " theme-toggle-floating" : ""}`}>
      <span className="theme-to-light"><span aria-hidden="true">☀️</span><span className="sr-only">Aktifkan Light Mode</span></span>
      <span className="theme-to-dark"><span aria-hidden="true">🌙</span><span className="sr-only">Aktifkan Dark Mode</span></span>
    </button>
  );
}
