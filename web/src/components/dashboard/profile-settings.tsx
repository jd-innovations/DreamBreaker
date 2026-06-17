"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, UserCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ensureFreshSession } from "@/lib/ensure-session";
import type { Tables } from "@/lib/supabase/database.types";

type Profile = Pick<
  Tables<"profiles">,
  | "id" | "full_name" | "handle" | "dupr" | "skill_level"
  | "location_city" | "location_state" | "avatar_url" | "bio"
  | "play_style" | "availability" | "hand"
>;

const SKILL_LEVELS = ["2.5-3.0", "3.0-3.5", "3.5-4.0", "4.0-4.5", "4.5+"];
const PLAY_STYLES = ["Aggressive baseliner", "Soft-game specialist", "Counter-puncher", "All-court", "Bangers + transition", "Dink master"];
const AVAILABILITY_OPTIONS = ["Weekends", "Weeknights", "Weekends + Tue evenings", "Sat / Sun mornings", "Flexible", "Weekdays only"];
const HAND_OPTIONS = ["right", "left", "ambidextrous"];
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

const inputCls = "w-full h-11 rounded-xl bg-secondary border border-border px-3.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary/50 transition-shadow";
const labelCls = "font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5";

export function ProfileSettings({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [bio, setBio] = useState("");
  const [skill, setSkill] = useState("");
  const [hand, setHand] = useState("");
  const [playStyle, setPlayStyle] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string[]>([]);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id,full_name,handle,dupr,skill_level,location_city,location_state,avatar_url,bio,play_style,availability,hand")
        .eq("id", userId)
        .single();
      if (prof) {
        setProfile(prof);
        setFullName(prof.full_name ?? "");
        setCity(prof.location_city ?? "");
        setState(prof.location_state ?? "");
        setBio(prof.bio ?? "");
        setSkill(prof.skill_level ?? "");
        setHand(prof.hand ?? "");
        setPlayStyle(prof.play_style ? prof.play_style.split(",").map((s) => s.trim()).filter(Boolean) : []);
        setAvailability(prof.availability ? prof.availability.split(",").map((s) => s.trim()).filter(Boolean) : []);
      }
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, [userId]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const objectUrl = URL.createObjectURL(file);
    setLocalAvatar(objectUrl);
    setAvatarUploading(true);

    const ok = await ensureFreshSession();
    if (!ok) {
      toast.error("Your session expired. Please sign out and back in to upload a photo.");
      setLocalAvatar(null);
      setAvatarUploading(false);
      return;
    }

    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${profile.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      toast.error("Failed to upload photo.");
      setLocalAvatar(null);
      setAvatarUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    const bustedUrl = `${publicUrl}?v=${Date.now()}`;
    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: bustedUrl })
      .eq("id", profile.id)
      .select("id");
    if (updateError || !updated || updated.length === 0) {
      toast.error("Couldn't save your photo — your session may have expired. Sign out and back in.");
      setLocalAvatar(null);
    } else {
      setProfile((p) => p ? { ...p, avatar_url: bustedUrl } : p);
      toast.success("Profile photo updated.");
    }
    setAvatarUploading(false);
  };

  const save = async () => {
    if (!profile) return;
    if (!fullName.trim()) { toast.error("Name can't be empty."); return; }
    setSaving(true);
    const ok = await ensureFreshSession();
    if (!ok) {
      setSaving(false);
      toast.error("Your session expired. Please sign out and sign back in to save changes.");
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        location_city: city.trim() || null,
        location_state: state.trim() || null,
        bio: bio.trim() || null,
        skill_level: skill || null,
        hand: (hand as "right" | "left" | "ambidextrous") || null,
        play_style: playStyle.length > 0 ? playStyle.join(", ") : null,
        availability: availability.length > 0 ? availability.join(", ") : null,
      })
      .eq("id", profile.id)
      .select("id");
    setSaving(false);
    if (error) { toast.error("Failed to save. Please try again."); return; }
    if (!data || data.length === 0) {
      toast.error("Couldn't save — your session may have expired. Please sign out and back in.");
      return;
    }
    toast.success("Profile updated.");
  };

  const toggle = (arr: string[], setArr: (v: string[]) => void, val: string) =>
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);

  if (loading) {
    return (
      <div className="border border-border rounded-2xl bg-card p-10 flex items-center justify-center">
        <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="border border-border rounded-2xl bg-card p-6 text-sm text-muted-foreground">
        Couldn&apos;t load your profile. Please refresh.
      </div>
    );
  }

  const avatarUrl = localAvatar ?? profile.avatar_url ?? DEFAULT_AVATAR;

  return (
    <div className="border border-border rounded-2xl bg-card p-6 space-y-6">
      {/* Sticky header with always-visible Save */}
      <div className="flex items-center justify-between gap-3 sticky top-0 z-10 -mx-6 -mt-6 px-6 py-4 bg-card/95 backdrop-blur border-b border-border rounded-t-2xl">
        <div>
          <p className="font-display text-lg tracking-wide">EDIT PROFILE</p>
          <p className="text-xs text-muted-foreground">Your photo and details across DreamBreaker</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="h-10 px-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-display tracking-[0.18em] text-sm flex items-center gap-2 transition-colors flex-shrink-0"
        >
          {saving ? <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : <Check size={15} weight="bold" />}
          {saving ? "SAVING…" : "SAVE"}
        </button>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <div className="rounded-full p-[3px] bg-gradient-to-tr from-violet-500 via-pink-400 to-cyan-400">
            <img
              src={avatarUrl}
              alt="Avatar"
              className={`h-20 w-20 rounded-full border-2 border-background object-cover transition-opacity ${avatarUploading ? "opacity-50" : ""}`}
            />
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            className="absolute inset-[3px] rounded-full bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity disabled:cursor-wait"
          >
            <Camera size={20} weight="fill" className="text-white" />
          </button>
          {avatarUploading && (
            <div className="absolute inset-[3px] rounded-full flex items-center justify-center">
              <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div>
          <p className="font-display text-lg tracking-wide">PROFILE PHOTO</p>
          <button onClick={() => fileInputRef.current?.click()} disabled={avatarUploading} className="text-xs text-primary hover:underline font-mono mt-0.5 flex items-center gap-1.5 disabled:opacity-50">
            <Camera size={12} weight="bold" /> {avatarUploading ? "Uploading…" : "Change photo"}
          </button>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Name + handle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>FULL NAME</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="Your name" />
        </div>
        <div>
          <label className={labelCls}>DUPR (VERIFIED)</label>
          <input value={profile.dupr != null ? String(profile.dupr) : "Not set"} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
        </div>
      </div>

      {/* Location */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>CITY</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} placeholder="Austin" />
        </div>
        <div>
          <label className={labelCls}>STATE</label>
          <input value={state} onChange={(e) => setState(e.target.value)} maxLength={2} className={inputCls} placeholder="TX" />
        </div>
      </div>

      {/* Bio */}
      <div>
        <label className={labelCls}>BIO</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className={`${inputCls} h-auto py-3 resize-none`} placeholder="Tell players about your game..." />
      </div>

      {/* Skill */}
      <div>
        <label className={labelCls}>SELF-RATED LEVEL</label>
        <div className="flex flex-wrap gap-2">
          {SKILL_LEVELS.map((l) => (
            <button key={l} type="button" onClick={() => setSkill(skill === l ? "" : l)} className={`px-4 h-9 rounded-full text-xs font-mono border transition-colors ${skill === l ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
              {l.replace("-", " – ")}
            </button>
          ))}
        </div>
      </div>

      {/* Hand */}
      <div>
        <label className={labelCls}>DOMINANT HAND</label>
        <div className="flex gap-2">
          {HAND_OPTIONS.map((h) => (
            <button key={h} type="button" onClick={() => setHand(hand === h ? "" : h)} className={`px-4 h-9 rounded-full text-xs font-mono border transition-colors capitalize ${hand === h ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
              {h}
            </button>
          ))}
        </div>
      </div>

      {/* Play style */}
      <div>
        <label className={labelCls}>PLAY STYLE</label>
        <div className="flex flex-wrap gap-2">
          {PLAY_STYLES.map((s) => (
            <button key={s} type="button" onClick={() => toggle(playStyle, setPlayStyle, s)} className={`px-4 h-9 rounded-full text-xs font-mono border transition-colors ${playStyle.includes(s) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Availability */}
      <div>
        <label className={labelCls}>AVAILABILITY</label>
        <div className="flex flex-wrap gap-2">
          {AVAILABILITY_OPTIONS.map((a) => (
            <button key={a} type="button" onClick={() => toggle(availability, setAvailability, a)} className={`px-4 h-9 rounded-full text-xs font-mono border transition-colors ${availability.includes(a) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <button onClick={save} disabled={saving} className="h-11 px-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-display tracking-[0.2em] text-sm flex items-center gap-2 transition-colors">
          {saving ? <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : <Check size={15} weight="bold" />}
          {saving ? "SAVING…" : "SAVE CHANGES"}
        </button>
        <Link href="/profile" className="text-xs text-muted-foreground hover:text-foreground font-mono flex items-center gap-1.5">
          <UserCircle size={13} /> View public profile
        </Link>
      </div>
    </div>
  );
}
