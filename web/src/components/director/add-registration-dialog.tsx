"use client";

// Add Player on the web (DIRECTOR_HUB_WEB_PARITY.md, W2 item 3): walk-ins, day-of
// replacements and comps, including after registration closes. Mirrors mobile's
// tournament/[id]/add-registration.tsx: every division shows its fee, and a paid
// division needs Cash / Other / Comped before submitting. The app records that
// payment; it never charges or refunds it. director_add_tournament_registration()
// is the real enforcement.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import {
  directorAddRegistration, fetchDirectorDivisions, formatFee, searchRegistrableProfiles, ONSITE_TENDER_LABELS,
  type DirectorDivision, type OnsiteTender, type Participant, type RegistrableProfile,
} from "@/lib/tournament/director-registrations";

const TENDERS: OnsiteTender[] = ["cash", "other", "comp"];

interface SlotDraft {
  mode: "profile" | "guest";
  query: string;
  results: RegistrableProfile[];
  searching: boolean;
  chosen: RegistrableProfile | null;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
}

const emptySlot: SlotDraft = {
  mode: "profile", query: "", results: [], searching: false,
  chosen: null, guestName: "", guestPhone: "", guestEmail: "",
};

function toParticipant(slot: SlotDraft): Participant | null {
  if (slot.mode === "profile") {
    return slot.chosen ? { kind: "profile", profileId: slot.chosen.id, displayName: slot.chosen.fullName } : null;
  }
  const name = slot.guestName.trim();
  if (!name) return null;
  return { kind: "guest", guest: { displayName: name, phone: slot.guestPhone, email: slot.guestEmail } };
}

function slotName(slot: SlotDraft): string {
  return slot.mode === "profile" ? slot.chosen?.fullName ?? "" : slot.guestName.trim();
}

const INPUT = "w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring";
const LABEL = "font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5";

export function AddRegistrationDialog({
  tournamentId, onClose, onAdded,
}: {
  tournamentId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [divisions, setDivisions] = useState<DirectorDivision[] | null>(null);
  const [divisionId, setDivisionId] = useState<string>("");
  const [player, setPlayer] = useState<SlotDraft>(emptySlot);
  const [partner, setPartner] = useState<SlotDraft>(emptySlot);
  const [tender, setTender] = useState<OnsiteTender | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchDirectorDivisions(tournamentId).then((d) => {
      if (!live) return;
      setDivisions(d);
      setDivisionId((prev) => prev || d[0]?.id || "");
    });
    return () => { live = false; };
  }, [tournamentId]);

  const division = divisions?.find((d) => d.id === divisionId) ?? null;

  function reset() {
    setPlayer(emptySlot);
    setPartner(emptySlot);
    setTender(null);
    setError(null);
  }

  async function submit() {
    if (!division || submitting) return;
    setError(null);
    const p = toParticipant(player);
    if (!p) { setError("Choose an existing player or enter a guest name."); return; }
    let q: Participant | undefined;
    if (division.requiresPartner) {
      q = toParticipant(partner) ?? undefined;
      if (!q) { setError(`${division.name} is a doubles division. Add a partner.`); return; }
    }
    if (division.requiresOnsitePayment && !tender) {
      setError(`${division.name} has a ${formatFee(division.entryFeeCents)} entry fee. Choose how it was paid: Cash, Other or Comped.`);
      return;
    }
    setSubmitting(true);
    const result = await directorAddRegistration({
      tournamentId,
      divisionId: division.id,
      player: p,
      partner: q,
      onsiteTender: division.requiresOnsitePayment ? tender ?? undefined : undefined,
    });
    setSubmitting(false);
    if (!result.ok) { setError(result.error); return; }

    const paidNote = division.requiresOnsitePayment && tender
      ? tender === "comp"
        ? " Entry comped."
        : ` ${formatFee(division.entryFeeCents)}${q ? " each" : ""} recorded as paid on site (${ONSITE_TENDER_LABELS[tender]}).`
      : "";
    toast.success(
      (q ? `${slotName(player)} and ${slotName(partner)} are registered for ${division.name}.` : `${slotName(player)} is registered for ${division.name}.`) + paidNote,
    );
    reset();
    // Spot counts changed.
    fetchDirectorDivisions(tournamentId).then(setDivisions);
    onAdded();
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3">
          <h3 className="font-display text-2xl tracking-wide">ADD PLAYER</h3>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary">
            <X size={14} weight="bold" />
          </button>
        </div>

        <div className="px-5 pb-5 overflow-y-auto space-y-5">
          {divisions === null ? (
            <div className="flex justify-center py-8"><div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
          ) : divisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">This tournament has no divisions yet.</p>
          ) : (
            <>
              <div>
                <label className={LABEL} htmlFor="add-reg-division">DIVISION</label>
                <select
                  id="add-reg-division"
                  value={divisionId}
                  onChange={(e) => { setDivisionId(e.target.value); reset(); }}
                  className={INPUT}
                >
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.requiresPartner ? "Doubles" : "Singles"} · {d.spotsFilled}/{d.drawSize} spots · {d.requiresOnsitePayment ? `${formatFee(d.entryFeeCents)} entry` : "Free"}
                    </option>
                  ))}
                </select>
              </div>

              {division?.requiresOnsitePayment && (
                <div>
                  <p className={LABEL}>PAYMENT COLLECTED ON SITE *</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {formatFee(division.entryFeeCents)} entry{division.requiresPartner ? " per player" : ""}. The app records it; it doesn’t charge or refund anything.
                  </p>
                  <div className="flex gap-2">
                    {TENDERS.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTender(t)}
                        aria-pressed={tender === t}
                        className={`flex-1 h-10 rounded-full border text-sm font-semibold transition-colors ${
                          tender === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"
                        }`}
                      >
                        {ONSITE_TENDER_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {division && (
                <>
                  <SlotEditor heading={division.requiresPartner ? "PLAYER 1" : "PLAYER"} slot={player} setSlot={setPlayer} />
                  {division.requiresPartner && <SlotEditor heading="PLAYER 2" slot={partner} setSlot={setPartner} />}
                </>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider">DONE</button>
                <button
                  onClick={submit}
                  disabled={!division || submitting}
                  className="flex-1 h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider disabled:opacity-50"
                >
                  {submitting ? "ADDING…" : division?.requiresPartner ? "ADD TEAM" : "ADD PLAYER"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Adds a normal registration, even after registration has closed. It appears in check-in and bracket building like any other.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SlotEditor({
  heading, slot, setSlot,
}: {
  heading: string;
  slot: SlotDraft;
  setSlot: React.Dispatch<React.SetStateAction<SlotDraft>>;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function onQuery(query: string) {
    setSlot((s) => ({ ...s, query, chosen: null, searching: query.trim().length >= 2, results: query.trim().length >= 2 ? s.results : [] }));
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) return;
    timer.current = setTimeout(async () => {
      const results = await searchRegistrableProfiles(query);
      setSlot((s) => (s.query === query ? { ...s, results, searching: false } : s));
    }, 250);
  }

  return (
    <div className="rounded-xl border border-border p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground">{heading}</p>
        <div className="flex rounded-full border border-border p-0.5">
          {(["profile", "guest"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setSlot({ ...emptySlot, mode: m })}
              className={`px-3 h-7 rounded-full font-mono text-[10px] tracking-widest ${slot.mode === m ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
            >
              {m === "profile" ? "APP PLAYER" : "GUEST"}
            </button>
          ))}
        </div>
      </div>

      {slot.mode === "profile" ? (
        slot.chosen ? (
          <div className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/30 px-3 h-11">
            <span className="flex-1 text-sm font-semibold truncate">{slot.chosen.fullName}</span>
            <button onClick={() => setSlot((s) => ({ ...s, chosen: null }))} aria-label="Change player" className="h-6 w-6 rounded-full hover:bg-secondary flex items-center justify-center">
              <X size={11} weight="bold" />
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={slot.query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder="Search players by name"
                className={`${INPUT} pl-9`}
              />
            </div>
            {slot.searching && <p className="text-xs text-muted-foreground">Searching…</p>}
            {!slot.searching && slot.query.trim().length >= 2 && slot.results.length === 0 && (
              <p className="text-xs text-muted-foreground">No players found. Switch to Guest to add someone without the app.</p>
            )}
            {slot.results.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                {slot.results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSlot((s) => ({ ...s, chosen: p, results: [] }))}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-secondary"
                  >
                    {p.fullName}
                  </button>
                ))}
              </div>
            )}
          </>
        )
      ) : (
        <>
          <input value={slot.guestName} onChange={(e) => setSlot((s) => ({ ...s, guestName: e.target.value }))} placeholder="Full name (required)" maxLength={80} className={INPUT} />
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={slot.guestPhone} onChange={(e) => setSlot((s) => ({ ...s, guestPhone: e.target.value }))} placeholder="Phone (optional)" inputMode="tel" maxLength={30} className={INPUT} />
            <input value={slot.guestEmail} onChange={(e) => setSlot((s) => ({ ...s, guestEmail: e.target.value }))} placeholder="Email (optional)" type="email" maxLength={120} className={INPUT} />
          </div>
        </>
      )}
    </div>
  );
}
