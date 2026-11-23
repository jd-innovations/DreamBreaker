import React from "react";
import { C } from "./theme";

// The colorful icon set from the reference ad, redrawn as SVG. Each draws in a
// ~100-unit box centred on 0,0 (same coordinates as the reference), so sizes
// and positions port across unchanged.

const blur = (px: number): React.CSSProperties => ({ filter: `blur(${px}px)` });

const Shadow: React.FC<{ r?: number; dy?: number }> = ({ r = 44, dy = 58 }) => (
  <ellipse cx={0} cy={dy} rx={r} ry={9} fill={C.ink} opacity={0.1} style={blur(5)} />
);

const BALL_DOTS: [number, number][] = [
  [-20, -22], [8, -30], [26, -6], [-30, 4], [-6, -2], [18, 20], [-14, 26], [32, 14],
];

export const BallFace: React.FC = () => (
  <g>
    <circle r={46} fill={C.ball} />
    <circle cx={-12} cy={-14} r={30} fill={C.white} opacity={0.25} style={blur(8)} />
    {BALL_DOTS.map(([x, y]) => (
      <circle key={`${x},${y}`} cx={x} cy={y} r={5.2} fill={C.ballDark} />
    ))}
    <circle r={46} fill="none" stroke={C.ballDark} strokeOpacity={0.6} strokeWidth={2} />
  </g>
);

export const Ball: React.FC = () => (
  <g>
    <Shadow />
    <BallFace />
  </g>
);

export const Paddle: React.FC = () => (
  <g>
    <Shadow r={34} dy={64} />
    <g transform="rotate(-18)">
      <rect x={-9} y={30} width={18} height={40} rx={6} fill={C.ink} />
      {[0, 1, 2, 3].map((k) => (
        <line key={k} x1={-9} y1={38 + k * 9} x2={9} y2={34 + k * 9} stroke={C.white} strokeOpacity={0.25} strokeWidth={2} strokeLinecap="round" />
      ))}
      <rect x={-38} y={-62} width={76} height={98} rx={34} ry={30} fill={C.navyIcon} />
      <rect x={-30} y={-54} width={60} height={82} rx={28} ry={24} fill={C.blue} />
      <rect x={-30} y={-54} width={60} height={82} rx={28} ry={24} fill="none" stroke={C.white} strokeOpacity={0.18} strokeWidth={3} />
    </g>
  </g>
);

/** Map pin: circle + point, filled as one shape. */
export const PinShape: React.FC<{ r?: number; color: string }> = ({ r = 38, color }) => (
  <g fill={color}>
    <circle cx={0} cy={-r * 0.55} r={r} />
    <path d={`M ${-r * 0.86} ${-r * 0.05} L 0 ${r * 1.25} L ${r * 0.86} ${-r * 0.05} Z`} />
  </g>
);

export const Pin: React.FC<{ color?: string }> = ({ color = C.coral }) => (
  <g>
    <Shadow r={26} dy={56} />
    <PinShape color={color} />
    <circle cx={0} cy={-21} r={15} fill={C.white} />
  </g>
);

export const Calendar: React.FC = () => (
  <g>
    <Shadow />
    <rect x={-42} y={-40} width={84} height={84} rx={14} fill={C.white} />
    <rect x={-42} y={-40} width={84} height={84} rx={14} fill="none" stroke={C.ink} strokeOpacity={0.12} strokeWidth={2} />
    <path d="M -42 -14 V -26 Q -42 -40 -28 -40 H 28 Q 42 -40 42 -26 V -14 Z" fill={C.coral} />
    {[-20, 20].map((k) => (
      <rect key={k} x={k - 4} y={-50} width={8} height={18} rx={4} fill={C.ink} />
    ))}
    {[0, 1, 2].map((i) =>
      [0, 1].map((j) => {
        const on = i === 1 && j === 1;
        return <circle key={`${i}${j}`} cx={-22 + i * 22} cy={4 + j * 20} r={6.5} fill={on ? C.green : C.ink} opacity={on ? 1 : 0.18} />;
      }),
    )}
  </g>
);

export const Trophy: React.FC = () => (
  <g>
    <Shadow r={34} dy={58} />
    <rect x={-30} y={36} width={60} height={14} rx={5} fill={C.ink} />
    <rect x={-7} y={10} width={14} height={28} fill={C.goldDark} />
    <circle cx={-38} cy={-22} r={15} fill="none" stroke={C.gold} strokeWidth={7} />
    <circle cx={38} cy={-22} r={15} fill="none" stroke={C.gold} strokeWidth={7} />
    <path d="M -36 -44 L 36 -44 C 36 0 18 16 0 16 C -18 16 -36 0 -36 -44 Z" fill={C.gold} />
    <rect x={-20} y={-40} width={8} height={40} fill={C.white} opacity={0.35} />
  </g>
);

export const People: React.FC = () => (
  <g>
    <Shadow />
    {([
      [-18, C.blueLight, 0.85],
      [16, C.blue, 1],
    ] as const).map(([x, color, s]) => (
      <g key={x} transform={`translate(${x} 0) scale(${s})`} fill={color}>
        <circle cx={0} cy={-20} r={18} />
        <path d="M -32 37 A 32 33 0 0 1 32 37 Z" />
      </g>
    ))}
  </g>
);

export const Chat: React.FC = () => (
  <g>
    <Shadow />
    <g fill={C.green}>
      <rect x={-46} y={-36} width={92} height={62} rx={22} />
      <path d="M -20 22 L -30 44 L 0 24 Z" />
    </g>
    {[-20, 0, 20].map((k) => (
      <circle key={k} cx={k} cy={-5} r={6} fill={C.white} />
    ))}
  </g>
);

export const Net: React.FC = () => (
  <g>
    <Shadow r={50} dy={50} />
    <rect x={-50} y={-26} width={100} height={52} fill={C.white} />
    <g stroke={C.ink} strokeOpacity={0.35} strokeWidth={2}>
      {Array.from({ length: 9 }, (_, i) => -50 + 12.5 * i).map((k) => (
        <line key={`v${k}`} x1={k} y1={-26} x2={k} y2={26} />
      ))}
      {[-26, -13, 0, 13, 26].map((k) => (
        <line key={`h${k}`} x1={-50} y1={k} x2={50} y2={k} />
      ))}
    </g>
    <rect x={-52} y={-30} width={104} height={8} fill={C.ink} />
    {[-54, 54].map((k) => (
      <rect key={k} x={k - 4} y={-34} width={8} height={74} rx={3} fill={C.ink} />
    ))}
  </g>
);

export const Watch: React.FC = () => (
  <g>
    <Shadow />
    <rect x={-10} y={-58} width={20} height={12} rx={4} fill={C.ink} />
    <circle r={44} fill={C.white} />
    <circle r={44} fill="none" stroke={C.ink} strokeWidth={7} />
    <line x1={0} y1={0} x2={0} y2={-28} stroke={C.green} strokeWidth={7} strokeLinecap="round" />
    <line x1={0} y1={0} x2={18} y2={10} stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
    <circle r={6} fill={C.ink} />
  </g>
);

export const Check: React.FC = () => (
  <g fill="none" stroke={C.green} strokeLinecap="round" strokeLinejoin="round">
    <circle r={40} strokeWidth={7} />
    <path d="M -18 1 L -5 14 L 19 -12" strokeWidth={8} />
  </g>
);

export type IconComp = React.FC;
export const ICONS: IconComp[] = [Ball, Paddle, () => <Pin />, Calendar, Trophy, People, Chat, Net, Watch];

/**
 * One icon placed on the 1080×1920 canvas. `size` 1 = the reference's 100-unit
 * box drawn at 100px. Rendered as its own small SVG so CSS transforms compose.
 */
export const Icon: React.FC<{
  as: IconComp;
  x: number;
  y: number;
  s?: number;
  rot?: number;
  alpha?: number;
}> = ({ as: Comp, x, y, s = 1, rot = 0, alpha = 1 }) => {
  if (s <= 0.01 || alpha <= 0) return null;
  const box = 160;
  return (
    <svg
      width={box}
      height={box}
      viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`}
      style={{
        position: "absolute",
        left: x - box / 2,
        top: y - box / 2,
        transform: `rotate(${rot}deg) scale(${s})`,
        opacity: alpha,
        overflow: "visible",
      }}
    >
      <Comp />
    </svg>
  );
};
