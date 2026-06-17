"use client";

import { useState } from "react";
import { Lightning, ShieldCheck, Clock, CheckCircle, WarningCircle, Users } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";

export interface HoldTournament {
  id: string;
  name: string;
  city: string;
  state: string;
  event_date: string;
  format: string;
  entry_fee_cents: number;
  hold_fee_cents: number;
  hold_duration_hours: number;
  division_id?: string | null;
  division_name?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tournament: HoldTournament;
  onSuccess?: (expiresAt: string, divisionId?: string | null) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function centsToDisplay(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export function HoldMySpotDialog({ open, onOpenChange, tournament, onSuccess }: Props) {
  const [step, setStep] = useState<"review" | "success">("review");
  const [loading, setLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [needsPartner, setNeedsPartner] = useState(false);

  const isDoubles = /double/i.test(tournament.format);

  const confirm = async () => {
    setLoading(true);
    try {
      const userId = await getUserId();
      if (!userId) {
        toast.error("Sign in to hold a spot.");
        return;
      }

      const supabase = createClient();

      // Check for existing registration for this specific division (or tournament if no division)
      let existingQuery = supabase
        .from("registrations")
        .select("id, status")
        .eq("tournament_id", tournament.id)
        .eq("player_id", userId);

      if (tournament.division_id) {
        existingQuery = existingQuery.eq("division_id", tournament.division_id);
      } else {
        existingQuery = existingQuery.is("division_id", null);
      }

      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        toast.error(
          existing.status === "held"
            ? "You already have a hold on this event."
            : "You're already registered for this event.",
        );
        return;
      }

      const holdExpiry = new Date(
        Date.now() + tournament.hold_duration_hours * 3600 * 1000,
      ).toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertPayload: any = {
        tournament_id: tournament.id,
        player_id: userId,
        status: "held",
        hold_expires_at: holdExpiry,
        hold_fee_paid_cents: 0,
        entry_fee_paid_cents: 0,
        needs_partner: isDoubles ? needsPartner : false,
      };
      if (tournament.division_id) insertPayload.division_id = tournament.division_id;

      const { error } = await supabase.from("registrations").insert(insertPayload);

      if (error) {
        toast.error("Could not hold your spot. Please try again.");
        console.error(error);
        return;
      }

      setExpiresAt(holdExpiry);
      setStep("success");
      onSuccess?.(holdExpiry, tournament.division_id);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep("review");
    setExpiresAt(null);
    setNeedsPartner(false);
    onOpenChange(false);
  };

  const expiryDisplay = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setStep("review"); setExpiresAt(null); } onOpenChange(v); }}>
      <DialogContent className="max-w-md" data-testid="hold-spot-dialog">
        {step === "review" ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-2">
                <Lightning size={18} weight="fill" className="text-primary" />
                <span className="font-mono text-[11px] tracking-[0.25em] text-primary">HOLD MY SPOT</span>
              </div>
              <DialogTitle className="font-display tracking-wide text-3xl">{tournament.name}</DialogTitle>
              <DialogDescription>
                {tournament.city}, {tournament.state} · {formatDate(tournament.event_date)}
                {tournament.division_name
                  ? ` · ${tournament.division_name}`
                  : ` · ${tournament.format.replace(/_/g, " ")}`}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-border p-4 space-y-3 my-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Hold fee</span>
                <span className="font-mono font-bold">{centsToDisplay(tournament.hold_fee_cents)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Remaining entry (due at confirm)</span>
                <span className="font-mono">{centsToDisplay(tournament.entry_fee_cents - tournament.hold_fee_cents)}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <span className="font-semibold">Charged today</span>
                <span className="font-mono font-bold text-primary text-lg">{centsToDisplay(tournament.hold_fee_cents)}</span>
              </div>
            </div>

            {isDoubles && (
              <button
                type="button"
                onClick={() => setNeedsPartner((v) => !v)}
                className={`w-full flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                  needsPartner
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-secondary/40"
                }`}
              >
                <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${needsPartner ? "bg-primary/20" : "bg-secondary"}`}>
                  <Users size={16} weight="bold" className={needsPartner ? "text-primary" : "text-muted-foreground"} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">I need a partner</div>
                  <div className="text-xs text-muted-foreground mt-0.5">We&apos;ll surface you to other solo registrants looking for a doubles partner at this event.</div>
                </div>
                <div className={`h-5 w-9 rounded-full flex-shrink-0 flex items-center transition-colors px-0.5 ${needsPartner ? "bg-primary justify-end" : "bg-border justify-start"}`}>
                  <div className="h-4 w-4 rounded-full bg-white shadow-sm" />
                </div>
              </button>
            )}

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-start gap-2 text-sm">
              <WarningCircle size={16} weight="fill" className="text-primary flex-shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                Payment is not processed yet — this is a <span className="text-foreground font-semibold">preview hold</span>. Your spot will be reserved for <span className="text-primary font-semibold">{tournament.hold_duration_hours} hours</span>.
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><ShieldCheck size={13} weight="bold" /> Refundable up to 7 days before event</span>
              <span className="flex items-center gap-1"><Clock size={13} weight="bold" /> {tournament.hold_duration_hours}h to confirm</span>
            </div>

            <DialogFooter className="mt-3 gap-2">
              <Button variant="ghost" onClick={reset} className="rounded-full" data-testid="hold-cancel-btn" disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={confirm}
                disabled={loading}
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6"
                data-testid="hold-confirm-btn"
              >
                {loading ? "Holding…" : `Hold My Spot`}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="text-center py-4" data-testid="hold-success-state">
            <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={36} weight="fill" className="text-primary" />
            </div>
            <h3 className="font-display text-3xl tracking-wide mb-2">SPOT SECURED</h3>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Your spot at <span className="text-foreground font-semibold">{tournament.name}</span> is held
              {expiryDisplay ? (
                <> until <span className="text-primary font-semibold">{expiryDisplay}</span></>
              ) : (
                <> for <span className="text-primary font-semibold">{tournament.hold_duration_hours} hours</span></>
              )}.
              {needsPartner
                ? " We'll match you with other players seeking a partner for this event."
                : " Find it in your dashboard and profile under Tournaments."}
            </p>
            <div className="flex flex-col gap-2 mt-6 w-full max-w-xs mx-auto">
              {needsPartner && (
                <Button
                  asChild
                  className="rounded-full bg-primary text-primary-foreground px-6"
                  data-testid="find-partner-now-btn"
                >
                  <a href={`/matchmaking?tournament_id=${tournament.id}`}>
                    <Users size={15} className="mr-2" /> Find My Partner Now
                  </a>
                </Button>
              )}
              <Button variant={needsPartner ? "outline" : "default"} onClick={reset} className="rounded-full px-6" data-testid="hold-done-btn">
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
