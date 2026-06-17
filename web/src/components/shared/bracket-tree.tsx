"use client";

import { useState } from "react";

export interface BracketSeed {
  player_id: string;
  seed_number: number;
  name: string;
  dupr: number | null;
  skill_level: string | null;
}

interface BracketMatchData {
  round: number;
  matchIdx: number;
  topSeedNum: number | null;
  botSeedNum: number | null;
  topName: string;
  botName: string;
  topBye: boolean;
  botBye: boolean;
  topAdvances: boolean;
  botAdvances: boolean;
}

// ── Layout constants ──────────────────────────────────────────────────────────

const MH = 62;   // match card height (px)
const MW = 182;  // match card width (px)
const GAP = 8;   // gap between adjacent R1 match cards (px)
const CW = 36;   // connector column width (px)
const UNIT = MH + GAP;

function matchCenterY(round: number, idx: number): number {
  // Center y of match (round, idx) in the overall bracket coordinate space
  // R1: centers at MH/2, MH/2+UNIT, MH/2+2*UNIT, ...
  // R2: centered between pairs of R1 matches
  const step = UNIT * Math.pow(2, round - 1);
  const first = MH / 2 + (UNIT / 2) * (Math.pow(2, round - 1) - 1);
  return first + step * idx;
}

function matchTopY(round: number, idx: number): number {
  return matchCenterY(round, idx) - MH / 2;
}

function bracketHeight(size: number): number {
  return (size / 2) * UNIT - GAP;
}

// ── Compute rounds ────────────────────────────────────────────────────────────

function computeRounds(seeds: BracketSeed[]): BracketMatchData[][] {
  const n = seeds.length;
  if (n < 2) return [];
  let size = 1;
  while (size < n) size *= 2;

  const byNum = new Map(seeds.map((s) => [s.seed_number, s]));

  // Round 1
  const r1: BracketMatchData[] = [];
  for (let i = 0; i < size / 2; i++) {
    const topNum = i + 1;
    const botNum = size - i;
    const topP = byNum.get(topNum);
    const botP = byNum.get(botNum);
    r1.push({
      round: 1, matchIdx: i,
      topSeedNum: topP ? topNum : null,
      botSeedNum: botP ? botNum : null,
      topName: topP?.name ?? "BYE",
      botName: botP?.name ?? "BYE",
      topBye: !topP,
      botBye: !botP,
      topAdvances: false,
      botAdvances: false,
    });
  }

  const rounds: BracketMatchData[][] = [r1];
  let prev = r1;

  const totalRounds = Math.log2(size);
  for (let r = 2; r <= totalRounds; r++) {
    const cur: BracketMatchData[] = [];
    for (let i = 0; i < prev.length / 2; i++) {
      const srcTop = prev[i * 2];
      const srcBot = prev[i * 2 + 1];

      let topName = "TBD";
      let botName = "TBD";
      let topAdvances = false;
      let botAdvances = false;

      if (srcTop.botBye)       { topName = srcTop.topName; topAdvances = true; }
      else if (srcTop.topBye)  { topName = srcTop.botName; topAdvances = true; }
      if (srcBot.botBye)       { botName = srcBot.topName; botAdvances = true; }
      else if (srcBot.topBye)  { botName = srcBot.botName; botAdvances = true; }

      cur.push({
        round: r, matchIdx: i,
        topSeedNum: null, botSeedNum: null,
        topName, botName,
        topBye: false, botBye: false,
        topAdvances, botAdvances,
      });
    }
    rounds.push(cur);
    prev = cur;
  }

  return rounds;
}

// ── Connector SVG paths ───────────────────────────────────────────────────────

function ConnectorPaths({ rounds, roundIdx }: { rounds: BracketMatchData[][]; roundIdx: number }) {
  const srcRound = rounds[roundIdx];
  if (!srcRound) return null;

  const paths: string[] = [];
  for (let i = 0; i < srcRound.length / 2; i++) {
    const topY = matchCenterY(roundIdx + 1, i * 2);
    const botY = matchCenterY(roundIdx + 1, i * 2 + 1);
    const nextY = matchCenterY(roundIdx + 2, i); // = (topY+botY)/2
    const midX = CW / 2;

    // ] bracket bar
    paths.push(`M 0,${topY} H ${midX} V ${botY} H 0`);
    // horizontal to next match
    paths.push(`M ${midX},${nextY} H ${CW}`);
  }

  return (
    <>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
      ))}
    </>
  );
}

// ── Match card ────────────────────────────────────────────────────────────────

function MatchCard({
  match,
  locked,
  selectedSeedNum,
  onSlotClick,
}: {
  match: BracketMatchData;
  locked: boolean;
  selectedSeedNum: number | null;
  onSlotClick: (seedNum: number | null) => void;
}) {
  const canInteract = !locked && match.round === 1;
  const topSelected = selectedSeedNum !== null && selectedSeedNum === match.topSeedNum;
  const botSelected = selectedSeedNum !== null && selectedSeedNum === match.botSeedNum;
  const topHighlight = selectedSeedNum !== null && !match.topBye && match.round === 1 && !topSelected;
  const botHighlight = selectedSeedNum !== null && !match.botBye && match.round === 1 && !botSelected;

  const slotBase = "w-full flex items-center gap-2 px-2.5 border-b border-border/50 last:border-0 transition-colors text-left";

  return (
    <div
      className={`absolute rounded-xl border overflow-hidden shadow-sm transition-all ${
        topSelected || botSelected
          ? "border-primary shadow-primary/20"
          : "border-border"
      } bg-card`}
      style={{ width: MW, height: MH, top: matchTopY(match.round, match.matchIdx) }}
    >
      {/* Top slot */}
      <button
        disabled={!canInteract || match.topBye}
        onClick={() => canInteract && !match.topBye && onSlotClick(match.topSeedNum)}
        className={`${slotBase} h-1/2 ${
          topSelected
            ? "bg-primary/15 text-primary"
            : topHighlight
            ? "hover:bg-primary/8 cursor-pointer"
            : canInteract && !match.topBye
            ? "hover:bg-secondary/60 cursor-pointer"
            : "cursor-default"
        } ${match.topBye ? "opacity-25" : ""}`}
      >
        {match.topSeedNum !== null && (
          <span className="font-mono text-[9px] text-primary/70 w-4 flex-shrink-0 leading-none">{match.topSeedNum}</span>
        )}
        <span className={`text-[11px] font-medium truncate flex-1 ${match.topName === "TBD" ? "text-muted-foreground italic" : ""}`}>
          {match.topName}
        </span>
        {match.topAdvances && (
          <span className="font-mono text-[8px] text-primary/50 tracking-wider flex-shrink-0">BYE</span>
        )}
      </button>

      {/* Bottom slot */}
      <button
        disabled={!canInteract || match.botBye}
        onClick={() => canInteract && !match.botBye && onSlotClick(match.botSeedNum)}
        className={`${slotBase} h-1/2 ${
          botSelected
            ? "bg-primary/15 text-primary"
            : botHighlight
            ? "hover:bg-primary/8 cursor-pointer"
            : canInteract && !match.botBye
            ? "hover:bg-secondary/60 cursor-pointer"
            : "cursor-default"
        } ${match.botBye ? "opacity-25" : ""}`}
      >
        {match.botSeedNum !== null && (
          <span className="font-mono text-[9px] text-primary/70 w-4 flex-shrink-0 leading-none">{match.botSeedNum}</span>
        )}
        <span className={`text-[11px] font-medium truncate flex-1 ${match.botName === "TBD" ? "text-muted-foreground italic" : ""}`}>
          {match.botName}
        </span>
        {match.botAdvances && (
          <span className="font-mono text-[8px] text-primary/50 tracking-wider flex-shrink-0">BYE</span>
        )}
      </button>
    </div>
  );
}

// ── Round label ───────────────────────────────────────────────────────────────

function roundLabel(round: number, totalRounds: number): string {
  if (round === totalRounds) return "FINAL";
  if (round === totalRounds - 1) return totalRounds >= 3 ? "SEMI" : "SEMI";
  if (round === totalRounds - 2 && totalRounds >= 4) return "QF";
  return `ROUND ${round}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export function BracketTree({
  seeds,
  locked,
  onSwapSeeds,
}: {
  seeds: BracketSeed[];
  locked: boolean;
  onSwapSeeds: (seedNumA: number, seedNumB: number) => void;
}) {
  const [selectedSeedNum, setSelectedSeedNum] = useState<number | null>(null);

  const rounds = computeRounds(seeds);
  if (rounds.length === 0) return null;

  let size = 1;
  while (size < seeds.length) size *= 2;

  const totalRounds = rounds.length;
  const totalW = totalRounds * MW + (totalRounds - 1) * CW;
  const totalH = bracketHeight(size);

  const handleSlotClick = (seedNum: number | null) => {
    if (seedNum === null) return;
    if (selectedSeedNum === null) {
      setSelectedSeedNum(seedNum);
    } else if (selectedSeedNum === seedNum) {
      setSelectedSeedNum(null);
    } else {
      onSwapSeeds(selectedSeedNum, seedNum);
      setSelectedSeedNum(null);
    }
  };

  return (
    <div className="overflow-x-auto pb-2">
      {!locked && (
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-4">
          {selectedSeedNum !== null
            ? `SEED ${selectedSeedNum} SELECTED — CLICK ANOTHER SLOT TO SWAP`
            : "CLICK A PLAYER SLOT TO SELECT · CLICK ANOTHER TO SWAP SEEDS"}
        </p>
      )}
      {locked && (
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-4">
          BRACKET LOCKED — UNLOCK TO EDIT SEEDS
        </p>
      )}

      <div className="relative" style={{ width: totalW, height: totalH }}>
        {/* SVG connector lines */}
        <svg
          className="absolute inset-0 text-border pointer-events-none"
          width={totalW}
          height={totalH}
          style={{ overflow: "visible" }}
        >
          {rounds.slice(0, -1).map((_, rIdx) => {
            const colX = rIdx * (MW + CW) + MW;
            return (
              <g key={rIdx} transform={`translate(${colX}, 0)`}>
                <ConnectorPaths rounds={rounds} roundIdx={rIdx} />
              </g>
            );
          })}
        </svg>

        {/* Match cards per round */}
        {rounds.map((roundMatches, rIdx) => {
          const colX = rIdx * (MW + CW);
          return (
            <div key={rIdx}>
              {/* Round label */}
              <div
                className="absolute font-mono text-[9px] tracking-[0.25em] text-muted-foreground"
                style={{ left: colX, top: -20, width: MW, textAlign: "center" }}
              >
                {roundLabel(rIdx + 1, totalRounds)}
              </div>

              {/* Match cards */}
              <div className="absolute" style={{ left: colX, top: 0, width: MW, height: totalH }}>
                {roundMatches.map((match) => (
                  <MatchCard
                    key={match.matchIdx}
                    match={match}
                    locked={locked}
                    selectedSeedNum={selectedSeedNum}
                    onSlotClick={handleSlotClick}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
