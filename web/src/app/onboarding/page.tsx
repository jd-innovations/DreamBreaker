"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Trophy, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { Logo } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const STEPS = ["Welcome", "Your Level", "Location", "All Set"] as const;
type Step = 0 | 1 | 2 | 3;

const levels = [
  { id: "2.5-3.0", label: "2.5 – 3.0", desc: "Beginner. Still learning shot selection." },
  { id: "3.0-3.5", label: "3.0 – 3.5", desc: "Developing. Consistent rallies." },
  { id: "3.5-4.0", label: "3.5 – 4.0", desc: "Intermediate. Third shot drop in progress." },
  { id: "4.0-4.5", label: "4.0 – 4.5", desc: "Advanced. Strong dink game." },
  { id: "4.5+",    label: "4.5+",       desc: "Expert. Tournament-competitive." },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [selectedLevel, setSelectedLevel] = useState("");
  const [dupr, setDupr] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const next = async () => {
    if (step < 3) {
      setStep((s) => (s + 1) as Step);
      return;
    }
    // Step 3 → save profile then go to dashboard
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth"); return; }

      const [city, state] = location.split(",").map((s) => s.trim());
      const duprVal = dupr ? parseFloat(dupr) : null;

      const { error } = await supabase
        .from("profiles")
        .update({
          location_city: city || null,
          location_state: state || null,
          dupr: duprVal && !isNaN(duprVal) ? duprVal : null,
          skill_level: selectedLevel || null,
        })
        .eq("id", user.id);

      if (error) { toast.error("Failed to save profile. Try again."); setSaving(false); return; }
    } catch {
      toast.error("Something went wrong.");
      setSaving(false);
      return;
    }
    router.push("/dashboard");
  };

  const canNext = step === 0 || (step === 1 && selectedLevel) || (step === 2 && location) || step === 3;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6 flex items-center justify-between border-b border-border">
        <Logo />
        <div className="flex items-center gap-2">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 w-8 rounded-full transition-all ${i <= step ? "bg-primary" : "bg-secondary"}`} />
          ))}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {step === 0 && (
            <div className="text-center">
              <div className="font-mono text-[11px] tracking-[0.35em] text-primary mb-4">STEP 1 OF 3</div>
              <h1 className="font-display text-5xl sm:text-6xl tracking-wide leading-[0.95] mb-4">WELCOME TO<br /><span className="text-primary">THE CIRCUIT.</span></h1>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto">Let&apos;s set up your player profile. Takes about 60 seconds.</p>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="font-mono text-[11px] tracking-[0.35em] text-primary mb-3">STEP 2 OF 3</div>
              <h2 className="font-display text-4xl tracking-wide mb-1">YOUR LEVEL</h2>
              <p className="text-muted-foreground text-sm mb-6">Used to match you with the right tournaments and partners.</p>
              <div className="space-y-2 mb-5">
                {levels.map((l) => (
                  <button key={l.id} onClick={() => setSelectedLevel(l.id)} data-testid={`level-${l.id}`} className={`w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between ${selectedLevel === l.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                    <div>
                      <div className="font-display text-xl tracking-wide">{l.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{l.desc}</div>
                    </div>
                    {selectedLevel === l.id && <CheckCircle size={20} weight="fill" className="text-primary flex-shrink-0" />}
                  </button>
                ))}
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">DUPR RATING <span className="text-muted-foreground/60">(optional)</span></label>
                <input value={dupr} onChange={(e) => setDupr(e.target.value)} placeholder="e.g. 4.18" data-testid="onboarding-dupr" className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="font-mono text-[11px] tracking-[0.35em] text-primary mb-3">STEP 3 OF 3</div>
              <h2 className="font-display text-4xl tracking-wide mb-1">YOUR LOCATION</h2>
              <p className="text-muted-foreground text-sm mb-6">We&apos;ll show you nearby tournaments and partners first.</p>
              <div className="relative">
                <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" weight="bold" />
                <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State  (e.g. Miami, FL)" data-testid="onboarding-location" className="w-full h-12 rounded-xl bg-secondary border border-border pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <div className="h-20 w-20 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-6">
                <Trophy size={40} weight="fill" className="text-primary" />
              </div>
              <div className="font-mono text-[11px] tracking-[0.35em] text-primary mb-3">YOU&apos;RE READY</div>
              <h2 className="font-display text-5xl tracking-wide leading-[0.95] mb-4">PROFILE<br />COMPLETE.</h2>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto">Your profile is live. Time to find a tournament and lock in your spot.</p>
            </div>
          )}

          <button onClick={next} disabled={!canNext || saving} data-testid="onboarding-next-btn" className="mt-8 w-full h-13 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed font-display tracking-[0.2em] flex items-center justify-center gap-2 transition-colors">
            {saving ? "SAVING…" : step === 3 ? "GO TO DASHBOARD" : "CONTINUE"} {!saving && <ArrowRight size={16} weight="bold" />}
          </button>
        </div>
      </main>
    </div>
  );
}
