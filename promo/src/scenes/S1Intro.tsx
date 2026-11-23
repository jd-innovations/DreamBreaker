import React from "react";
import { AbsoluteFill } from "remotion";
import { Line, words } from "../components";
import { ICONS, Icon } from "../icons";
import { C, H, W, back, eio, eo, lerp, prog, seeded } from "../theme";

// Scene 1 (5.0s): a field of icons pops in, parts from the centre, and the
// logo + "The operating system for pickleball." rise into the gap.

const rng = seeded(7);
const uni = (a: number, b: number) => a + (b - a) * rng();
const COLS = 5;
const ROWS = 8;
const FIELD = Array.from({ length: ROWS * COLS }, (_, i) => {
  const r = Math.floor(i / COLS);
  const k = i % COLS;
  return {
    x: (k + 0.5) * (W / COLS) + uni(-30, 30) + (r % 2 ? W / COLS / 2 : 0) - W / COLS / 4,
    y: (r + 0.5) * (H / ROWS) + uni(-30, 30),
    as: ICONS[(r * 3 + k * 2) % ICONS.length],
    s: uni(0.95, 1.25),
    rot: uni(-25, 25),
    ph: uni(0, 6.28),
    d: uni(0, 0.7),
  };
});

export const S1Intro: React.FC<{ t: number }> = ({ t }) => {
  const push = eio(prog(t, 1.5, 0.9));
  const glow = eo(prog(t, 2.0, 0.6));
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {FIELD.map((it, i) => {
        const dx = it.x - W / 2;
        const dy = (it.y - H / 2) * 0.62;
        const d = Math.hypot(dx, dy) + 1e-3;
        const k = Math.max(0, 560 - d) / 560;
        const off = push * (120 + 420 * k);
        const x = it.x + (dx / d) * off;
        const y = it.y + ((dy / 0.62 / d) * off * 0.75);
        const bob = Math.sin(t * 1.6 + it.ph) * 10;
        const s = back(prog(t, it.d, 0.5)) * it.s * lerp(1, 0.82, push);
        return <Icon key={i} as={it.as} x={x} y={y + bob} s={s} rot={it.rot + Math.sin(t * 1.1 + it.ph) * 6} />;
      })}
      {/* white glow behind the headline */}
      <div
        style={{
          position: "absolute",
          left: W / 2 - 500,
          top: 740,
          width: 1000,
          height: 520,
          borderRadius: "50%",
          background: C.bg,
          opacity: glow,
          filter: "blur(50px)",
        }}
      />
      <Line words={[{ logo: true, height: 130 }]} y={895} t={t} t0={2.1} dur={0.5} />
      <Line words={words("The operating system", { font: "soft", size: 84, color: C.ink })} y={1035} t={t} t0={2.45} stagger={0.06} />
      <Line words={words("for pickleball.", { font: "soft", size: 84, color: C.ink })} y={1130} t={t} t0={2.7} stagger={0.06} />
    </AbsoluteFill>
  );
};
