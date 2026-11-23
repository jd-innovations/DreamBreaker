import React from "react";
import { AbsoluteFill, Composition, Sequence, useCurrentFrame } from "remotion";
import { SafeAreaGuide } from "./components";
import { S1Intro } from "./scenes/S1Intro";
import { S2Hub } from "./scenes/S2Hub";
import { S3Features } from "./scenes/S3Features";
import { S4Grid } from "./scenes/S4Grid";
import { S5Beats } from "./scenes/S5Beats";
import { S6Outro } from "./scenes/S6Outro";
import { FPS, H, W } from "./theme";

// Scene order and lengths follow the reference (pickleball_ad_reference.py).
export const SCENES: [React.FC<{ t: number }>, number][] = [
  [S1Intro, 5.0],
  [S2Hub, 3.5],
  [S3Features, 8.0], // reference: 6.0 — a fourth panel (Partner Finder) was added
  [S4Grid, 3.0],
  [S5Beats, 2.6],
  [S6Outro, 4.4],
];

const TOTAL = SCENES.reduce((n, [, d]) => n + Math.round(d * FPS), 0);

/** Hands a scene its local time in seconds, like the reference's scene(c, t). */
const Timed: React.FC<{ scene: React.FC<{ t: number }> }> = ({ scene: Scene }) => {
  const frame = useCurrentFrame();
  return <Scene t={frame / FPS} />;
};

type Props = { showSafeArea: boolean };

export const PromoAd: React.FC<Props> = ({ showSafeArea }) => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: "#FFFFFF" }}>
      {SCENES.map(([scene, d], i) => {
        const frames = Math.round(d * FPS);
        const seq = (
          <Sequence key={i} from={from} durationInFrames={frames}>
            <Timed scene={scene} />
          </Sequence>
        );
        from += frames;
        return seq;
      })}
      {showSafeArea && <SafeAreaGuide />}
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="PromoAd"
    component={PromoAd}
    durationInFrames={TOTAL}
    fps={FPS}
    width={W}
    height={H}
    defaultProps={{ showSafeArea: false }}
  />
);
