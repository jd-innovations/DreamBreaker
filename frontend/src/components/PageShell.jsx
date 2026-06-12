import React from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";

export const PageShell = ({ children, hideFooter = false }) => {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1">{children}</main>
      {!hideFooter && <Footer />}
    </div>
  );
};
