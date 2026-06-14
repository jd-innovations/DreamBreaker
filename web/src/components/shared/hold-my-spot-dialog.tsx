"use client";

import { useState } from "react";
import { Lightning, ShieldCheck, Clock, CheckCircle, WarningCircle } from "@phosphor-icons/react";
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
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tournament: HoldTournament;
  onSuccess?: (expiresAt: string) => void;
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

  const confirm = async () => {
    setLoading(true);
    try {
      const userId = await getUserId();
      if (!userId) {
        toast.error("Sign in to hold a spot.");
        return;
      }

      const supabase = createClient();

      // Check for existing registration
      const { data: existing } = await supabase
        .from("registrations")
        .select("id, status")
        .eq("tournament_id", tournament.id)
        .eq("player_id", userId)
        .maybeSingle();

      if (existing) {
        toast.error(
          existing.status === "held"
            ? "You already have a hold on this tournament."
            : "You're already registered for this tournament.",
        );
        return;
      }

      const holdExpiry = new Date(
        Date.now() + tournament.hold_duration_hours * 3600 * 1000,
      ).toISOString();

      const { error } = await supabase.from("registrations").insert({
        tournament_id: tournament.id,
        player_id: userId,
        status: "held",
        hold_expires_at: holdExpiry,
        hold_fee_paid_cents: 0,
        entry_fee_paid_cents: 0,
      });

      if (error) {
        toast.error("Could not hold your spot. Please try again.");
        console.error(error);
        return;
      }

      setExpiresAt(holdExpiry);
      setStep("success");
      onSuccess?.(holdExpiry);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep("review");
    setExpiresAt(null);
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
                {tournament.city}, {tournament.state} · {formatDate(tournament.event_date)} · {tournament.format.replace("_", " ")}
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
              {" "}Find it in your dashboard and profile under Tournaments.
            </p>
            <Button onClick={reset} className="rounded-full bg-primary text-primary-foreground mt-6 px-6" data-testid="hold-done-btn">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
