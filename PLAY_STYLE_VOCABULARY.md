# `profiles.play_style` — three vocabularies in one column

**Found 2026-08-27** while reconciling web and mobile. Needs a product decision
before any further code touches this column; everything below is observation.

Workstream C2 of `WEB_MOBILE_ALIGNMENT_PLAN.md` ("shared status vocabulary") is
where the fix belongs.

## What is actually stored

Every non-null value in production, as of 2026-08-27:

| Value | Count | Shape |
| --- | --- | --- |
| `Soft Game / Dinker` | 2 | display label |
| `tournament_play` | 2 | machine key |
| `Soft game` | 1 | display label |
| `Dinker` | 1 | display label |
| `Aggressive Net Player` | 1 | display label |
| `Banger` | 1 | display label |
| `Aggressive baseliner` | 1 | display label |
| `Third-Shot Specialist` | 1 | display label |
| `recreational` | 1 | machine key |
| `competitive, Soft-game specialist` | 1 | **joined list, mixing both** |

Note `Soft Game / Dinker`, `Soft game`, and `Soft-game specialist` are three
spellings of one concept, and `Dinker` appears both alone and inside a slash-pair.

## Why — four writers that never agreed

| Writer | Writes | Shape |
| --- | --- | --- |
| `apps/mobile/src/app/edit-profile.tsx:492` | `playStyle.trim()` | **free text** — the user types anything |
| `web/src/app/onboarding/.../transform.ts` | `draft.playingStyle[0]` | one **machine key**, and silently discards selections 2 and 3 |
| `web/src/app/profile/page.tsx:548` | `fields.play_style.join(", ")` | **comma-joined list** |
| `apps/mobile` onboarding `finalize.ts` | `playingStyle[0]` | one machine key |

The readers disagree in the same way: `web/src/app/profile/page.tsx:289` splits
on commas, while `apps/mobile/src/app/(tabs)/profile.tsx:220` renders the raw
string.

## What has been fixed, and what has not

**Fixed** — `web/src/app/matchmaking/page.tsx` built badges as
`[p.play_style]`, rendering a joined list as a single badge reading
"competitive, Soft-game specialist". It now splits on commas, which is correct
for both shapes: a single value contains no comma and yields one badge
unchanged. Safe regardless of how the decision below goes.

**Not fixed, deliberately** — everything else. Picking the vocabulary is a
product call, and the wrong choice destroys real user input.

## The decision

1. **One value or several?** Onboarding lets a user pick up to 3 and stores 1.
   Either stop offering 3, or store all of them.
2. **Keys or labels?** A machine key (`tournament_play`) is filterable and
   translatable; a display label (`Banger`) is not, but is what users typed.
3. **Free text or a closed set?** Mobile's edit-profile is an open text field.
   Closing it means mapping the existing free-text values onto the set — nine
   rows today, so this is nearly free now and expensive later.

Recommended: a closed set of machine keys shared from `packages/shared`, stored
as a list, rendered through a label map — matching how `onboarding_intent`
already works (`text[]` of keys). That makes matchmaking filterable by style,
which it cannot be today.

**Migration cost is trivial right now: ten rows.** The same argument as
`TOURNAMENT_PLATFORM_SCHEMA_BASELINE.md` §1 — this gets expensive with real
users, not before.
