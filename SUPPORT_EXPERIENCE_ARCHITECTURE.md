# Support Experience Architecture

Context-aware floating support system for pickleballapp (mobile).
Status: **Design document — not yet implemented.** No code has been written against this plan.

---

## 1. Executive Summary

pickleballapp already has a working support-ticket backend (`support_tickets` table + reused `conversations`/`messages` infrastructure, RLS, a clean service layer, and three screens: ticket list, new-ticket form, ticket detail/chat). What it does **not** have is a way to *reach* that system from wherever the user actually is. Today, getting help requires backing out to Settings → Help & Support → Live Chat — a dead end mid-registration, mid-match, or mid-error.

This document designs a **global floating support launcher**: a small persistent control, mounted once at the app root, that is aware of the screen and entity the user is currently looking at, offers self-service before a ticket, and — when escalation is needed — creates a `support_tickets` row pre-loaded with real context instead of a blank form.

It reuses, rather than replaces, the existing ticket backend and service layer. It adds four new pieces: a route-aware context registry, a diagnostics collector (lightweight, in-memory — no new SDK), a floating launcher + support sheet UI, and an analytics adapter. No new bottom-sheet or toast library is introduced; the sheet is built the same way `AttachmentOptionsSheet.tsx` already is (a `Modal`-based custom sheet), matching the codebase's existing convention instead of adding a dependency for it.

**Safest global integration point**: `apps/mobile/src/app/_layout.tsx`. It is the only file that wraps every registered route (~60 `Stack.Screen` entries, including all of `(tabs)`). Today it contains only `GestureHandlerRootView` and the root `Stack` — no provider, no overlay. That's the mount point for a `SupportProvider` and the `FloatingSupportButton`, rendered as a sibling to `<Stack />` so it overlays on top of every screen, including modals.

---

## 2. Current-State Audit

Verified by reading the source (not inferred):

- **Root layout** (`app/_layout.tsx`): mounts `GestureHandlerRootView` → root `expo-router` `<Stack>` with `headerShown: false` globally, ~60 explicit `<Stack.Screen>` registrations, `slide_from_right` animation, `BebasNeue_400Regular` font gate, `<StatusBar style="light" />`. **No providers exist here beyond gesture handling.** No auth context, no theme provider, no global overlay host.
- **Tabs layout** (`app/(tabs)/_layout.tsx`): custom `FloatingTabBar` (not RN's default), wrapped in `SlideMenuProvider`. Bar is `position: 'absolute'`, pill-shaped, `bottom: max(insets.bottom, TAB_BAR_MIN_GAP)`, height defined by `TAB_BAR_HEIGHT = 66` (`constants/tabBar.ts`), which also exports `tabBarClearance(insetBottom)` = the y-offset any floating chrome should clear. **The bar returns `null` entirely on the `finder` (swipe-deck) tab.**
- **`SlideMenuProvider`** (`components/SlideMenu/SlideMenuProvider.tsx`): the one existing precedent for "global floating chrome that individual screens can suppress." Exposes `useSlideMenu()` → `{ close, isOpen, setRecentItems, setSwipeEnabled, setTriggerVisible }`. Its hamburger trigger is `position: 'absolute'`, **top-left** (`left: spacing.lg`, `zIndex: 10`, 46×46 circle, gold-bordered white circle) — so it does not compete for bottom-right screen real estate. Scoped only to the `(tabs)` navigator, not the whole app.
- **Route awareness**: `usePathname` / `useSegments` / `useNavigationState` are **not used anywhere** in the codebase today. The only existing "current route" read is the tabs' own `BottomTabBarProps.state.index`. A route-aware context resolver has to be built from scratch using expo-router's `usePathname()`.
- **Overlay primitives**: no shared `Toast`, `Snackbar`, `BottomSheet`, or `FloatingActionButton` component exists anywhere in `src/components`. The one sheet-like precedent, `AttachmentOptionsSheet.tsx`, is a plain RN `Modal` with an explicit note about iOS's one-native-modal-at-a-time constraint (it defers launching the next picker to `Modal`'s `onDismiss`). Any new sheet must respect the same constraint if it needs to hand off to camera/photo pickers.
- **Support backend already exists and works**:
  - `supabase/migrations/20260806000000_support_tickets.sql` — `support_tickets` table (`id, user_id, conversation_id, subject, category, status, created_at, updated_at, resolved_at, assigned_admin_id[unused in v1]`), enums `support_ticket_status` (open/in_progress/resolved/closed) and `support_ticket_category` (account/tournaments/partners_matches/payments/bug/feedback/other). Adds `'support'` as a valid `conversation_type`. RLS: owner reads/inserts own tickets; `is_admin()` full access; admins can read/reply on any support-type conversation.
  - `lib/supportTicketService.ts` — `createSupportTicket(userId, subject, category, firstMessage)`, `fetchMyTickets(userId)`, `fetchTicket(ticketId)`. The actual message thread rides on the existing `conversations`/`messages` tables via `lib/conversationService.ts` (`sendMessage`, `fetchMessages`, `uploadMessageAttachment`, `subscribeToConversation`, `markConversationRead`) — attachments and realtime replies are inherited for free.
  - Screens: `app/support/index.tsx` (My Tickets list), `app/support/new-ticket.tsx` (form: subject/category/message/optional attachment), `app/support/[id].tsx` (ticket detail, realtime chat, closes input when status is resolved/closed).
  - `app/help-support.tsx` — static contact screen. Email (`mailto:`), Live Chat → `/support/new-ticket`, My Tickets → `/support`, Help Center → **external** `https://dreambreakerpb.com/help` (not in-app), a "Common topics" list whose "View all help topics" row has **no `onPress` — a dead link**, and a feedback shortcut into `/support/new-ticket` with `category: 'feedback'` preset.
- **What's missing**: any in-app FAQ/article content model (help content is entirely an external URL today), diagnostics/device-context capture, a dedicated bug-report flow (bug/feedback are just ticket categories), any analytics/telemetry SDK or event-logging utility (grep for "analytics" only hits an unrelated Supabase Storage bucket type), and any global entry point into support — today's only entry points are full screen navigations.
- **Design tokens** (`theme/`, mirrored in `DESIGN_TOKENS.md`): single fixed light palette, no dark mode. Brand: `colors.navy` (#0A1228), `colors.gold` (#C9A84C). Semantic status colors exist only for `success`/`danger` (+ `successBg`/`dangerBg`) — **no `warning` or `info` token**. Spacing is a 4pt scale (`xs..xxxl`, plus `screenH`/`screenV`). Radius: `button=14`, `card=16`, `chip=20`, `iconCircle.standard=40`. Typography: `displayText()` (Bebas Neue, for hero/headline text only — has a documented line-height gotcha) plus five system presets (`pageTitle, sectionTitle, cardTitle, body, metadata`). Gradients: only one token, `gradients.appLight` (a near-white background wash) — CTA/hero gradients elsewhere in the app are hand-rolled `LinearGradient` calls, not tokenized. Icons: universal `Ionicons` via a custom `AppIcon` wrapper; **no icon is reserved for help/support** in `DESIGN_TOKENS.md`'s semantic-icon registry, and no `help-circle`/`question-mark` glyph is used anywhere in the app today. `help-support.tsx` itself already violates the "no local color object" rule (introduces `blue: '#007AFF'`, not a token) — noted so the new work doesn't repeat it.
- **"Premium" visual precedent**: `components/GlassQuickAction.tsx` — a frosted "liquid glass" circular button (`BlurView` + tint wash + two gloss/shadow `LinearGradient` overlays + animated shadow + spring scale-down on press, 76px default diameter). This is the closest existing thing to what the Alibaba reference button is doing, and is the pattern the floating support button's visual treatment should draw from — not a flat `Ionicons` circle, and not a gradient CTA pill (those are reserved for `PrimaryButton`/`SecondaryButton`, which are flat-color, not gradient).

---

## 3. Existing Reusable Components and Infrastructure

Reuse, don't rebuild:

| Need | Existing asset | Notes |
|---|---|---|
| Ticket persistence | `support_tickets` table + RLS | Add columns for context (§20), no new table for tickets themselves |
| Ticket CRUD | `lib/supportTicketService.ts` | Extend, don't replace — add a context param to `createSupportTicket` |
| Message thread, attachments, realtime | `lib/conversationService.ts` | Already handles the `support` conversation type end-to-end |
| Attachment picking | `components/AttachmentOptionsSheet.tsx`, `lib/attachmentPicker.ts` | Reuse directly for screenshot/photo attach in Report a Problem |
| Per-screen visibility toggle precedent | `SlideMenuProvider`'s `setTriggerVisible` | Copy this pattern for the support button, don't reinvent |
| Floating chrome clearance | `constants/tabBar.ts` → `tabBarClearance(insetBottom)` | Use directly to position the button above the tab bar |
| "Premium" floating circular affordance | `components/GlassQuickAction.tsx` | Visual reference for the launcher button |
| Icons | `Ionicons` via `AppIcon` | Use `help-circle` or `help-buoy` outline — first use of a help glyph in the app, should be added to `DESIGN_TOKENS.md`'s semantic-icon table as part of this work |
| Modal/sheet pattern | `AttachmentOptionsSheet.tsx`'s `Modal` approach | Reuse for the new Support Sheet rather than adding `@gorhom/bottom-sheet` or similar |

Nothing here is a green field. The gap is entirely: (a) a way to know *where* the user is, (b) a global mount point, (c) a sheet UI that presents self-service before a ticket, and (d) light diagnostics.

---

## 4. Product Principles

1. **Native, not bolted-on.** Uses `colors.navy`/`colors.gold`, existing radius/spacing scale, and the `GlassQuickAction` visual language. No third-party chat-widget look.
2. **Quiet by default.** Small, low-chrome, bottom-corner. It should never be the most visually dominant thing on a screen.
3. **Self-service first.** The panel offers relevant help before it offers a ticket. A ticket is the fallback, not the default action.
4. **Context is a gift to the user, not a surveillance layer.** Every piece of attached context has a stated reason (§12); nothing sensitive rides along by default.
5. **One system, many callers.** Screens *declare* context through a typed registry call; they never talk to tickets, diagnostics, or analytics directly (§ Technical Direction / §19).
6. **Absence is a decision, not an oversight.** Every screen either explicitly shows or explicitly hides the button — no screen is "forgotten."
7. **Built to grow into an assistant.** V1 has no AI, but the context registry and support-panel IA are shaped so a future "Ask AI" action slots in without a rearchitecture.

---

## 5. V1 User Flow

1. User is on any eligible screen; a small floating button is present in the bottom-right, sitting above the tab bar (or above the screen's own floating chrome, see §8).
2. Tap opens the **Support Sheet** as a modal bottom-sheet (not a full-screen push — the user shouldn't lose their place).
3. The sheet header acknowledges context in one line, e.g. "Summer Slam 2027 · Registration" — never raw route names or IDs.
4. Below that, quick actions relevant to the current feature module (§10) — e.g. on a tournament screen: Registration help, Withdraw, Waitlist, Contact Director. On Partner Finder: Likes & Passes, Messaging, Block a player.
5. A persistent "Report a problem" and "My Tickets" action are always present regardless of context.
6. If the user picks "Report a problem," the sheet transitions to a description field + optional screenshot attach (reusing `AttachmentOptionsSheet`), with an expandable "What we'll include" disclosure listing the exact context fields that will be attached (§12 — no silent data collection).
7. On submit, `createSupportTicket` is called with the description as the first message and the approved context payload serialized onto the ticket (§20). No AI triage in V1 — the ticket is created directly in `open` status and routed by category (§14).
8. Confirmation state shows the ticket subject/category and a "View ticket" link into the existing `/support/[id]` screen — reusing that screen's realtime thread as-is.
9. From `Support Home` (the sheet's top level) the user can instead browse Help Center topics or, if none help, still fall through to Report a Problem.
10. Ticket status/updates are already covered by `/support/[id]`'s realtime subscription — no new UI needed there.

---

## 6. Context-Aware Support Flow

```
Screen mounts
   │
   ▼
Screen calls useSupportContext({ feature, entityType?, entityId?, entityLabel?, action? })
   │  (via a hook that registers/updates context in SupportContextRegistry, cleans up on unmount)
   ▼
SupportProvider (root) tracks: routeName (usePathname) + merged registered context + device/session facts
   │
   ▼
FloatingSupportButton reads eligibility (§8 exclusion list) + registry → renders or hides
   │
   ▼ (tap)
Support Sheet opens → reads current SupportContext snapshot
   │
   ├─→ Self-service: quick-help links (static per-feature list, §14) — no ticket created
   │
   └─→ Report a Problem → user description + optional screenshot
          │
          ▼
       Diagnostics Collector snapshot (§15) merged with SupportContext + explicit "last failed action" if one was recorded
          │
          ▼
       createSupportTicket(userId, subject, category, message, contextPayload)
          │
          ▼
       support_tickets row (status=open) + conversations row, routed by category (§14)
          │
          ▼
       Confirmation → /support/[id] (existing realtime ticket screen)
```

Key point: the registry is **pull, not push**. Screens declare "here is what I am" once; they never construct a ticket, call analytics, or know the support system exists beyond that one hook call.

---

## 7. Screen-by-Screen Behavior Matrix

Legend — Position: `BR` = bottom-right floating, above tab-bar clearance; `Hidden` = button suppressed entirely; `Repositioned` = shown but moved/minimized to avoid collision.

| Route (group) | Visible | Position | Default context (`feature`) | Quick-help actions | Escalation destination | Collision/safety notes |
|---|---|---|---|---|---|---|
| `(tabs)/index`, `landing` | Yes | BR | `home` | General help, What's new | New ticket (`other`) | None |
| `(tabs)/nearby` | Yes | BR, raised to clear map controls | `nearby_map` | Facility help, Location permissions | New ticket | Must clear `ExploreMap` overlay controls (`bottom: 116` pattern already used there) |
| `(tabs)/games` (Community Play) | Yes | BR | `community_play` | Registration, Format questions | New ticket (`tournaments`) | — |
| `(tabs)/finder` (Partner Finder swipe deck) | **Hidden** | — | — | — | reachable via Help & Support only | Tab bar *itself* already hides here (`return null`); a floating button over a full-bleed swipe gesture surface would intercept swipes |
| `(tabs)/partner`, `chat`, `marketplace`, `stats`, `tournaments` (hidden tabs, `href: null`) | Yes | BR | route-specific | route-specific | New ticket | Same as their visible counterparts |
| `(tabs)/profile` | Yes | BR | `profile` | Account help, Privacy | New ticket (`account`) | — |
| `tournament/[id]` | Yes | BR | `tournament`, entity=tournament | Registration, Withdraw, Waitlist, Payments | New ticket (`tournaments`) + Contact Director | Photo-count badge already occupies `bottom:28, right:20` on this screen — support button must use a distinct offset or stack above it |
| `tournament/[id]/divisions/*`, `select-division`, `division-bracket` | Yes | BR | `tournament_division`, entity=division | Division/bracket help | New ticket + Contact Director | Bracket view is dense — keep button minimized/collapsed-icon-only |
| `community/[id]` | Yes | BR | `community_play_event`, entity=event | Event help, Attendance | New ticket | Hero image gradient scrim already present; ensure sufficient contrast under button |
| `groups/[id]`, `groups/[id]/chat`, `groups/[id]/edit` | Repositioned | Minimized (icon-only, no label) on `chat` | `group` | Group help | New ticket | `groups/[id]/chat` is a chat composer screen — treat like Chat Composer rule below |
| `players/[id]` (Partner Finder profile) | Yes | BR | `partner_finder`, entity=player profile | Likes/Passes, Messaging, Block/Report player | New ticket (`partners_matches`) | — |
| `conversation/[id]` (DM) | **Repositioned** — minimized, collapses on keyboard focus | icon-only, top-safe corner if shown at all | `messaging` | Report this conversation, Block user | New ticket | Chat composer screen — button must never sit over the input bar or send button |
| `support/index`, `support/new-ticket`, `support/[id]` | **Hidden** | — | — | — | — | These *are* the support system — showing a "get help" button while already inside support is circular and clutters the ticket compose/chat UI |
| `help-support` | **Hidden** (or replaced) | — | — | — | — | This screen already *is* the entry point; V1 should route its "Live Chat" action to open the Support Sheet instead of pushing `/support/new-ticket` directly |
| `facility` | Yes | BR | `facility`, entity=facility | Claim a facility, Report inaccurate info | New ticket | — |
| `wallet` | Yes | BR | `wallet` | Missing credit, Refunds, Transactions | New ticket (`payments`) | Payment-adjacent — see §12 on not attaching financial details automatically |
| `match/*`, `match/profile` | Yes | BR | `match` | Scoring help, Match disputes | New ticket | — |
| `mini-tournament/[id]/score-entry`, `round-robin/[id]/score-entry` | **Hidden during active entry**, restorable after save | — | `score_entry`, entity=match/session | Scoring rules | New ticket (post-session only) | Explicit user ask: active score entry must not risk a mis-tap during rapid score taps |
| `quick-game/[id]`, `mini-tournament/[id]`, `round-robin/[id]` (non-entry views) | Yes | BR | respective | Format help | New ticket | — |
| `log-session/*` | Yes | BR | `log_session` | Logging help | New ticket | `add-player` step uses camera — see Camera rule below |
| `create-quick-game`, `create-round-robin`, `create-mini-tournament`, `create-clinic`, `groups/create` | Repositioned — icon-only | above sticky bottom action bar (these screens already have full-width sticky submit bars) | `event_creation` | Format help | New ticket | Must clear the screen's own sticky bottom bar (`create-quick-game.tsx:731` pattern) |
| `director`, `director/create-tournament`, `apply-director` | Yes | BR | `director`, entity=tournament if applicable | Director tools help, Payouts | New ticket + priority routing to a director-support queue (§14) | Director command-center screens are data-dense; keep collapsed by default |
| `edit-profile`, camera/cropper steps within it | **Hidden during active camera/crop**, restorable after | — | `profile_edit` | — | New ticket (after) | Explicit user ask: camera and image cropper |
| `wallet` payment flows / any checkout step | **Hidden during active payment entry** | — | `payment` | — | New ticket (after) | Explicit user ask: payment checkout — never surface a floating control over a card-entry field |
| `sign-in`, `sign-up`, `forgot-password`, `reset-password` | **Hidden** | — | — | — | mailto fallback only | Explicit user ask: authentication. **Decided:** no anonymous/pre-auth support path — unauthenticated users are directed to the existing email fallback (`help-support.tsx`'s `mailto:` link), the same channel already offered today. No new anonymous ticket flow is built. |
| `onboarding/*`, `onboarding-preview` | **Hidden** | — | — | — | — | Explicit user ask: onboarding. Onboarding has its own `OnboardingContext` and welcome flow; a support button competes with the guided-tour affordances |
| `groups/[id]/chat`, `chat` tab, any message composer | **Hidden or minimized while keyboard is focused** | — | `messaging` | — | New ticket | Explicit user ask: chat composer |
| `(tabs)/nearby` full-screen map mode, `ExploreMap` full-bleed states | Repositioned | raised above map's own floating controls | `nearby_map` | — | New ticket | Explicit user ask: full-screen maps |
| Any screen using `AttachmentOptionsSheet` while its modal is open | **Hidden for the duration of that modal** | — | inherited | — | — | Explicit user ask: bottom-sheet-heavy screens; also avoids RN's iOS one-modal-at-a-time conflict with our own sheet |
| `tournament/[id]/division-bracket` (bracket view) | Repositioned — icon-only | — | `tournament_bracket` | Bracket help | New ticket | Explicit user ask: tournament bracket views |
| Screens with their own FAB (e.g. any future map/photo FAB) | Repositioned to avoid stacking two circular buttons in the same corner | opposite corner or vertically offset | inherited | — | New ticket | Explicit user ask: screens with their own FAB — resolved case-by-case via the exclusion/position override registry (§8), not hardcoded per screen |

This table is the seed for `SUPPORT_VISIBILITY_RULES` (§19) — an explicit allow/hide/reposition map keyed by route pattern, not a default-on-everywhere behavior.

---

## 8. Floating-Button Placement Rules

- **Default position**: bottom-right, `right: spacing.lg`, `bottom: tabBarClearance(insets.bottom)` when a tab bar is present; `bottom: insets.bottom + spacing.lg` on non-tab stack screens.
- **Never bottom-left** — reserved conceptually as the hamburger trigger's side (even though that trigger doesn't reach non-tab screens, keep the two consistent so users build a spatial habit: menu = left, help = right).
- **Size**: default 52–56px circle (smaller than `GlassQuickAction`'s 76px default — this is a persistent utility control, not a dashboard action tile). Collapses to a 40px icon-only affordance (`iconCircle.standard`) on dense screens (bracket views, director dashboards, creation forms with sticky bars) per §7.
- **z-index**: above screen content, below any active native `Modal`/picker (so `AttachmentOptionsSheet` and friends still win when open — checked via a shared "is a blocking modal open" flag the provider exposes, not a hardcoded z-index race).
- **Screen-declared clearance (implements rule 1 below).** `useSupportContext` accepts `bottomClearance: number` — extra space, in px, the button must keep clear at the bottom of this screen, added to whatever it already computes. The button is mounted once globally and can only know about global chrome (the tab bar); a screen's own sticky bar is known only to that screen, so the screen reports it. A screen that declares nothing is positioned exactly as before.
  - **Report a MEASURED height (`onLayout`), not a constant**, wherever the bar can change size — `tournament/[id]`'s CTA stack expands and collapses, so any hardcoded number is wrong in one of its two states.
  - **Subtract `insets.bottom` before reporting.** These bars are laid out as `paddingBottom: insets.bottom + N`, and the button applies the safe-area inset itself — reporting the raw measured height counts it twice and floats the button too high.
  - **Round it.** The registry re-registers whenever the serialized context changes, so a fractional height would churn on every layout pass.
  - **Tie the value to the same condition that renders the bar** when the bar is conditional (`quick-game/[id]/roster`'s footer is organizer-only), or a measured height outlives the bar it measured and the button floats over nothing.
  - Declared as of this change by: `tournament/[id]`, `community/[id]`, `quick-game/[id]/roster`, `match/saved`, `match/preferences`. The creation forms listed in §7 (`create-quick-game` and siblings) have sticky submit bars and are still outstanding — they do not yet register a support context at all.
- **Collision resolution order**: (1) screen-declared sticky bottom bar → button sits above it (via `bottomClearance`, above); (2) tab bar → `tabBarClearance()`; (3) screen's own floating control at the same corner (e.g. `tournament/[id]` photo badge) → button offsets vertically above it; (4) default corner position.
- **Visibility is opt-out via registry, not per-screen JSX.** A screen doesn't import and conditionally render the button — it's always mounted at the root and reads eligibility from the route-pattern rules in §7/§19. A screen only needs to *act* when it wants to override the default (hide during an active camera step, minimize during creation forms) — done via the same `useSupportContext` hook accepting an optional `{ visibility: 'hidden' | 'minimized' }`.
- **Never overlaps a keyboard.** Subscribes to `Keyboard` show/hide and hides (not just repositions) while a keyboard is visible on composer-type screens, per the chat-composer rule in §7.

---

## 9. Interaction States

1. **Idle** — small circle, low elevation shadow (reuse `GlassQuickAction`'s shadow recipe: `shadowColor: colors.navy`, offset `{0,6}`, radius 12).
2. **Pressed** — spring scale to 0.96, matching `GlassQuickAction`'s press feedback for visual consistency across the app's floating controls.
3. **Attention badge** — small dot (not a number, to avoid implying an unread-count contract the ticket system doesn't push yet) shown only when the user has a ticket with a new unread admin reply. **Verified:** `hooks/useUnreadCounts.ts` queries the generic `messages` table (`sender_id != userId AND read_at IS NULL`, minus muted/archived) with no `conversation_type` filter — so an unread admin reply on a support ticket is already counted, but only folded into the app-wide `unreadMessages` total (the same number the chat tab badge shows), not broken out as "support" specifically. Since `messages` doesn't carry `conversation_type` directly (it lives on `conversations`), a support-specific dot requires a small scoped query — a join against `conversations.conversation_type = 'support'` filtered to the current user's tickets — rather than reusing `unreadMessages` as-is. Cheap addition, not a new pattern.
4. **Minimized** — icon-only, 40px, used on dense/collision screens per §7 — same tap target, reduced footprint.
5. **Hidden** — unmounted, not just `opacity: 0` (avoids stray touch targets and keeps `Keyboard`/gesture handling on excluded screens clean, especially the score-entry and camera cases).
6. **Sheet open** — button itself hides while its own sheet is open (no reason to show a launcher for a panel that's already open); reappears on sheet dismiss.
7. **Loading (ticket submit)** — sheet's submit button shows an inline spinner; launcher stays hidden until the sheet closes, consistent with state 6.

---

## 10. Support-Panel Information Architecture

```
Support Sheet
├── Header: context acknowledgment ("Tournament X · Registration") + close
├── Quick actions (context-driven, from §14's per-feature action lists)
│   ├── 2–4 relevant links → Help Center articles (external URL for V1, per help-support.tsx's existing pattern)
│   └── 1 relevant "contact" action if applicable (e.g. Contact Director)
├── Always-present actions
│   ├── Report a Problem → inline form (description, category auto-suggested from context, optional screenshot)
│   ├── Send Feedback → same form, category preset to `feedback`
│   └── My Tickets → existing /support screen
└── Footer: "Still stuck? We typically reply within 24 hours" (matches mockup's stated SLA — not a new commitment invented here, should be confirmed against actual support team capacity, §25)
```

This mirrors the reference mockup's Support Home / Report Problem / Escalate structure, adapted to what pickleballapp's Help Center actually is today (an external URL, not in-app articles) rather than assuming an in-app KB exists.

---

## 11. Context-Data Model

```ts
type SupportContext = {
  routeName: string;              // from usePathname()
  feature: string;                 // e.g. 'tournament', 'partner_finder', 'wallet'
  entityType?: string;              // e.g. 'tournament', 'division', 'match', 'facility'
  entityId?: string;
  entityLabel?: string;             // human-readable, e.g. "Summer Slam 2027" — shown in sheet header
  action?: string;                  // last meaningful user action on this screen, e.g. 'clicked_register'
  errorCode?: string;               // set only when a tracked API call just failed
  visibility?: 'visible' | 'minimized' | 'hidden'; // screen-level override
  metadata?: Record<string, string | number | boolean>; // small, typed, feature-declared extras only
};
```

Registered via a hook, not a global mutation:

```ts
useSupportContext({
  feature: 'tournament',
  entityType: 'tournament',
  entityId: tournamentId,
  entityLabel: tournament?.name,
});
```

The hook merges its payload into the `SupportContextRegistry` on mount/update and clears its own contribution on unmount (last-mounted-screen-wins for overlapping fields, so a modal pushed on top of a tournament screen naturally takes over the acknowledgment line).

**Session/device facts** are tracked by the provider itself, not per-screen: `userId`, app version/build (`Constants.expoConfig`), platform + OS version (`Platform`), network state (`@react-native-community/netinfo` if already a dependency — needs confirming, §25), and the diagnostics ring buffer (§15).

---

## 12. Privacy and Security Rules

1. **Nothing is attached to a ticket without being shown to the user first.** The Report a Problem step always shows a "What we'll include" disclosure listing the exact fields (route, feature, entity label, app version, platform, last error code if any) before submit — not a silent payload.
2. **No financial data is auto-attached.** Wallet/payment screens register `feature: 'wallet'` but never transaction amounts, card details, or Stripe identifiers in `metadata`. If a user reports a wallet issue, the ticket references *that they were on the wallet screen*, not the specific transaction unless the user explicitly names it in their description.
3. **No message/conversation content is auto-attached.** On a DM or group chat, `entityId` may reference the conversation, but message bodies are never pulled into diagnostics — RLS on `conversation_participants` already scopes what an admin can see, and auto-attaching content would bypass the user's own choice to disclose it.
4. **Diagnostics are ring-buffered and ephemeral.** The "last N actions" collector (§15) lives in memory only, capped (e.g. 20 entries), and is discarded on app relaunch — never persisted to disk or sent anywhere except as part of an explicit ticket submission.
5. **Screenshots are opt-in per report**, using the existing `AttachmentOptionsSheet` consent flow (the user actively picks "Take Photo"/"Choose Library") — never an automatic screen capture.
6. **RLS boundary is unchanged.** Support tickets remain owner-read/insert + admin-full-access, per the existing migration — the context payload rides inside the ticket row the same RLS already protects; no new table with weaker policies.
7. **Unauthenticated screens never construct a `SupportContext` with a `userId`** (there isn't one) — see §7's Auth row and §25's open question on an anonymous support path.

---

## 13. Ticket Lifecycle

Unchanged from the existing system, extended with context at creation:

`open` (user submits, context + diagnostics snapshot attached) → `in_progress` (admin picks it up — `assigned_admin_id` remains unused in V1 per the existing migration's stated intent, i.e. shared queue) → `resolved` (admin marks resolved; `/support/[id]` shows a closed banner and disables further input, exactly as it does today) → `closed` (terminal; ticket remains viewable in `/support`).

No new states are introduced. The floating flow only changes *how a ticket is created and what it's created with* — not what happens to it afterward.

---

## 14. Intelligent Routing Rules

V1 routing is **category-based, not AI-based** (per the explicit "no production AI assistant for V1" constraint). The Support Sheet auto-suggests a `support_ticket_category` from the current `feature`, which the user can override before submitting:

| `feature` | Suggested category | Quick-help actions shown |
|---|---|---|
| `tournament`, `tournament_division`, `tournament_bracket`, `community_play`, `community_play_event`, `quick_game`, `mini_tournament`, `round_robin`, `score_entry` | `tournaments` | Registration, Withdraw, Waitlist, Format/Scoring rules |
| `partner_finder`, `messaging` | `partners_matches` | Likes/Passes, Messaging, Block/Report |
| `wallet`, `payment` | `payments` | Missing credit, Refunds, Transactions |
| `profile`, `profile_edit`, `account` | `account` | Privacy, Account settings |
| `director`, `event_creation` | `tournaments` (director-flagged via `metadata.is_director: true` so admins can prioritize) | Director tools, Payouts |
| anything else / errorCode present | `bug` | — |
| explicit "Send Feedback" entry point | `feedback` | — |

**Decided:** "Contact Director" (§7) is a distinct escalation from "create a ticket." It deep-links into the existing conversation/messaging system with the tournament's director as recipient, reusing `conversationService.ts` directly — it never creates a `support_tickets` row. A director isn't support staff; routing it through the shared ticket queue would misfile it and give directors visibility into a queue they don't own.

---

## 15. Diagnostics Captured

V1 (buildable with zero new dependencies):
- Route history: last 5–10 `routeName` transitions (from the provider's own `usePathname` subscription).
- Last tracked action per screen (`action` field on `SupportContext`, screen-declared).
- Last failed API call's error code/message, if the calling code explicitly reports it via a small `reportSupportError(code, message)` call — **not** a blanket network interceptor (that would silently capture request/response bodies, violating §12's rule 3).
- App version/build number (`Constants.expoConfig.version` / `ios.buildNumber` / `android.versionCode`).
- Platform + OS version (`Platform.OS`, `Platform.Version`).
- Device model (`expo-device` — **confirmed already a dependency**, `~8.0.10`, no new install needed).
- Network connectivity state at time of report (connected/type) — **`@react-native-community/netinfo` is confirmed NOT a current dependency.** This is the one remaining open call (§25): either add it (small, well-known dependency) or drop network state from V1 diagnostics and rely on the offline-detection behavior in §18 instead, which doesn't require it.

Explicitly **not** in V1, despite appearing in the reference mockup: full request/response bodies, crash logs, "last 20 logs" as a generic log stream, feature flags. These require a real logging/crash-reporting SDK (e.g. Sentry) that doesn't exist in this codebase today — adding one is a separate infrastructure decision, not a support-feature decision, and is flagged as a V2+ dependency in §23/§25 rather than assumed.

---

## 16. Analytics Events

No analytics SDK exists yet (§2). This section specifies the *event names and payloads* the support system should emit through a thin `SupportAnalytics` adapter — an interface, not a vendor integration — so instrumentation can be wired to whatever the app eventually adopts (or a Supabase table in the interim, §20) without changing call sites.

- `support_button_shown` `{ routeName, feature }`
- `support_button_tapped` `{ routeName, feature }`
- `support_sheet_opened` / `support_sheet_dismissed` `{ routeName, feature, durationMs? }`
- `support_quick_action_tapped` `{ feature, actionId }`
- `support_report_started` `{ feature, entityType? }`
- `support_report_submitted` `{ category, feature, hasAttachment, hasErrorCode }`
- `support_report_abandoned` `{ feature, step }`
- `support_ticket_viewed` `{ ticketId }` (from the confirmation link and from `/support` list taps)

No PII in event payloads — IDs and enums only, consistent with §12.

---

## 17. Accessibility Requirements

- Launcher button: minimum 44×44 hit target (met by the 40px minimized state only if hit-slop is added — verify at implementation time), `accessibilityRole="button"`, `accessibilityLabel="Get help"`, and a dynamic `accessibilityHint` reflecting current feature (e.g. "Get help with tournament registration").
- Support Sheet: `accessibilityViewIsModal` on open, initial focus moves to the sheet header, `Escape`/back-gesture dismiss, and all quick actions/list rows meet the same role/label bar as the rest of the app's list rows.
- Respects system font scaling — no fixed-height text containers in the sheet that would clip at larger accessibility text sizes (this app already has one documented gotcha around this with `displayText()`'s line-height; the sheet should use the standard `typography` presets, not `displayText`, to avoid inheriting that constraint).
- Color contrast: button and badge must meet WCAG AA against whatever screen background it floats over — since it floats over arbitrary hero imagery (per §7's `community/[id]` note), it needs its own opaque/blurred backing (again, the `GlassQuickAction` blur treatment solves this for free) rather than relying on scrim gradients tuned for other overlaid text.
- Reduced-motion: press-scale and open/close transitions should respect `AccessibilityInfo.isReduceMotionEnabled()`.

---

## 18. Offline and Error Behavior

- **Button remains visible offline** (self-service Help Center links may still be useful, though they're external URLs and will themselves fail offline — the sheet should show a lightweight "you're offline" state for those specific rows rather than a silent failed navigation).
- **Report a Problem when offline**: form remains fillable; submission is disabled with an inline "You're offline — we'll send this once you're back online" message rather than either silently queuing (risk: user thinks it sent) or hard-blocking entry (risk: user loses their typed description). A true offline queue/retry is out of scope for V1 (§25) — this is deliberately the simpler, more honest behavior given no queuing infrastructure exists today.
- **Ticket submission failure** (network error, RLS rejection, etc.): inline error in the sheet, description text preserved, retry action — never a silent failure or a generic app-wide error toast (there isn't one — see §2 — and inventing a global toast system is out of scope here beyond what the sheet itself needs).
- **`fetchMyTickets`/`fetchTicket` failures**: existing screens' behavior is unchanged; this document doesn't touch that error handling.

---

## 19. Proposed Component Architecture

```
app/_layout.tsx
└── <SupportProvider>                         // new — mounts once at root, sibling to <Stack/>
      ├── SupportContextRegistry (in-memory)   // route + registered entity context
      ├── DiagnosticsCollector (ring buffer)   // §15
      ├── SupportAnalytics adapter             // §16
      └── <FloatingSupportButton />            // reads eligibility (§7/§8) + registry, renders/hides
              └── <SupportSheet />              // opened on tap; Modal-based like AttachmentOptionsSheet
                      ├── SupportHome            // §10 top level
                      ├── ReportProblemForm       // reuses AttachmentOptionsSheet
                      └── SupportConfirmation     // links into existing /support/[id]

lib/support/
  ├── supportContext.ts        // SupportContext type, useSupportContext() hook, SUPPORT_VISIBILITY_RULES (route-pattern table from §7)
  ├── supportDiagnostics.ts    // ring buffer, reportSupportError()
  ├── supportAnalytics.ts      // thin adapter, §16 event names
  └── supportTicketService.ts  // EXTENDED, not replaced — createSupportTicket() gains a context param
```

Screens integrate with exactly one call:
```ts
useSupportContext({ feature: 'tournament', entityType: 'tournament', entityId, entityLabel: name });
```
No screen imports `FloatingSupportButton`, `SupportSheet`, or any ticket/analytics code directly — this is the "don't duplicate support logic inside individual screens" requirement satisfied structurally, not by convention alone.

---

## 20. Proposed Database Requirements

Minimal — extend, don't fork, the existing schema:

```sql
-- Migration: add context columns to the existing support_tickets table
alter table public.support_tickets
  add column context jsonb,           -- serialized SupportContext at time of creation
  add column diagnostics jsonb,        -- serialized diagnostics snapshot at time of creation
  add column source text default 'help_screen'; -- 'floating_button' | 'help_screen' | future entry points
```

No new tables required for V1. `context`/`diagnostics` as `jsonb` (not new relational columns per field) because the field set is expected to evolve — matches the flexible `metadata` field already in the `SupportContext` type. RLS is inherited from the existing `support_tickets` policies (owner + admin), which already cover these new columns since they're on the same row.

If analytics events (§16) need durable storage rather than a future third-party SDK, a `support_analytics_events` table is a reasonable interim (`id, user_id nullable, event_name, payload jsonb, created_at`) — flagged as optional/deferred, not required for V1 functionality, since the sheet works without event logging.

---

## 21. Proposed Service/API Boundaries

- **`supportTicketService.ts`** (extended): `createSupportTicket` gains a 5th param, `context?: { support: SupportContext; diagnostics: DiagnosticsSnapshot }`, serialized into the new `context`/`diagnostics` columns. `fetchMyTickets`/`fetchTicket` unchanged.
- **`conversationService.ts`**: unchanged — still owns all message/attachment/realtime behavior.
- **New `lib/support/supportContext.ts`**: owns the registry and the route-pattern visibility rules. Pure client-side, no network calls.
- **New `lib/support/supportDiagnostics.ts`**: owns the ring buffer and `reportSupportError()`. Pure client-side.
- **New `lib/support/supportAnalytics.ts`**: thin adapter with one method, `track(eventName, payload)`, implementation swappable (console/no-op in dev, real sink later) — call sites never know which.
- **Boundary rule**: only `SupportSheet`/`ReportProblemForm` call `supportTicketService`. Only `SupportProvider`/its hook call the context and diagnostics modules. No feature screen imports any of these directly except through `useSupportContext`.

---

## 22. Feature-Flag Strategy

The launcher must be killable instantly during beta without an app-store release. **Confirmed: no remote feature-flag mechanism exists anywhere in the codebase today** — this is built from scratch, not extended from something else:
- A minimal Supabase table (`feature_flags: key text primary key, enabled boolean, rollout_pct int, config jsonb`), read once at app start and cached, gates the entire `SupportProvider` render: `support_floating_button_enabled` (boolean, default off until QA'd). Simple enough not to warrant a third-party flagging service for one flag.
- A secondary flag/allowlist can scope it to a beta cohort first (`support_floating_button_rollout_pct` or a director/tester allowlist), consistent with "particularly during beta" in the brief.
- Per-feature quick-action lists (§14 table) should be data, not hardcoded JSX, so routing tweaks don't require a release — could live in the same flag payload or a small static config file for V1 (a full CMS is overkill here).
- Kill switch is separate from visibility rules (§7/§8): the flag can disable the button globally even on screens where the rules say it should show.

---

## 23. Phased Implementation Plan

**Phase 0 — Foundation (no user-visible change)**
`SupportProvider`, `SupportContextRegistry`, `useSupportContext` hook, route-pattern visibility table (empty/all-hidden behind the flag), migration for `context`/`diagnostics`/`source` columns.

**Phase 1 — Launcher + Sheet, self-service only**
`FloatingSupportButton`, `SupportSheet` (Support Home + Help Center links only, reusing `help-support.tsx`'s existing external-URL pattern), feature-flagged to internal/beta testers only. No Report a Problem yet — validates placement/visual design first.

**Phase 2 — Report a Problem + ticket creation**
`ReportProblemForm`, diagnostics collector, extended `createSupportTicket`, confirmation → `/support/[id]`. Category auto-suggestion (§14).

**Phase 3 — Screen-by-screen rollout of visibility rules**
Apply the full §7 matrix screen by screen (register `useSupportContext` calls across tournament/community/wallet/etc.), rather than flipping every screen on at once — each addition is independently verifiable.

**Phase 4 — Analytics + rollout widening**
Wire `SupportAnalytics`, widen the feature-flag rollout percentage, add the unread-reply badge (§9) once `useUnreadCounts`'s scope is confirmed (§25).

**Deferred / not in this plan**: AI assistant triage, in-app Help Center article CMS (stays external), crash/log SDK integration, anonymous/pre-auth support path, Contact Director as a distinct non-ticket flow (needs product sign-off first, §14).

---

## 24. Acceptance Criteria

- Floating button renders on all §7 "Yes" routes and is absent (not just transparent) on all "Hidden" routes, verified by manual pass through the matrix.
- Button never visually overlaps: the tab bar, the `SlideMenu` hamburger trigger, any screen's own sticky bottom bar, or an open keyboard.
- Tapping the button always opens the Support Sheet in under one frame-drop-visible delay; the sheet's header always reflects the correct `entityLabel` for the screen it was opened from.
- Submitting Report a Problem creates exactly one `support_tickets` row and one first message, matching the existing `createSupportTicket` transaction shape, with `context`/`diagnostics`/`source` populated.
- The confirmation screen's "View ticket" link opens the correct ticket in the existing `/support/[id]` screen with no behavior change to that screen.
- No screenshot, financial detail, or message content is attached to a ticket unless the user explicitly provided it (manual privacy review against §12 before Phase 2 ships).
- Feature flag off ⇒ zero rendering, zero registry overhead (the hook becomes a no-op, not a hidden-but-mounted component).
- Score-entry, camera/cropper, payment-entry, auth, and onboarding screens never show the button, verified explicitly (these were named directly in the brief).

---

## 25. Risks, Open Questions, and Recommendations

**Resolved (2026-08-07):**
1. ~~Contact Director routing~~ → **DM**, not a ticket (§14).
2. ~~`useUnreadCounts` support coverage~~ → **Confirmed covered**, but only as part of the aggregate `unreadMessages` count; a support-specific badge needs a small scoped query (§9).
3. ~~`expo-device`/`netinfo` dependency status~~ → **`expo-device` present**, `netinfo` absent — one remaining call below.
4. ~~Remote feature-flag mechanism~~ → **None exists**; §22 builds a minimal one from scratch.
5. ~~Unauthenticated/pre-auth support~~ → **Out of scope**, existing `mailto:` fallback is sufficient (§7).

**One remaining open question:**
Add `@react-native-community/netinfo` as a new dependency to capture network state in diagnostics (§15), or drop that field from V1 and lean on the offline-detection behavior already specified in §18? Small decision, low stakes either way — doesn't block starting Phase 0.

**Risks:**
- **Scope creep toward a generic chat widget.** The Alibaba reference is chat-commerce UI; pickleballapp's actual gap is ticket *discovery*, not ticket *creation* (that already works). Staying disciplined to "surface the existing system with context" rather than rebuilding messaging is the main risk to manage.
- **Visibility-rule drift.** §7's matrix will go stale as new screens are added. Recommend a lint/test that fails CI if a new route under `app/` has no corresponding entry in `SUPPORT_VISIBILITY_RULES`, forcing an explicit decision (§4 principle 6) rather than silent default-on or default-off.
- **`context`/`diagnostics` as loosely-typed `jsonb`** trades schema rigor for flexibility. Acceptable for V1 given the field set is still being discovered, but should be revisited once the shape stabilizes (a generated Zod schema validated client-side before insert is a reasonable middle ground, not proposed as required for V1).

**Recommendation:** build Phases 0–1 first and get the launcher's visual design and placement rules in front of real beta users before investing in Phase 2's diagnostics/routing sophistication — the biggest unknown here isn't technical, it's whether the button's presence and position feel native or feel bolted-on, and that's only answerable by shipping the quiet version first.
