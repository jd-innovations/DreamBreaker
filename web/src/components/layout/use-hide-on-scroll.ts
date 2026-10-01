"use client";

// Facebook-style bars for the phone layout (owner, 2026-09-30): hide while the
// page scrolls down, come back the moment it scrolls up, always shown near the
// top. Desktop never hides; callers apply the result with `max-lg:` classes.
//
// A small threshold keeps sub-pixel and rubber-band jitter from flickering the
// bars. Reduce Motion is handled in CSS (motion-reduce:transition-none), so the
// bars still get out of the way, just without sliding.

import { useEffect, useState } from "react";

const SHOW_NEAR_TOP = 64; // px from the top where the bars always show
const THRESHOLD = 6;      // px of movement before the direction counts

export function useHideOnScroll(forceShow = false): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY;
      if (y < SHOW_NEAR_TOP) setHidden(false);
      else if (delta > THRESHOLD) setHidden(true);
      else if (delta < -THRESHOLD) setHidden(false);
      if (Math.abs(delta) > THRESHOLD || y < SHOW_NEAR_TOP) lastY = y;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return hidden && !forceShow;
}
