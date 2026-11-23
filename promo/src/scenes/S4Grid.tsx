import React from "react";
import { AbsoluteFill } from "remotion";
import { Line, words } from "../components";
import { Ball, Calendar, Chat, Check, Icon, IconComp, Net, Paddle, People, Pin, Trophy, Watch } from "../icons";
import { C, back, prog } from "../theme";

// Scene 4 (3.0s): a 5×5 grid alternating checks and icons, then the line.

const GRID: IconComp[] = [Ball, () => <Pin />, People, Calendar, Trophy, Chat, Paddle, Watch, Net, Ball];

export const S4Grid: React.FC<{ t: number }> = ({ t }) => {
  const cells: React.ReactNode[] = [];
  let n = 0;
  for (let r = 0; r < 5; r++) {
    for (let k = 0; k < 5; k++) {
      const x = 150 + k * 195;
      const y = 470 + r * 195;
      const s = back(prog(t, 0.05 + (r + k) * 0.09, 0.4));
      if ((r + k) % 2 === 0) {
        cells.push(<Icon key={`${r}${k}`} as={Check} x={x} y={y} s={0.95 * s} />);
      } else {
        cells.push(<Icon key={`${r}${k}`} as={GRID[n % GRID.length]} x={x} y={y} s={0.9 * s} rot={Math.sin(t * 2 + n) * 5} />);
        n++;
      }
    }
  }
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {cells}
      <Line words={words("Everything for your game.", { font: "soft", size: 74 })} y={1430} t={t} t0={1.25} stagger={0.06} />
      <Line words={words("One app.", { font: "bold", size: 80, color: C.green })} y={1540} t={t} t0={1.55} stagger={0.06} />
    </AbsoluteFill>
  );
};
