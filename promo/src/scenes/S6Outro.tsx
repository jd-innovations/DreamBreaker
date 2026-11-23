import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { AppIcon, Line, Logo, words } from "../components";
import { C, W, back, eio, eo, lerp, font, prog } from "../theme";

// Scene 6 (4.4s): "Stay in the game with [logo]" → app icon + logo lockup
// → Apple's official "Download on the App Store" badge (public/app-store-badge.svg,
// from developer.apple.com, used unmodified as Apple's guidelines require).

const BADGE_RATIO = 119.66407 / 40;
const BADGE_H = 120;

export const S6Outro: React.FC<{ t: number }> = ({ t }) => {
  const out = eo(prog(t, 1.35, 0.3));
  const iconIn = back(prog(t, 1.6, 0.6), 1.6);
  const up = eio(prog(t, 2.3, 0.45));
  const a = eo(prog(t, 2.55, 0.4));
  const b = back(prog(t, 3.0, 0.5));
  const iconSize = lerp(340, 280, up);
  const iconY = lerp(960, 700, up);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {out < 1 && (
        <AbsoluteFill style={{ opacity: 1 - out }}>
          <Line words={words("Stay in the game", { font: "soft", size: 88 })} y={900} t={t} t0={0.05} stagger={0.07} />
          <Line words={[{ text: "with", font: "soft", size: 88 }, { logo: true, height: 98 }]} y={1030} t={t} t0={0.3} stagger={0.08} />
        </AbsoluteFill>
      )}

      {iconIn > 0 && (
        <AppIcon
          size={iconSize}
          style={{
            position: "absolute",
            left: W / 2 - iconSize / 2,
            top: iconY - iconSize / 2,
            transform: `scale(${iconIn}) rotate(${(1 - iconIn) * -12}deg)`,
          }}
        />
      )}

      {a > 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            width: W,
            top: 910,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            opacity: a,
            transform: `translateY(${(1 - a) * 30}px)`,
          }}
        >
          <Logo height={125} />
          <div style={{ fontFamily: font, fontWeight: 600, fontSize: 46, color: C.inkSoft }}>Courts &amp; Games</div>
        </div>
      )}

      {b > 0 && (
        <Img
          src={staticFile("app-store-badge.svg")}
          style={{
            position: "absolute",
            left: W / 2 - (BADGE_H * BADGE_RATIO) / 2,
            top: 1260,
            height: BADGE_H,
            width: BADGE_H * BADGE_RATIO,
            transform: `scale(${b})`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
