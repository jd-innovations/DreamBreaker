import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, SAFE, W, eo, manrope, newsreader, prog } from "./theme";

// ---------- text ----------

export type Font = "serif" | "sans";

export type Word =
  | { text: string; font: Font; size: number; weight?: number; color?: string; italic?: boolean }
  | { logo: true; height: number };

/**
 * A line of words (or the logo) that rise and fade in one after another, the
 * reference's draw_line. `y` is the line's vertical centre.
 */
export const Line: React.FC<{
  words: Word[];
  y: number;
  t: number;
  t0: number;
  stagger?: number;
  dur?: number;
  rise?: number;
  gap?: number;
}> = ({ words, y, t, t0, stagger = 0.07, dur = 0.45, rise = 36, gap = 0.26 }) => {
  const first = words[0];
  const gapPx = ("size" in first ? first.size : first.height) * gap;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        width: W,
        top: y,
        transform: "translateY(-50%)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: gapPx,
      }}
    >
      {words.map((w, i) => {
        const p = eo(prog(t, t0 + i * stagger, dur));
        const style: React.CSSProperties = { opacity: p, transform: `translateY(${(1 - p) * rise}px)` };
        if ("logo" in w) return <Logo key={i} height={w.height} style={style} />;
        return (
          <span
            key={i}
            style={{
              ...style,
              fontFamily: w.font === "serif" ? newsreader : manrope,
              fontSize: w.size,
              fontWeight: w.weight ?? (w.font === "serif" ? 400 : 800),
              fontStyle: w.italic ? "italic" : "normal",
              color: w.color ?? C.ink,
              lineHeight: 1.1,
              letterSpacing: w.font === "sans" ? "-0.02em" : "-0.01em",
              whiteSpace: "nowrap",
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};

/** Split a phrase into same-styled words. */
export const words = (phrase: string, style: Omit<Extract<Word, { text: string }>, "text">): Word[] =>
  phrase.split(" ").map((text) => ({ text, ...style }));

// ---------- brand ----------

// web/public/brand/logo-pickleball-app.png: navy + gold, for light grounds.
// 780×134 source, so keep it at or under ~700px wide to stay crisp.
const LOGO_RATIO = 780 / 134;

export const Logo: React.FC<{ height: number; style?: React.CSSProperties }> = ({ height, style }) => (
  <Img src={staticFile("logo.png")} style={{ height, width: height * LOGO_RATIO, ...style }} />
);

/** The App Store icon as an iOS-style rounded square. */
export const AppIcon: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <Img
    src={staticFile("app-icon.png")}
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.2237,
      boxShadow: `0 ${size * 0.06}px ${size * 0.16}px rgba(10,18,40,0.22)`,
      ...style,
    }}
  />
);

// ---------- phone with a real app screen ----------

export type Highlight = { x: number; y: number; w: number; h: number }; // fractions of the screen image

/**
 * A phone showing a real screenshot. `shift` crops that fraction off the top
 * of the screenshot (as if scrolled) so the part that matters sits in the
 * 4:5 safe area.
 */
export const Phone: React.FC<{
  src: string;
  aspect: number; // image height / width
  cx: number;
  top: number;
  width: number;
  shift?: number;
  children?: (screen: { w: number; h: number; toPx: (fx: number, fy: number) => [number, number] }) => React.ReactNode;
  style?: React.CSSProperties;
}> = ({ src, aspect, cx, top, width, shift = 0, children, style }) => {
  const bezel = 16;
  const sw = width - bezel * 2;
  const sh = sw * aspect;
  const offset = sh * shift;
  const toPx = (fx: number, fy: number): [number, number] => [fx * sw, fy * sh - offset];
  return (
    <div
      style={{
        position: "absolute",
        left: cx - width / 2,
        top,
        width,
        height: sh - offset + bezel * 2,
        borderRadius: 78,
        background: C.ink,
        padding: bezel,
        boxShadow: "0 30px 70px rgba(10,18,40,0.28)",
        ...style,
      }}
    >
      <div style={{ position: "relative", width: sw, height: "100%", borderRadius: 62, overflow: "hidden", background: C.white }}>
        <Img src={staticFile(src)} style={{ position: "absolute", left: 0, top: -offset, width: sw, height: sh }} />
        {children?.({ w: sw, h: sh, toPx })}
      </div>
    </div>
  );
};

// ---------- small pieces ----------

/** White disc with a drop shadow, holding an icon (the reference's "bubble"). */
export const Bubble: React.FC<{ x: number; y: number; r: number; s: number; children: React.ReactNode }> = ({ x, y, r, s, children }) => {
  if (s <= 0) return null;
  return (
    <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, transform: `scale(${s})` }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: C.white,
          boxShadow: "0 14px 34px rgba(10,18,40,0.16)",
        }}
      />
      {children}
    </div>
  );
};

/** Dev aid: outlines the 4:5 centre crop. Off in the final render. */
export const SafeAreaGuide: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <div
      style={{
        position: "absolute",
        left: 0,
        width: W,
        top: SAFE.top,
        height: SAFE.bottom - SAFE.top,
        outline: "4px dashed rgba(255,0,128,0.8)",
        outlineOffset: -4,
      }}
    />
  </AbsoluteFill>
);
