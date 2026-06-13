"use client";

import { useState } from "react";
import { Lightning, ShieldCheck, Clock, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Tournament } from "@/data/mock-data";

export function HoldMySpotDialog({
  open,
  onOpenChange,
  tournament,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tournament: Tournament;
}) {
  const [step, setStep] = useState<"review" | "success">("review");
  const [card, setCard] = useState({ number: "", exp: "", cvv: "" });

  const confirm = () => {
    setStep("success");
    toast.success("Spot held!", {
      description: `Your slot for ${tournament.name} is reserved for 72 hours.`,
    });
  };

  const reset = () => { setStep("review"); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setStep("review"); onOpenChange(v); }}>
      <DialogContent className="max-w-md" data-testid="hold-spot-dialog">
        {step === "review" ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-2">
                <Lightning size={18} weight="fill" className="text-primary" />
                <span className="font-mono text-[11px] tracking-[0.25em] text-primary">HOLD MY SPOT</span>
              </div>
              <DialogTitle className="font-display tracking-wide text-3xl">{tournament.name}</DialogTitle>
              <DialogDescription>{tournament.location} · {tournament.date} · {tournament.format}</DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-border p-4 space-y-3 my-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Hold fee</span>
                <span className="font-mono font-bold">${tournament.holdFee}.00</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Remaining entry (due at confirm)</span>
                <span className="font-mono">${tournament.entryFee - tournament.holdFee}.00</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <span className="font-semibold">Charged today</span>
                <span className="font-mono font-bold text-primary text-lg">${tournament.holdFee}.00</span>
              </div>
            </div>

            <div className="space-y-2">
              <input data-testid="hold-card-number" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} placeholder="Card number  ·  4242 4242 4242 4242" className="w-full bg-secondary border border-border rounded-md px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-ring" />
              <div className="grid grid-cols-2 gap-2">
                <input data-testid="hold-card-exp" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} placeholder="MM / YY" className="w-full bg-secondary border border-border rounded-md px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-ring" />
                <input data-testid="hold-card-cvv" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} placeholder="CVV" className="w-full bg-secondary border border-border rounded-md px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
              <ShieldCheck size={14} weight="bold" /> Refundable up to 7 days before event ·
              <Clock size={14} weight="bold" /> 72h to confirm
            </div>

            <DialogFooter className="mt-3 gap-2">
              <Button variant="ghost" onClick={reset} className="rounded-full" data-testid="hold-cancel-btn">Cancel</Button>
              <Button onClick={confirm} className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6" data-testid="hold-confirm-btn">
                Hold for ${tournament.holdFee}
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
              You have <span className="text-primary font-semibold">72 hours</span> to confirm full registration for{" "}
              <span className="text-foreground font-semibold">{tournament.name}</span>.
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
