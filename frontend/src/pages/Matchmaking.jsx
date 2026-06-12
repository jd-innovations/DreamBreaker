import React, { useState, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { Heart, X, Star, MapPin, Lightning, ArrowCounterClockwise, ChatCircle } from "@phosphor-icons/react";
import { PageShell } from "../components/PageShell";
import { matchPartners } from "../data/mockData";
import { Button } from "../components/ui/button";
import { toast } from "sonner";

const SwipeCard = ({ player, onSwipe, isTop, idx }) => {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-18, 18]);
  const likeOpacity = useTransform(x, [0, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-120, 0], [1, 0]);

  if (!isTop) {
    return (
      <div className="absolute inset-0 rounded-3xl overflow-hidden border border-border bg-card" style={{ transform: `scale(${1 - idx * 0.04}) translateY(${idx * 12}px)`, zIndex: 5 - idx }}>
        <img src={player.img} alt="" className="h-full w-full object-cover opacity-60" />
      </div>
    );
  }

  return (
    <motion.div
      style={{ x, rotate, zIndex: 10 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={(e, info) => {
        if (info.offset.x > 120) onSwipe("right", player);
        else if (info.offset.x < -120) onSwipe("left", player);
      }}
      className="absolute inset-0 rounded-3xl overflow-hidden border border-border bg-card cursor-grab active:cursor-grabbing shadow-2xl"
      data-testid={`swipe-card-${player.id}`}
    >
      <img src={player.img} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/10" />

      {/* LIKE / NOPE overlays */}
      <motion.div style={{ opacity: likeOpacity }} className="absolute top-8 left-8 px-4 py-2 border-4 border-primary rounded-xl rotate-[-12deg]">
        <span className="font-display text-4xl text-primary tracking-widest">MATCH</span>
      </motion.div>
      <motion.div style={{ opacity: nopeOpacity }} className="absolute top-8 right-8 px-4 py-2 border-4 border-destructive rounded-xl rotate-[12deg]">
        <span className="font-display text-4xl text-destructive tracking-widest">PASS</span>
      </motion.div>

      {/* Content */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end">
        <div className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-mono text-xs font-bold tracking-wider">
          DUPR {player.dupr.toFixed(2)}
        </div>
        <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur text-white text-[10px] font-mono">
          <MapPin size={10} weight="bold" className="inline mr-1" />{player.distance}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
        <div className="font-display text-4xl tracking-wide leading-none">{player.name.toUpperCase()}, {player.age}</div>
        <div className="font-mono text-xs text-white/70 mt-1 tracking-wider">{player.location.toUpperCase()}</div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {player.badges.map((b) => (
            <span key={b} className="text-[10px] font-mono tracking-wider px-2 py-1 rounded-full bg-white/10 backdrop-blur border border-white/20">{b}</span>
          ))}
        </div>
        <p className="text-sm text-white/90 mt-3 leading-snug max-w-md">{player.bio}</p>
        <div className="flex gap-3 mt-3 text-xs text-white/70">
          <span><Star size={12} weight="fill" className="inline text-primary mr-1" />{player.style}</span>
          <span>·</span>
          <span>{player.availability}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default function Matchmaking() {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState([]);
  const [matches, setMatches] = useState([]);

  const visible = useMemo(() => matchPartners.slice(index, index + 3), [index]);
  const current = matchPartners[index];

  const handleSwipe = (dir, player) => {
    setHistory((h) => [...h, { index, dir }]);
    if (dir === "right") {
      setMatches((m) => [...m, player]);
      toast.success(`Match with ${player.name}!`, { description: "Send a message to lock in a tournament together." });
    }
    setIndex((i) => i + 1);
  };

  const undo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    if (last.dir === "right") setMatches((m) => m.slice(0, -1));
    setIndex(last.index);
  };

  const reset = () => {
    setIndex(0);
    setHistory([]);
    setMatches([]);
  };

  return (
    <PageShell hideFooter>
      <section className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-2">/ PARTNER FINDER</div>
          <h1 className="font-display text-5xl sm:text-6xl tracking-wide">SWIPE. MATCH. <span className="text-primary">PLAY.</span></h1>
          <p className="text-muted-foreground mt-2 max-w-xl text-sm">
            Pickleball partners within your DUPR and zip code. Swipe right to match, left to pass. Mutual matches unlock chat + tournament invites.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 items-start">
        {/* Card stack */}
        <div className="flex flex-col items-center">
          <div className="relative w-full max-w-sm aspect-[3/4]" data-testid="swipe-stack">
            {current ? (
              <AnimatePresence>
                {visible.map((p, i) => (
                  <SwipeCard key={p.id} player={p} isTop={i === 0} idx={i} onSwipe={handleSwipe} />
                ))}
              </AnimatePresence>
            ) : (
              <div className="absolute inset-0 rounded-3xl border border-dashed border-border bg-card flex flex-col items-center justify-center p-8 text-center">
                <Lightning size={36} weight="fill" className="text-primary mb-3" />
                <h3 className="font-display text-3xl tracking-wide">{`YOU'RE ALL CAUGHT UP`}</h3>
                <p className="text-muted-foreground text-sm mt-2 mb-5">No more partners in your radius. Widen your search or check back later.</p>
                <Button onClick={reset} className="rounded-full bg-primary text-primary-foreground font-display tracking-[0.2em]" data-testid="reset-swipe-btn">
                  RESHUFFLE
                </Button>
              </div>
            )}
          </div>

          {/* Controls */}
          {current && (
            <div className="flex items-center gap-4 mt-8">
              <button
                onClick={() => handleSwipe("left", current)}
                data-testid="swipe-pass-btn"
                className="h-14 w-14 rounded-full border border-border bg-card flex items-center justify-center text-destructive hover:scale-105 hover:border-destructive transition-transform"
                aria-label="Pass"
              >
                <X size={22} weight="bold" />
              </button>
              <button
                onClick={undo}
                disabled={history.length === 0}
                data-testid="swipe-undo-btn"
                className="h-12 w-12 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:scale-105 transition-transform disabled:opacity-30"
                aria-label="Undo"
              >
                <ArrowCounterClockwise size={18} weight="bold" />
              </button>
              <button
                onClick={() => handleSwipe("right", current)}
                data-testid="swipe-like-btn"
                className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-110 transition-transform animate-pulse-glow"
                aria-label="Match"
              >
                <Heart size={24} weight="fill" />
              </button>
            </div>
          )}
        </div>

        {/* Sidebar: matches */}
        <aside className="border border-border rounded-2xl bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-2xl tracking-wide">YOUR MATCHES</h3>
            <span className="font-mono text-xs text-primary">{matches.length} TOTAL</span>
          </div>

          {matches.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-xl">
              Start swiping to find your next partner.
            </div>
          ) : (
            <div className="space-y-3" data-testid="matches-list">
              {matches.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary transition-colors">
                  <img src={m.img} alt="" className="h-12 w-12 rounded-full object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{m.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">DUPR {m.dupr} · {m.location}</div>
                  </div>
                  <button className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors" data-testid={`chat-${m.id}`}>
                    <ChatCircle size={16} weight="fill" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="pt-4 border-t border-border space-y-2">
            <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">FILTERS</div>
            {[
              { label: "DUPR Range", value: "3.5 – 4.5" },
              { label: "Distance", value: "Within 25 mi" },
              { label: "Format", value: "Mixed Doubles" },
            ].map((f) => (
              <div key={f.label} className="flex justify-between text-xs py-1">
                <span className="text-muted-foreground">{f.label}</span>
                <span className="font-semibold">{f.value}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </PageShell>
  );
}
