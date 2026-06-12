import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Sun, Moon, List, X } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { useTheme } from "./ThemeProvider";
import { Logo } from "./Logo";

const navLinks = [
  { to: "/tournaments", label: "Tournaments", testid: "nav-tournaments" },
  { to: "/matchmaking", label: "Matchmaking", testid: "nav-matchmaking" },
  { to: "/dashboard", label: "Player", testid: "nav-player" },
  { to: "/director", label: "Director", testid: "nav-director" },
  { to: "/admin", label: "Admin", testid: "nav-admin" },
];

export const Header = () => {
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border" data-testid="site-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="shrink-0" data-testid="header-logo-link">
          <Logo />
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {navLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              data-testid={l.testid}
              className={({ isActive }) =>
                `px-4 py-2 text-sm font-semibold rounded-full transition-colors ${
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            data-testid="theme-toggle-btn"
            aria-label="Toggle theme"
            className="h-10 w-10 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
          >
            {theme === "dark" ? <Sun size={18} weight="bold" /> : <Moon size={18} weight="bold" />}
          </button>

          <Button
            variant="ghost"
            className="hidden sm:inline-flex rounded-full px-5 font-semibold"
            onClick={() => navigate("/auth")}
            data-testid="header-login-btn"
          >
            Login
          </Button>
          <Button
            className="rounded-full px-5 font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => navigate("/auth?mode=signup")}
            data-testid="header-getstarted-btn"
          >
            Get Started
          </Button>

          <button
            className="lg:hidden h-10 w-10 rounded-full border border-border flex items-center justify-center"
            onClick={() => setOpen(!open)}
            data-testid="mobile-menu-toggle"
            aria-label="Menu"
          >
            {open ? <X size={18} weight="bold" /> : <List size={18} weight="bold" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-border bg-background" data-testid="mobile-menu">
          <div className="px-4 py-3 flex flex-col gap-1">
            {navLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                data-testid={`mobile-${l.testid}`}
                className={({ isActive }) =>
                  `px-4 py-3 rounded-lg text-sm font-semibold ${
                    isActive ? "bg-secondary text-foreground" : "text-muted-foreground"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};
