"use client";

import { useState, useRef, useEffect } from "react";
import { ShareNetwork, Link, XLogo, WhatsappLogo, Envelope, Check } from "@phosphor-icons/react";
import { toast } from "sonner";

interface ShareButtonProps {
  title: string;
  text: string;
  url: string;
  className?: string;
  size?: "sm" | "md";
}

export function ShareButton({ title, text, url, className = "", size = "md" }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const share = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Native Web Share API — covers mobile OS share sheet (texts, socials, email)
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // User cancelled or API unavailable — fall through to popover
      }
    }
    setOpen((v) => !v);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Link copied!");
    setOpen(false);
  };

  const encoded = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`${text} ${url}`);

  const iconSize = size === "sm" ? 16 : 20;
  const btnSize = size === "sm" ? "h-8 w-8" : "h-10 w-10";

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={share}
        title="Share tournament"
        data-testid="share-btn"
        className={`${btnSize} rounded-full bg-secondary/80 text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center transition-all`}
      >
        <ShareNetwork size={iconSize} weight="bold" />
      </button>

      {/* Fallback popover for desktop */}
      {open && (
        <div className="absolute right-0 top-12 z-50 w-52 rounded-2xl border border-border bg-card shadow-xl overflow-hidden" data-testid="share-popover">
          <div className="px-4 py-3 border-b border-border">
            <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">SHARE</p>
            <p className="text-sm font-semibold truncate mt-0.5">{title}</p>
          </div>
          <div className="p-2 space-y-0.5">
            <ShareRow icon={copied ? Check : Link} label={copied ? "Copied!" : "Copy link"} onClick={copyLink} />
            <ShareRow
              icon={XLogo}
              label="Post on X"
              onClick={() => { window.open(`https://x.com/intent/tweet?text=${encodedText}`, "_blank"); setOpen(false); }}
            />
            <ShareRow
              icon={WhatsappLogo}
              label="WhatsApp"
              onClick={() => { window.open(`https://wa.me/?text=${encodedText}`, "_blank"); setOpen(false); }}
            />
            <ShareRow
              icon={Envelope}
              label="Email"
              onClick={() => { window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodedText}`, "_blank"); setOpen(false); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ShareRow({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-left"
    >
      <Icon size={16} weight="bold" className="text-primary flex-shrink-0" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
