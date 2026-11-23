import React from "react";
import { AbsoluteFill } from "remotion";
import { BallFace } from "../icons";
import { C, W, back, eo, lerp, font, prog } from "../theme";

// Scene 5 (2.6s): three beats; each dims as the next lands.

const BEATS: [string, number][] = [
  ["Sign up.", 0.05],
  ["Find a game.", 0.6],
  ["Play today.", 1.15],
];

export const S5Beats: React.FC<{ t: number }> = ({ t }) => {
  const bs = back(prog(t, 1.45, 0.5));
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {BEATS.map(([txt, t0], i) => {
        const p = eo(prog(t, t0, 0.4));
        if (p <= 0) return null;
        const next = i + 1 < BEATS.length ? BEATS[i + 1][1] : 99;
        const dim = eo(prog(t, next, 0.3));
        const last = i === BEATS.length - 1;
        return (
          <div
            key={txt}
            style={{
              position: "absolute",
              left: 0,
              width: W,
              top: 700 + i * 180,
              textAlign: "center",
              fontFamily: font,
              fontWeight: 800,
              fontSize: last ? 140 : 118,
              letterSpacing: "-0.03em",
              color: last ? C.green : C.ink,
              opacity: p * lerp(1, 0.28, dim),
              transform: `scale(${lerp(0.85, 1, back(p))})`,
            }}
          >
            {txt}
          </div>
        );
      })}
      {bs > 0 && (
        <svg
          width={160}
          height={160}
          viewBox="-80 -80 160 160"
          style={{
            position: "absolute",
            left: W / 2 - 80,
            top: 1330 - 80 + Math.sin(t * 6) * 12,
            transform: `scale(${bs}) rotate(${t * 90}deg)`,
          }}
        >
          <BallFace />
        </svg>
      )}
    </AbsoluteFill>
  );
};
