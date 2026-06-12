import React, { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({ theme: "dark", setTheme: () => {} });

export const ThemeProvider = ({ children, defaultTheme = "dark" }) => {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === "undefined") return defaultTheme;
    return localStorage.getItem("dbpb-theme") || defaultTheme;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("dbpb-theme", theme);
  }, [theme]);

  const setTheme = (t) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
