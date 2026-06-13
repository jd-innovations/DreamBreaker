"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lightning, MapPin, Calendar, Clock, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";

type HoldRow = {
  id: string;
  status: string;
  hold_expires_at: string | null;
  hold_fee_paid_cents: number;
  entry_fee_paid_cents: number;
  tournament: {
    id: string;
    name: string;
    city: string;
    state: string;
    event_date: string;
    entry_fee_cents: number;
    hold_fee_cents: number;
    cover_img_url: string | null;
  } | null;
};

function expiresIn(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

const DEFAULT_IMG = "https://images.unsplash.com/photo-1737477004595-e9b659bb44ca?w=800&q=80";

export default function HoldsPage() {
  const [holds, setHolds] = useState<HoldRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("registrations")
        .select(`
          id, status, hold_expires_at, hold_fee_paid_cents, entry_fee_paid_cents,
          tournament:tournaments(id,name,city,state,event_date,entry_fee_cents,hold_fee_cents,cover_img_url)
        `)
        .eq("player_id", user.id)
        .in("status", ["held", "registered", "checked_in"])
        .order("created_at", { ascending: false });

      setHolds((data ?? []) as unknown as HoldRow[]);
      setLoading(false);
    });
  }, []);

  return (
    <PageShell>
      <section className="border-b border-border bg-card/40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="font-mono text-[11px] tracking-[0.3em] text-primary mb-2">/ MY HOLDS</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-wide">HELD SPOTS</h1>
          <p className="text-muted-foreground text-sm mt-1.5">Tournaments you&apos;ve locked in. Confirm before they expire.</p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="border border-border rounded-2xl bg-card overflow-hidden animate-pulse">
                <div className="h-28 bg-secondary" />
                <div className="p-5 space-y-3">
                  <div className="h-3 bg-secondary rounded w-1/2" />
                  <div className="h-10 bg-secondary rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : holds.length === 0 ? (
          <div className="border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
            <Lightning size={32} weight="duotone" className="mx-auto mb-3 text-primary" />
            <div className="font-display text-2xl tracking-wide mb-1">NO HELD SPOTS</div>
            <p className="text-sm mb-6">Hold a spot in any tournament to reserve your entry.</p>
            <Link href="/tournaments">
              <button className="rounded-full h-11 px-6 bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm transition-colors">
                BROWSE TOURNAMENTS
              </button>
            </Link>
          </div>
        ) : (
          holds.map((h) => {
            const t = h.tournament;
            if (!t) return null;
            const isHeld = h.status === "held";
            const isConfirmed = h.status === "registered" || h.status === "checked_in";
            const dateDisplay = new Date(t.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            const remaining = isHeld && h.hold_expires_at ? expiresIn(h.hold_expires_at) : null;
            const balanceDue = Math.round((t.entry_fee_cents - h.hold_fee_paid_cents) / 100);

            return (
              <div key={h.id} className="border border-border rounded-2xl bg-card overflow-hidden" data-testid={`hold-card-${h.id}`}>
                <div className="relative h-28 overflow-hidden">
                  <img src={t.cover_img_url ?? DEFAULT_IMG} alt="" className="h-full w-full object-cover opacity-60" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                    <div className="font-display text-2xl tracking-wide leading-tight">{t.name}</div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-mono tracking-widest flex-shrink-0 ml-2 ${isConfirmed ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                      {isConfirmed ? "CONFIRMED" : "HELD"}
                    </span>
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><MapPin size={14} weight="bold" className="text-primary" />{t.city}, {t.state}</span>
                    <span className="flex items-center gap-1.5"><Calendar size={14} weight="bold" className="text-primary" />{dateDisplay}</span>
                  </div>

                  {isHeld && remaining && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-sm">
                      <Clock size={16} weight="bold" />
                      <span>Expires in <span className="font-mono font-bold">{remaining}</span> — confirm to secure your spot</span>
                    </div>
                  )}

                  {isConfirmed && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm">
                      <CheckCircle size={16} weight="fill" />
                      <span>Registration confirmed · Entry fee paid</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    {isHeld && (
                      <button className="flex-1 h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.2em] text-sm transition-colors" data-testid={`hold-confirm-${h.id}`}>
                        CONFIRM · ${balanceDue}
                      </button>
                    )}
                    <Link href={`/tournaments/${t.id}`} className={isHeld ? "" : "flex-1"}>
                      <button className={`h-11 rounded-full border border-border hover:bg-secondary/60 font-display tracking-[0.2em] text-sm transition-colors flex items-center justify-center gap-2 ${isHeld ? "px-5" : "w-full"}`} data-testid={`hold-view-${h.id}`}>
                        VIEW <ArrowRight size={14} weight="bold" />
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </PageShell>
  );
}
