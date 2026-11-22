"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = window.sessionStorage.getItem("tka-theme");
    const systemTheme = window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
    const initialTheme = saved || systemTheme;

    Promise.resolve().then(() => {
      setTheme(initialTheme);
      setReady(true);
    });
    document.documentElement.dataset.tkaTheme = initialTheme;
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.sessionStorage.setItem("tka-theme", next);
      document.documentElement.dataset.tkaTheme = next;
      return next;
    });
  }

  const value = useMemo(() => ({ theme, toggleTheme, ready }), [theme, ready]);
  return (
    <ThemeContext.Provider value={value}>
      <div style={{ visibility: ready ? "visible" : "hidden" }}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme harus digunakan di dalam ThemeProvider");
  return context;
}
