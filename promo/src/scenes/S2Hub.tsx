import React from "react";
import { AbsoluteFill } from "remotion";
import { AppIcon, Bubble, Line, words } from "../components";
import { Calendar, Icon, IconComp, People, Pin, Trophy } from "../icons";
import { C, W, back, eio, eo, font, prog } from "../theme";

// Scene 2 (3.5s): the app icon at the centre, connected to four bubbles.

const HUB = { x: W / 2, y: 1110 };
const BUBS: [IconComp, string, number, number][] = [
  [() => <Pin />, "Courts", -330, -160],
  [People, "Players", 330, -160],
  [Calendar, "Open play", -330, 250],
  [Trophy, "Tournaments", 330, 250],
];

export const S2Hub: React.FC<{ t: number }> = ({ t }) => {
  const hs = back(prog(t, 0.45, 0.6));
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Line words={[{ logo: true, height: 105 }]} y={410} t={t} t0={0.05} />
      <Line words={words("connects you to", { font: "soft", size: 74 })} y={530} t={t} t0={0.2} stagger={0.06} />
      <Line words={words("everything you need:", { font: "soft", size: 74 })} y={622} t={t} t0={0.35} stagger={0.06} />

      <svg width={W} height={1920} style={{ position: "absolute", inset: 0 }}>
        {BUBS.map(([, , dx, dy], i) => {
          const p = eio(prog(t, 0.9 + i * 0.22, 0.45));
          if (p <= 0) return null;
          return (
            <line
              key={i}
              x1={HUB.x}
              y1={HUB.y}
              x2={HUB.x + dx * p}
              y2={HUB.y + dy * p}
              stroke={C.green}
              strokeOpacity={0.55}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray="16 14"
              strokeDashoffset={t * 40}
            />
          );
        })}
      </svg>

      {hs > 0 && (
        <div
          style={{
            position: "absolute",
            left: HUB.x - 205,
            top: HUB.y - 205,
            width: 410,
            height: 410,
            borderRadius: "50%",
            background: C.greenTint,
            border: `4px solid rgba(18,161,80,0.25)`,
            transform: `scale(${hs})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppIcon size={250} style={{ transform: `translateY(${Math.sin(t * 2) * 6}px)` }} />
        </div>
      )}

      {BUBS.map(([as, label, dx, dy], i) => {
        const s = back(prog(t, 1.05 + i * 0.22, 0.5));
        const bx = HUB.x + dx;
        const by = HUB.y + dy + Math.sin(t * 1.8 + i) * 8;
        const a = eo(prog(t, 1.25 + i * 0.22, 0.35));
        return (
          <React.Fragment key={label}>
            <Bubble x={bx} y={by} r={108} s={s}>
              <Icon as={as} x={108} y={102} s={1.05} />
            </Bubble>
            <div
              style={{
                position: "absolute",
                left: bx - 200,
                width: 400,
                top: by + 132,
                textAlign: "center",
                fontFamily: font,
                fontWeight: 600,
                fontSize: 42,
                color: C.ink,
                opacity: a,
              }}
            >
              {label}
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
