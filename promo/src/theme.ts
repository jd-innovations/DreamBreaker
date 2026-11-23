import { loadFont as loadManrope } from "@remotion/google-fonts/Manrope";
import { loadFont as loadNewsreader } from "@remotion/google-fonts/Newsreader";

export const W = 1080;
export const H = 1920;
export const FPS = 30;

/** The 4:5 centre crop (1080×1350). All key content stays inside it. */
export const SAFE = { top: (H - 1350) / 2, bottom: (H + 1350) / 2 };

// Brand: navy from apps/mobile/src/theme/colors.ts. Accent green and the
// icon palette come from the reference ad (owner approved, 2026-11-23).
export const C = {
  bg: "#FFFFFF",
  ink: "#0A1228",
  inkSoft: "rgba(10,18,40,0.55)",
  green: "#12A150",
  greenTint: "#E6F6D2",
  ball: "#DDF247",
  ballDark: "#B4CC2A",
  coral: "#FF5A3C",
  blue: "#2F6BFF",
  blueLight: "#7FA6FF",
  navyIcon: "#1B3A6B",
  gold: "#F2B630",
  goldDark: "#D99A1E",
  white: "#FFFFFF",
};

export const manrope = loadManrope("normal", { weights: ["600", "800"], subsets: ["latin"] }).fontFamily;
export const newsreader = loadNewsreader("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;

// ---------- easing (ported from the reference script) ----------
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const prog = (t: number, t0: number, d: number) => clamp((t - t0) / d);
export const eo = (x: number) => 1 - (1 - x) ** 3;
export const eio = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
export const back = (x: number, s = 1.8) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2;
};
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;

/** Deterministic PRNG so every render lays out the icon field identically. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
