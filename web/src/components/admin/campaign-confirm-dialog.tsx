"use client";

import { useId, useState } from "react";
import { Broadcast, WarningCircle } from "@phosphor-icons/react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { requiresTypedSend, SEND_WORD } from "@/lib/campaigns/campaign-logic";
import type { AudiencePreview } from "@/lib/campaigns/campaign-service";

// The last stop before a broadcast (Phase 5, decisions 10 and 14). Shows what
// will be sent, to how many people and devices, how many devices are left out
// for reporting no platform, where it opens and when — and makes the admin
// type SEND once the device count reaches the configured threshold.
//
// Radix Dialog provides the focus trap, Escape-to-close and focus return.

export type ConfirmSummary = {
  title: string;
  body: string;
  audienceLabel: string;
  isPlatformAudience: boolean;
  destinationLabel: string;
  destinationUrl: string;
  timingLabel: string;
  sendNow: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: ConfirmSummary;
  preview: AudiencePreview | null;
  previewError: string | null;
  threshold: number;
  busy: boolean;
  onConfirm: () => void;
};

export function CampaignConfirmDialog({
  open, onOpenChange, summary, preview, previewError, threshold, busy, onConfirm,
}: Props) {
  const [typed, setTyped] = useState("");
  const inputId = useId();

  const needsWord = preview ? requiresTypedSend(preview.device_count, threshold) : true;
  const wordOk = !needsWord || typed.trim() === SEND_WORD;
  const noDevices = preview !== null && preview.device_count === 0;
  const canConfirm = !!preview && !busy && wordOk && !noDevices;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return; // don't let Escape hide an in-flight send
        if (!o) setTyped("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">Confirm broadcast</DialogTitle>
          <DialogDescription>
            Check every line. Once it starts sending, notifications already handed to Expo cannot be recalled.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Title</dt>
          <dd className="break-words font-semibold">{summary.title}</dd>
          <dt className="text-muted-foreground">Message</dt>
          <dd className="whitespace-pre-wrap break-words">{summary.body}</dd>
          <dt className="text-muted-foreground">Audience</dt>
          <dd>{summary.audienceLabel}</dd>
          <dt className="text-muted-foreground">Opens</dt>
          <dd>
            {summary.destinationLabel}
            <span className="block break-all font-mono text-[11px] text-muted-foreground">{summary.destinationUrl}</span>
          </dd>
          <dt className="text-muted-foreground">When</dt>
          <dd>{summary.timingLabel}</dd>
        </dl>

        <div className="rounded-xl border border-border bg-muted/50 p-3">
          {previewError ? (
            <p className="text-sm text-destructive">Couldn&apos;t count the audience: {previewError}</p>
          ) : !preview ? (
            <p className="text-sm text-muted-foreground">Counting the audience…</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="People" value={preview.user_count} />
              <Stat label="Devices" value={preview.device_count} />
              <Stat
                label="Excluded: unknown platform"
                value={preview.excluded_unknown_platform}
                muted={!summary.isPlatformAudience}
              />
            </div>
          )}
          {preview && (
            <p className="mt-2 text-xs text-muted-foreground">
              {summary.isPlatformAudience
                ? `${preview.excluded_unknown_platform} device${preview.excluded_unknown_platform === 1 ? "" : "s"} never reported a platform and won't receive a platform-only campaign.`
                : "An all-users campaign includes devices with an unknown platform."}{" "}
              Counts are recomputed at send time; people who opt out before then are left out.
            </p>
          )}
        </div>

        {noDevices && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <WarningCircle size={16} className="mt-0.5 flex-shrink-0" />
            No device would receive this. Choose a different audience.
          </p>
        )}

        {preview && needsWord && !noDevices && (
          <div>
            <label htmlFor={inputId} className="text-sm">
              This reaches {preview.device_count} device{preview.device_count === 1 ? "" : "s"} (the typed-confirm
              threshold is {threshold}). Type <span className="font-mono font-semibold">{SEND_WORD}</span> to confirm.
            </label>
            <input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            <Broadcast size={16} />
            {busy ? "Working…" : summary.sendNow ? "Send now" : "Schedule"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div>
      <div className={`font-display text-3xl ${muted ? "text-muted-foreground" : ""}`}>{value.toLocaleString()}</div>
      <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}
