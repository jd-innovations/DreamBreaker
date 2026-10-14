"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Fades its children up the first time they scroll into view (the `.reveal`
 * rules in globals.css). Server-rendered markup is fully visible: the element
 * is only hidden after mount, and only if it starts below the fold, so nothing
 * depends on JS to be readable and nothing already on screen blinks out.
 * Skipped entirely for prefers-reduced-motion.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** ms; use for a ripple across a row of cards. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.dataset.reveal = "hidden";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.reveal = "shown";
        io.disconnect();
      },
      { rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={["reveal", className].filter(Boolean).join(" ")} style={{ "--d": `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}
