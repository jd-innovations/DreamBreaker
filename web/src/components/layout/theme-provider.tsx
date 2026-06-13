"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
type ThemeContextValue = { theme: Theme; toggle: () => void };

const ThemeContext = createContext<ThemeContextValue>({ theme: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start with "dark" to match SSR — blocking script in <head> already applied
  // the correct class to <html> before paint, so there's no visible flash.
  const [theme, setTheme] = useState<Theme>("dark");

  // Sync React state with whatever class the blocking script already applied.
  useEffect(() => {
    const applied = document.documentElement.classList.contains("light") ? "light" : "dark";
    setTheme(applied);
  }, []);

  const toggle = () => {
    // Read from the DOM directly — never trust stale React state.
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    try { localStorage.setItem("dbpb-theme", next); } catch {}
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
