"use client";

import { useLayoutEffect, useRef } from "react";

const format = (n: number) => n.toLocaleString("en-US");

/**
 * Counts from 0 to `value` when first scrolled into view. The server renders
 * the real number, so it is correct without JS and for crawlers; the reset to
 * 0 happens before first paint. Reduced-motion users just see the number.
 *
 * Frames write textContent directly rather than going through state: `value`
 * never changes after mount, so React never re-renders this text over it, and
 * a ~70-frame count doesn't cost ~70 renders.
 */
export function CountUp({ value, duration = 1200 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value <= 0 || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    el.textContent = format(0);
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        el.textContent = format(Math.round(value * (1 - Math.pow(1 - t, 3))));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      el.textContent = format(value);
    };
  }, [value, duration]);

  return <span ref={ref} className="tabular-nums">{format(value)}</span>;
}
