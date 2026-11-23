import React from "react";
import { AbsoluteFill } from "remotion";
import { Bubble, Line, Phone, words } from "../components";
import { Chat, Icon, IconComp, People, Pin, Trophy } from "../icons";
import { C, H, W, back, eio, eo, lerp, font, prog } from "../theme";

// Scene 3 (8.0s): four 2s panels, each a real app screen, joined by a
// circular wipe. Overlays (pulses, taps, toasts) sit on top of the
// screenshots; the screenshots themselves are untouched.

const PHONE = { cx: W / 2, top: 450, width: 600 };

/** Faint court lines behind the phone. */
const Court: React.FC<{ color: string }> = ({ color }) => (
  <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
    <g stroke={color} fill="none" strokeLinecap="round">
      <rect x={90} y={410} width={W - 180} height={H - 530} strokeWidth={10} strokeOpacity={0.22} />
      <line x1={90} y1={1150} x2={W - 90} y2={1150} strokeWidth={14} strokeOpacity={0.3} />
      <line x1={90} y1={900} x2={W - 90} y2={900} strokeWidth={10} strokeOpacity={0.22} />
      <line x1={90} y1={1400} x2={W - 90} y2={1400} strokeWidth={10} strokeOpacity={0.22} />
      <line x1={W / 2} y1={410} x2={W / 2} y2={900} strokeWidth={10} strokeOpacity={0.22} />
      <line x1={W / 2} y1={1400} x2={W / 2} y2={H - 120} strokeWidth={10} strokeOpacity={0.22} />
    </g>
  </svg>
);

const Headline: React.FC<{ text: string; t: number; icon: IconComp }> = ({ text, t, icon }) => (
  <>
    <Line words={words(text, { font: "bold", size: 68 })} y={330} t={t} t0={0.05} stagger={0.05} dur={0.4} />
    <Bubble x={W - 140} y={560} r={84} s={back(prog(t, 0.4, 0.5))}>
      <Icon as={icon} x={84} y={80} s={0.9} />
    </Bubble>
  </>
);

const phoneRise = (t: number) => ({ transform: `translateY(${(1 - eo(prog(t, 0, 0.5))) * 320}px)` });

/** Expanding ring, the reference's tap/pulse. */
const Ring: React.FC<{ x: number; y: number; p: number; r0: number; r1: number; color: string; alpha: number }> = ({ x, y, p, r0, r1, color, alpha }) => {
  const r = lerp(r0, r1, p);
  return (
    <div
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        background: color,
        opacity: alpha * (1 - p),
      }}
    />
  );
};

/** A fingertip that glides to a target and taps. */
const Finger: React.FC<{ t: number; from: [number, number]; to: [number, number]; t0: number }> = ({ t, from, to, t0 }) => {
  if (t < t0 || t > t0 + 0.95) return null;
  const m = eo(prog(t, t0, 0.45));
  const x = lerp(from[0], to[0], m);
  const y = lerp(from[1], to[1], m);
  const rp = prog(t, t0 + 0.4, 0.4);
  return (
    <>
      {rp > 0 && <Ring x={x} y={y} p={rp} r0={20} r1={80} color={C.white} alpha={0.75} />}
      <div
        style={{
          position: "absolute",
          left: x - 32,
          top: y - 32,
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.88)",
          border: "3px solid rgba(10,18,40,0.25)",
          boxShadow: "0 6px 18px rgba(10,18,40,0.25)",
        }}
      />
    </>
  );
};

/** Green outline around a region of the screen; the rest of the screen dims. */
const Outline: React.FC<{ x: number; y: number; w: number; h: number; p: number }> = ({ x, y, w, h, p }) =>
  p <= 0 ? null : (
    <div
      style={{
        position: "absolute",
        left: x - 6,
        top: y - 6,
        width: w + 12,
        height: h + 12,
        borderRadius: 30,
        border: `6px solid ${C.green}`,
        boxShadow: `0 0 0 ${10 * (1 - p)}px rgba(18,161,80,0.25), 0 0 0 3000px rgba(10,18,40,${0.42 * p})`,
        opacity: p,
      }}
    />
  );

const Toast: React.FC<{ text: string; x: number; y: number; s: number }> = ({ text, x, y, s }) =>
  s <= 0 ? null : (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${s})`,
        background: C.green,
        color: C.white,
        fontFamily: font,
        fontWeight: 800,
        fontSize: 40,
        padding: "20px 34px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        gap: 14,
        boxShadow: "0 16px 36px rgba(18,161,80,0.38)",
      }}
    >
      <svg width={34} height={34} viewBox="-20 -20 40 40">
        <path d="M -11 1 L -3 9 L 12 -8" fill="none" stroke={C.white} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {text}
    </div>
  );

// ---------- panels ----------

// Screens are cropped from the framed App Store screenshots
// (fastlane/screenshots/en-US, 939×2048). Overlay points were measured on the
// 660px web copies, so map them across: same x, y scaled plus a measured
// vertical offset (explore 4px, tournament 2px).
const SCREEN = { w: 939, h: 2048 };
const at = (x660: number, y660: number, dy: number): [number, number] => [x660 / 660, (y660 * (939 / 660) + dy) / SCREEN.h];
const box = (x: number, y: number, w: number, h: number, dy: number) => {
  const [fx, fy] = at(x, y, dy);
  return { x: fx, y: fy, w: w / 660, h: (h * (939 / 660)) / SCREEN.h };
};

// Real pin heads on the Explore map.
const MAP_PINS: [number, number][] = [
  at(172, 734, 4),
  at(554, 734, 4),
  at(328, 932, 4),
  at(604, 916, 4),
  at(430, 1214, 4),
];
const YOU_ARE_HERE = at(328, 986, 4);

const PanelMap: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Court color={C.green} />
    <Phone src="screens/explore.png" aspect={SCREEN.h / SCREEN.w} {...PHONE} style={phoneRise(t)}>
      {({ toPx }) => {
        const [yx, yy] = toPx(...YOU_ARE_HERE);
        const yp = (t * 0.9) % 1;
        return (
          <>
            <Ring x={yx} y={yy} p={yp} r0={16} r1={90} color={C.blue} alpha={0.4} />
            {MAP_PINS.map(([fx, fy], i) => {
              const t0 = 0.55 + i * 0.22;
              if (t < t0) return null;
              const [x, y] = toPx(fx, fy);
              const gp = ((t - t0) * 1.2) % 1;
              const pop = back(prog(t, t0, 0.4), 2.2);
              return (
                <React.Fragment key={i}>
                  <Ring x={x} y={y} p={gp} r0={14} r1={70} color={C.green} alpha={0.55} />
                  <div
                    style={{
                      position: "absolute",
                      left: x - 22,
                      top: y - 22,
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      border: `5px solid ${C.green}`,
                      transform: `scale(${pop})`,
                    }}
                  />
                </React.Fragment>
              );
            })}
          </>
        );
      }}
    </Phone>
    <Headline text="Find courts near you." t={t} icon={() => <Pin />} />
  </AbsoluteFill>
);

// Pompano Open Play card on events.png.
const OPEN_PLAY_CARD = { x: 32 / SCREEN.w, y: 392 / SCREEN.h, w: 875 / SCREEN.w, h: 519 / SCREEN.h };

const PanelOpenPlay: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Court color={C.blue} />
    <Phone src="screens/events.png" aspect={SCREEN.h / SCREEN.w} {...PHONE} style={phoneRise(t)}>
      {({ w, h, toPx }) => {
        const [x, y] = toPx(OPEN_PLAY_CARD.x, OPEN_PLAY_CARD.y);
        const cw = OPEN_PLAY_CARD.w * w;
        const ch = OPEN_PLAY_CARD.h * h;
        const tap: [number, number] = [x + cw * 0.5, y + ch * 0.55];
        return (
          <>
            <Outline x={x} y={y} w={cw} h={ch} p={eo(prog(t, 0.95, 0.35))} />
            <Finger t={t} from={[w * 0.95, h * 0.62]} to={tap} t0={0.5} />
            <Toast text="You're in!" x={w / 2} y={y + ch + 70} s={back(prog(t, 1.2, 0.45))} />
          </>
        );
      }}
    </Phone>
    <Headline text="Join open play tonight." t={t} icon={People} />
  </AbsoluteFill>
);

// Partner Finder (Mia Carter, a demo profile with an AI-generated photo): the
// green "connect" button.
const CONNECT_BTN: [number, number] = [615 / SCREEN.w, 1243 / SCREEN.h];

const PanelPartner: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Court color={C.coral} />
    <Phone src="screens/partner.png" aspect={SCREEN.h / SCREEN.w} {...PHONE} style={phoneRise(t)}>
      {({ w, h, toPx }) => {
        const [bx, by] = toPx(...CONNECT_BTN);
        const pulse = prog(t, 0.95, 0.5);
        return (
          <>
            {pulse > 0 && <Ring x={bx} y={by} p={pulse} r0={30} r1={110} color={C.green} alpha={0.6} />}
            <Finger t={t} from={[w * 0.92, h * 0.78]} to={[bx, by]} t0={0.5} />
            <Toast text="It's a Match!" x={w / 2} y={h * 0.505} s={back(prog(t, 1.15, 0.45))} />
          </>
        );
      }}
    </Phone>
    <Headline text="Find your partner." t={t} icon={Chat} />
  </AbsoluteFill>
);

// Futures Classic: the Mixed Doubles division and the Register Now button.
const DIVISION = box(30, 770, 600, 200, 2);
const REGISTER = box(28, 1250, 604, 104, 2);
const TOURNAMENT_SHIFT = 0.04;

const PanelTournament: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Court color={C.gold} />
    <Phone src="screens/tournament.png" aspect={SCREEN.h / SCREEN.w} {...PHONE} shift={TOURNAMENT_SHIFT} style={phoneRise(t)}>
      {({ w, h, toPx }) => {
        const [dx, dy] = toPx(DIVISION.x, DIVISION.y);
        const [rx, ry] = toPx(REGISTER.x, REGISTER.y);
        const rw = REGISTER.w * w;
        const rh = REGISTER.h * h;
        const tap: [number, number] = [rx + rw / 2, ry + rh / 2];
        return (
          <>
            <Outline x={dx} y={dy} w={DIVISION.w * w} h={DIVISION.h * h} p={eo(prog(t, 0.45, 0.35)) * (1 - eo(prog(t, 1.0, 0.2)))} />
            <Outline x={rx} y={ry} w={rw} h={rh} p={eo(prog(t, 1.05, 0.25))} />
            <Finger t={t} from={[w * 0.9, h * 0.45]} to={tap} t0={0.75} />
            <Toast text="Registered" x={w / 2} y={ry - 70} s={back(prog(t, 1.35, 0.45))} />
          </>
        );
      }}
    </Phone>
    <Headline text="Enter tournaments." t={t} icon={Trophy} />
  </AbsoluteFill>
);

const PANELS: [React.FC<{ t: number }>, number][] = [
  [PanelMap, 0],
  [PanelOpenPlay, 2],
  [PanelPartner, 4],
  [PanelTournament, 6],
];
const WIPE = 0.35;

export const S3Features: React.FC<{ t: number }> = ({ t }) => {
  let idx = 0;
  PANELS.forEach(([, st], i) => {
    if (t >= st) idx = i;
  });
  const [Panel, st] = PANELS[idx];
  const lt = t - st;
  if (idx > 0 && lt < WIPE) {
    const [Prev, pst] = PANELS[idx - 1];
    const r = eio(lt / WIPE) * 1250;
    return (
      <AbsoluteFill>
        <Prev t={t - pst} />
        <AbsoluteFill style={{ clipPath: `circle(${r}px at ${W / 2}px ${H / 2}px)` }}>
          <Panel t={lt} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  return <Panel t={lt} />;
};
