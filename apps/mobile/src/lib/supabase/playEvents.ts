import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';
import type { Facility } from '@/lib/supabase/facilities';

// Maps named exceptions from join_play_event RPC to user-facing messages.
export function joinEventErrorMessage(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? '';
  if (msg.includes('event_full'))       return 'This event is full.';
  if (msg.includes('duplicate_email'))  return 'You are already on this roster.';
  if (msg.includes('event_not_open'))   return 'This event is not open for joining.';
  return 'Could not join the event. Please try again.';
}

export type PlayEvent = Tables<'play_events'>;

// event_date is a plain calendar date with no timezone, so "today" must be
// the device's local calendar date. `new Date().toISOString()` gives the UTC
// date instead, which drifts a day off local "today" for roughly half the
// day in any non-UTC timezone — showing already-past events as upcoming (or
// hiding today's events) depending on offset direction.
export function localDateString(d = new Date()): string {
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── Skill range parser ───────────────────────────────────────────────────────
// Mobile stores skill as display string e.g. "3.5 – 4.0" or "4.5+"
// Supabase stores as skill_min / skill_max floats.

export function parseSkillRange(range: string): { skill_min: number | null; skill_max: number | null } {
  if (!range) return { skill_min: null, skill_max: null };

  // "Beginner" — stored as 0–3.0 (below the lowest DUPR-aligned band) so it
  // round-trips through skill_min/skill_max without a new column.
  if (range.trim().toLowerCase() === 'beginner') {
    return { skill_min: 0, skill_max: 3.0 };
  }

  // "4.0+" or "4.5+"
  const plusMatch = range.match(/^(\d+(?:\.\d+))\+/);
  if (plusMatch) {
    return { skill_min: parseFloat(plusMatch[1]), skill_max: null };
  }

  // "3.5 – 4.0" or "3.5 - 4.0" or "3.5–4.0"
  const rangeMatch = range.match(/(\d+(?:\.\d+)?)\s*[–\-]\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    return {
      skill_min: parseFloat(rangeMatch[1]),
      skill_max: parseFloat(rangeMatch[2]),
    };
  }

  return { skill_min: null, skill_max: null };
}

// ─── Event type enum ──────────────────────────────────────────────────────────
// Confirmed values in play_event_type enum (2026-06-25, 'clinic' added 2026-07-23):
//   round_robin | mini_tournament | mixer | ladder | open_play | kings_court | clinic

export type PlayEventType = 'open_play' | 'round_robin' | 'mini_tournament' | 'mixer' | 'ladder' | 'kings_court' | 'clinic';

// ─── Shared community event input ─────────────────────────────────────────────
// All fields shared by Quick Game, Round Robin, and any future event type.
// The eventType field selects which play_event_type enum value to use.

export type CreateCommunityEventInput = {
  eventType: PlayEventType;
  organizerId: string;
  name: string;
  locationName: string;     // → location column
  locationAddress?: string; // → venue_name column
  eventDate: string;        // ISO date string
  startTime?: string;       // ISO datetime string → formatted to HH:MM:SS
  maxPlayers: number;
  skillRange?: string;      // display string → parsed to skill_min / skill_max
  coverUrl?: string;
  notes?: string;
  city?: string;
  state?: string;
  facilityId?: string | null;    // → facility_id FK
  groupId?: string | null;       // → group_id FK, links the event back to its originating group
  durationMinutes?: number | null; // → duration_minutes column, used to compute an end time
  instructorId?: string | null;  // → instructor_id FK; defaults to organizerId when omitted (Clinic events)
};

// ─── parseDurationLabel ────────────────────────────────────────────────────────
// Converts a creation-screen duration label ("2 Hours") to minutes for storage.
// "All Day" (used by mini tournaments) has no fixed duration → null.

export function parseDurationLabel(label: string): number | null {
  const hoursMatch = label.match(/^(\d+)\s*Hours?$/i);
  if (hoursMatch) return parseInt(hoursMatch[1], 10) * 60;
  return null;
}

// Thin wrapper input types — same shape, eventType injected by the wrapper.
export type CreateQuickGameInput  = Omit<CreateCommunityEventInput, 'eventType'>;
export type CreateRoundRobinInput = Omit<CreateCommunityEventInput, 'eventType'>;

// ─── formatStartTime ──────────────────────────────────────────────────────────
// Converts ISO datetime string → HH:MM:SS for the 'time' column in play_events.

function formatStartTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
}

// ─── createCommunityEvent ─────────────────────────────────────────────────────
// Shared creation logic for all play_events event types.
// 1. Inserts into play_events with provided eventType.
// 2. Sets organizer_id = input.organizerId (must be auth user.id).
// 3. Sets status = 'open'.
// 4. Parses skillRange → skill_min / skill_max.
// 5. Auto-adds organizer into play_participants (non-fatal).

export async function createCommunityEvent(input: CreateCommunityEventInput): Promise<PlayEvent> {
  const { skill_min, skill_max } = parseSkillRange(input.skillRange ?? '');

  const { data, error } = await supabase
    .from('play_events')
    .insert({
      organizer_id: input.organizerId,
      name:         input.name,
      location:     input.locationName,
      venue_name:   input.locationAddress || null,
      event_date:   input.eventDate.split('T')[0],
      // start_time column is type 'time' — send HH:MM:SS only
      start_time:   input.startTime ? formatStartTime(input.startTime) : null,
      max_players:  input.maxPlayers,
      skill_min,
      skill_max,
      cover_url:    input.coverUrl ?? null,
      notes:        input.notes ?? null,
      city:         input.city ?? null,
      state:        input.state ?? null,
      event_type:   input.eventType,
      status:       'open',
      facility_id:  input.facilityId ?? null,
      group_id:     input.groupId ?? null,
      duration_minutes: input.durationMinutes ?? null,
      // Only Clinics default instructor to the organizer; other event types
      // leave instructor_id null unless one is explicitly passed.
      instructor_id: input.instructorId ?? (input.eventType === 'clinic' ? input.organizerId : null),
    })
    .select()
    .single();

  if (error) throw error;
  await addOrganizerParticipant(data.id, input.organizerId);
  return data;
}

// ─── createQuickGame ──────────────────────────────────────────────────────────
// Quick Game maps to event_type = 'open_play' (no 'quick_game' enum value).

export async function createQuickGame(input: CreateQuickGameInput): Promise<PlayEvent> {
  return createCommunityEvent({ ...input, eventType: 'open_play' });
}

// ─── (createRoundRobin defined below after uploadPlayEventCover) ──────────────

// ─── Organizer profile shape ──────────────────────────────────────────────────

export type OrganizerProfile = {
  full_name:  string | null;
  avatar_url: string | null;
  handle:     string | null;
};

export type PlayEventWithOrganizer = PlayEvent & {
  organizer: OrganizerProfile | null;
  facility: { latitude: number | string; longitude: number | string } | null;
};

// ─── fetchPlayEventById ───────────────────────────────────────────────────────

export async function fetchPlayEventById(id: string): Promise<PlayEvent | null> {
  const { data, error } = await supabase
    .from('play_events')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw error;
  }
  return data;
}

// ─── fetchPlayEventWithOrganizer ──────────────────────────────────────────────
// Returns the event + organizer profile joined via organizer_id → profiles.id.

export async function fetchPlayEventWithOrganizer(id: string): Promise<PlayEventWithOrganizer | null> {
  const { data, error } = await supabase
    .from('play_events')
    .select('*, organizer:profiles!organizer_id(full_name, avatar_url, handle), facility:facilities!play_events_facility_id_fkey(latitude, longitude)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  // PostgREST returns the joined row inline — cast to our explicit shape
  const row = data as PlayEventWithOrganizer;
  return row;
}

// ─── fetchMyPlayEvents ────────────────────────────────────────────────────────
// Returns all play_events where organizer_id = userId, newest first.

export async function fetchMyPlayEvents(userId: string): Promise<PlayEvent[]> {
  const { data, error } = await supabase
    .from('play_events')
    .select('*')
    .eq('organizer_id', userId)
    .order('event_date', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// ─── fetchParticipantCounts ───────────────────────────────────────────────────
// Batch-fetches participant counts for a list of event IDs in a single query.
// Returns a map of { eventId → count }.

async function fetchParticipantCounts(eventIds: string[]): Promise<Record<string, number>> {
  if (!eventIds.length) return {};
  const { data } = await supabase
    .from('play_participants')
    .select('event_id')
    .in('event_id', eventIds);
  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    map[row.event_id] = (map[row.event_id] ?? 0) + 1;
  }
  return map;
}

// ─── PlayEventWithCount ───────────────────────────────────────────────────────
// PlayEvent extended with a pre-fetched participant count so playEventToGameCard
// can show an accurate player count without a per-event query.

export type PlayEventWithCount = PlayEvent & { _participantCount: number };

export type PlayEventMapFacility = Pick<
  Facility,
  'id' | 'name' | 'address' | 'city' | 'state' | 'latitude' | 'longitude'
>;

export type PlayEventWithMapFacility = PlayEventWithCount & {
  facility: PlayEventMapFacility | null;
};

// ─── fetchUpcomingPlayEvents ──────────────────────────────────────────────────
// Events on or after today with status open/full/in_progress.
// Returns participant counts batched in a single extra query.

export async function fetchUpcomingPlayEvents(userId: string): Promise<PlayEventWithCount[]> {
  const today = localDateString();
  const { data, error } = await supabase
    .from('play_events')
    .select('*')
    .eq('organizer_id', userId)
    .gte('event_date', today)
    .in('status', ['open', 'full', 'in_progress'])
    .order('event_date', { ascending: true });

  if (error) throw error;
  const events = data ?? [];
  const counts = await fetchPublicParticipantCounts(events.map(e => e.id));
  return events.map(e => ({ ...e, _participantCount: counts[e.id] ?? 0 }));
}

// ─── fetchPublicParticipantCounts ─────────────────────────────────────────────
// Like fetchParticipantCounts but reads play_participants_public (anon-readable).
// Use this for public-facing feeds where the caller may not be authenticated.

async function fetchPublicParticipantCounts(eventIds: string[]): Promise<Record<string, number>> {
  if (!eventIds.length) return {};
  const { data } = await supabase
    .from('play_participants_public')
    .select('event_id')
    .in('event_id', eventIds);
  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.event_id) map[row.event_id] = (map[row.event_id] ?? 0) + 1;
  }
  return map;
}

// ─── fetchOpenPlayEvents ──────────────────────────────────────────────────────
// Public discovery feed — upcoming open/full events, no organizer filter.
// Uses play_participants_public for counts so anon users see correct numbers.

export async function fetchOpenPlayEvents(limit = 20): Promise<PlayEventWithCount[]> {
  const today = localDateString();
  const { data, error } = await supabase
    .from('play_events')
    .select('*')
    .in('status', ['open', 'full'])
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .limit(limit);
  if (error) throw error;
  const events = data ?? [];
  const counts = await fetchPublicParticipantCounts(events.map(e => e.id));
  return events.map(e => ({ ...e, _participantCount: counts[e.id] ?? 0 }));
}

// ─── fetchCompletedPlayEvents ─────────────────────────────────────────────────
// Events in the past or with completed/cancelled status.


export async function fetchNearbyPlayEvents(limit = 20): Promise<PlayEventWithMapFacility[]> {
  const today = localDateString();
  const { data, error } = await supabase
    .from('play_events')
    .select('*, facility:facilities!play_events_facility_id_fkey(id, name, address, city, state, latitude, longitude)')
    .in('status', ['open', 'full'])
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .limit(limit);
  if (error) throw error;

  const events = (data ?? []) as (PlayEvent & { facility: PlayEventMapFacility | null })[];
  const counts = await fetchPublicParticipantCounts(events.map(e => e.id));
  return events.map(e => ({ ...e, _participantCount: counts[e.id] ?? 0 }));
}
export async function fetchCompletedPlayEvents(userId: string): Promise<PlayEventWithCount[]> {
  const today = localDateString();
  const { data, error } = await supabase
    .from('play_events')
    .select('*')
    .eq('organizer_id', userId)
    .or(`event_date.lt.${today},status.in.(completed,cancelled)`)
    .order('event_date', { ascending: false });

  if (error) throw error;
  const events = data ?? [];
  const counts = await fetchPublicParticipantCounts(events.map(e => e.id));
  return events.map(e => ({ ...e, _participantCount: counts[e.id] ?? 0 }));
}

// ─── fetchJoinedPlayEvents ────────────────────────────────────────────────────
// Events where the user is a play_participant (claimed_by = userId).
// Excludes events the user organizes (those appear in hosting queries).

export async function fetchJoinedPlayEvents(userId: string): Promise<PlayEventWithCount[]> {
  const { data: parts, error: pErr } = await supabase
    .from('play_participants')
    .select('event_id')
    .eq('claimed_by', userId);
  if (pErr) throw pErr;
  const eventIds = (parts ?? []).map(p => p.event_id).filter(Boolean) as string[];
  if (eventIds.length === 0) return [];

  const { data, error } = await supabase
    .from('play_events')
    .select('*')
    .in('id', eventIds)
    .neq('organizer_id', userId)
    .order('event_date', { ascending: true });
  if (error) throw error;
  const events = data ?? [];
  const counts = await fetchPublicParticipantCounts(events.map(e => e.id));
  return events.map(e => ({ ...e, _participantCount: counts[e.id] ?? 0 }));
}

// ─── fetchMyPastEvents ────────────────────────────────────────────────────────
// Past events: hosting past + joined past. Deduplicates by id.

export type PastEventsRange = {
  /** Only include events on/after this date (YYYY-MM-DD). Omit for no lower bound. */
  afterDate?: string;
  /** Cap the number of events returned (applied after merging + sorting). */
  limit?: number;
};

export async function fetchMyPastEvents(
  userId: string,
  range: PastEventsRange = {},
): Promise<PlayEventWithCount[]> {
  const today = localDateString();
  const { afterDate, limit } = range;

  const [hostingResult, joinedResult] = await Promise.all([
    (() => {
      let q = supabase
        .from('play_events')
        .select('*')
        .eq('organizer_id', userId)
        .or(`event_date.lt.${today},status.in.(completed,cancelled)`);
      if (afterDate) q = q.gte('event_date', afterDate);
      return q.order('event_date', { ascending: false });
    })(),
    (async () => {
      const { data: parts, error: pErr } = await supabase
        .from('play_participants')
        .select('event_id')
        .eq('claimed_by', userId);
      if (pErr) return { data: [], error: null };
      const ids = (parts ?? []).map(p => p.event_id).filter(Boolean) as string[];
      if (ids.length === 0) return { data: [], error: null };
      let q = supabase
        .from('play_events')
        .select('*')
        .in('id', ids)
        .neq('organizer_id', userId)
        .or(`event_date.lt.${today},status.in.(completed,cancelled)`);
      if (afterDate) q = q.gte('event_date', afterDate);
      return q.order('event_date', { ascending: false });
    })(),
  ]);

  if (hostingResult.error) throw hostingResult.error;
  const merged = [...(hostingResult.data ?? [])];
  const hostIds = new Set(merged.map(e => e.id));
  for (const e of joinedResult.data ?? []) {
    if (!hostIds.has(e.id)) merged.push(e);
  }
  merged.sort((a, b) => b.event_date.localeCompare(a.event_date));
  const capped = limit ? merged.slice(0, limit) : merged;
  const counts = await fetchPublicParticipantCounts(capped.map(e => e.id));
  return capped.map(e => ({ ...e, _participantCount: counts[e.id] ?? 0 }));
}

// ─── Skill label helper ───────────────────────────────────────────────────────

export function skillLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'Open Level';
  if (min === 0 && max === 3.0) return 'Beginner';
  if (max == null) return `${min}+`;
  return `${min} – ${max}`;
}

// ─── GameCard shape (mirrors gameEventHelpers.GameCard) ───────────────────────

export type SBGameCard = {
  id: string;
  route: string;
  source: 'supabase';
  role?: 'Hosting' | 'Joined';
  type: string;
  logoBg: string;
  logoColor: string;
  logoLines: string[];
  imageUri?: string;       // cover photo — shown instead of logo when present
  title: string;
  badgeLabel: string;
  badgeBg: string;
  badgeColor: string;
  subtitle: string;
  date: string;
  location: string;
  capacity?: string;
  // Community Play detail fields for the redesigned card layout
  skillRange?: string;
  playerCount: number;
  maxPlayers: number;
  typeTagBg: string;
  typeTagColor: string;
};

// ─── playEventToGameCard ──────────────────────────────────────────────────────
// Maps a Supabase PlayEvent row → Games tab card shape.
// event_type 'open_play' is how Quick Games are stored (see createQuickGame).

const NAVY    = '#0A1228';
const GOLD    = '#C9A84C';
const GREEN   = '#22C55E';
const GREEN_BG = '#DCFCE7';
const RR_BLUE  = '#2563EB';
const MT_RED   = '#DC2626';
const CLINIC_ORANGE = '#EA580C';

// ─── gameTypePillStyle ─────────────────────────────────────────────────────────
// Canonical label + colors for a game-type pill (Quick Game / Round Robin /
// Mini Tournament), shared by any card that needs to show what kind of event
// this is. Mirrors the type-tag colors already used on the Games tab cards.
// Types other than round_robin/mini_tournament (open_play, mixer, ladder,
// kings_court) render as "Quick Game" to match playEventToGameCard's fallback.

export function gameTypePillStyle(eventType: PlayEventType): { label: string; bg: string; color: string } {
  if (eventType === 'round_robin') return { label: 'Round Robin', bg: RR_BLUE, color: '#fff' };
  if (eventType === 'mini_tournament') return { label: 'Mini Tournament', bg: MT_RED, color: '#fff' };
  if (eventType === 'clinic') return { label: 'Clinic', bg: CLINIC_ORANGE, color: '#fff' };
  return { label: 'Quick Game', bg: NAVY, color: GOLD };
}

export function playEventToGameCard(e: PlayEvent & { _participantCount?: number }, role?: 'Hosting' | 'Joined'): SBGameCard {
  const skill = skillLabel(e.skill_min, e.skill_max);

  const badgeLabel =
    e.status === 'open'        ? 'Open'       :
    e.status === 'full'        ? 'Full'        :
    e.status === 'in_progress' ? 'Live'        :
    e.status === 'completed'   ? 'Completed'   : 'Cancelled';

  const badgeBg =
    e.status === 'open'        ? GREEN_BG      :
    e.status === 'full'        ? '#FEF9C3'     :
    e.status === 'in_progress' ? '#DBEAFE'     :
    e.status === 'completed'   ? '#F3F4F6'     : '#FEE2E2';

  const badgeColor =
    e.status === 'open'        ? GREEN         :
    e.status === 'full'        ? '#CA8A04'     :
    e.status === 'in_progress' ? '#2563EB'     :
    e.status === 'completed'   ? '#6B7280'     : '#EF4444';

  const dateStr = new Date(`${e.event_date}T${e.start_time ?? '00:00:00'}`)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const route =
    e.event_type === 'round_robin'      ? `/round-robin-created?id=${e.id}` :
    e.event_type === 'mini_tournament'  ? `/mini-tournament-created?id=${e.id}` :
                                          `/quick-game-created?id=${e.id}`;

  const typeLabel =
    e.event_type === 'round_robin'     ? 'ROUND ROBIN' :
    e.event_type === 'mini_tournament' ? 'MINI TOURNAMENT' :
    e.event_type === 'clinic'          ? 'CLINIC' : 'QUICK GAME';

  const logoLines =
    e.event_type === 'round_robin'     ? ['ROUND', 'ROBIN'] :
    e.event_type === 'mini_tournament' ? ['MINI', 'TOURN'] :
    e.event_type === 'clinic'          ? ['CLINIC'] : ['QUICK', 'GAME'];

  return {
    id:         e.id,
    route,
    source:     'supabase',
    role,
    type:       typeLabel,
    logoBg:     NAVY,
    logoColor:  GOLD,
    logoLines,
    imageUri:   e.cover_url ?? undefined,
    title:      e.name,
    badgeLabel,
    badgeBg,
    badgeColor,
    subtitle:    `${skill}  •  ${e._participantCount ?? 0} / ${e.max_players} Players`,
    date:        dateStr,
    location:    e.venue_name ?? e.location,
    capacity:    `${e._participantCount ?? 0} / ${e.max_players}`,
    skillRange:   skill,
    playerCount:  e._participantCount ?? 0,
    maxPlayers:   e.max_players,
    typeTagBg:    gameTypePillStyle(e.event_type).bg,
    typeTagColor: gameTypePillStyle(e.event_type).color,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAY PARTICIPANTS
// ─────────────────────────────────────────────────────────────────────────────

export type PlayParticipant = Tables<'play_participants'>;

export type AddParticipantInput = {
  event_id: string;
  first_name: string;
  email: string;
  last_initial?: string | null;
  self_rating?: string | null;
  claimed_by?: string | null;
  added_by_organizer?: boolean;
};

// ─── fetchPlayParticipants ────────────────────────────────────────────────────

export async function fetchPublicPlayParticipantCount(eventId: string): Promise<number> {
  const { count, error } = await supabase
    .from('play_participants_public')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (error) throw error;
  return count ?? 0;
}
export async function fetchMyPlayParticipant(eventId: string, userId: string): Promise<PlayParticipant | null> {
  const { data, error } = await supabase
    .from('play_participants')
    .select('*')
    .eq('event_id', eventId)
    .eq('claimed_by', userId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}
export async function fetchPlayParticipants(
  eventId: string,
): Promise<(PlayParticipant & { profile: { avatar_url: string | null; location_city: string | null; location_state: string | null; self_rating: string | null } | null })[]> {
  const { data, error } = await supabase
    .from('play_participants')
    .select('*, profile:profiles!claimed_by(avatar_url, location_city, location_state, self_rating)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ─── addPlayParticipant ───────────────────────────────────────────────────────
// User self-joins route through join_play_event RPC (transaction-safe: locks
// the event row, checks status=open, enforces capacity, blocks duplicate email).
// Organizer manual adds (added_by_organizer=true) use a direct insert so that
// organizers can add players outside of the capacity/status restrictions.

export async function addPlayParticipant(input: AddParticipantInput): Promise<PlayParticipant> {
  if (!input.added_by_organizer) {
    const { data, error } = await (supabase as any).rpc('join_play_event', {
      p_event_id:           input.event_id,
      p_first_name:         input.first_name,
      p_email:              input.email,
      p_claimed_by:         input.claimed_by         ?? null,
      p_added_by_organizer: false,
      p_self_rating:        input.self_rating        ?? null,
      p_last_initial:       input.last_initial       ?? null,
    });
    if (error) throw error;
    // RPC returns setof play_participants — first row is the inserted participant.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('join_play_event returned no row');
    return row as PlayParticipant;
  }

  // Organizer manual add: direct insert (organizer manage RLS allows this).
  const { data, error } = await supabase
    .from('play_participants')
    .insert({
      event_id:           input.event_id,
      first_name:         input.first_name,
      email:              input.email,
      last_initial:       input.last_initial ?? null,
      self_rating:        input.self_rating  ?? null,
      claimed_by:         input.claimed_by   ?? null,
      added_by_organizer: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── removePlayParticipant ────────────────────────────────────────────────────
// No status field in schema — row is deleted.

export async function removePlayParticipant(participantId: string): Promise<void> {
  const { error } = await supabase
    .from('play_participants')
    .delete()
    .eq('id', participantId);

  if (error) throw error;
}

// ─── addOrganizerParticipant ──────────────────────────────────────────────────
// Auto-adds the event organizer as the first participant after event creation.
// Phase 4: skips silently if organizer already has a row (duplicate guard).
// Non-fatal: errors are logged but do not propagate to the caller.

async function addOrganizerParticipant(eventId: string, organizerId: string): Promise<void> {
  try {
    // Duplicate guard — skip if organizer already claimed a participant row
    const { data: existing } = await supabase
      .from('play_participants')
      .select('id')
      .eq('event_id', eventId)
      .eq('claimed_by', organizerId)
      .maybeSingle();

    if (existing) return;

    // Fetch organizer profile for display name
    const [profileResult, authResult] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', organizerId).maybeSingle(),
      supabase.auth.getUser(),
    ]);

    const firstName = profileResult.data?.full_name?.split(' ')[0] ?? 'Host';
    const email     = authResult.data?.user?.email ?? '';

    await supabase.from('play_participants').insert({
      event_id:           eventId,
      first_name:         firstName,
      email,
      claimed_by:         organizerId,
      added_by_organizer: true,
    });
  } catch (err) {
    // Non-fatal — event was already created; log and move on
    console.warn('[addOrganizerParticipant] failed:', err);
  }
}

// ─── claimPlayParticipant ─────────────────────────────────────────────────────
// Links a participant row to an auth user (for post-signup claim flow).

export async function claimPlayParticipant(participantId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('play_participants')
    .update({ claimed_by: userId })
    .eq('id', participantId);

  if (error) throw error;
}

// ─── claimGuestParticipants ───────────────────────────────────────────────────
// Called after sign-in/sign-up/session restore.
// Finds all play_participants rows matching the user's email with no claimed_by
// and links them to the user. Fails silently to never block login.

export async function claimGuestParticipants(userId: string, email: string): Promise<void> {
  try {
    await supabase
      .from('play_participants')
      .update({ claimed_by: userId })
      .eq('email', email.trim().toLowerCase())
      .is('claimed_by', null);
  } catch (err) {
    console.warn('[claimGuestParticipants] failed silently:', err);
  }
}

// ─── uploadPlayEventCover ─────────────────────────────────────────────────────
// Uploads a local image URI to the tournament-covers bucket.
// Returns the public URL on success.

// Some picker results (esp. Android content:// URIs) have no usable file
// extension, and the URI extension can't always be trusted anyway — the
// caller's asset.mimeType (when available) is the source of truth for what
// was actually picked, whether that's PNG, HEIC, WEBP, GIF, etc.
function resolveUploadFormat(localUri: string, mimeTypeHint?: string | null): { ext: string; mimeType: string } {
  if (mimeTypeHint?.startsWith('image/')) {
    const ext = mimeTypeHint.slice('image/'.length).toLowerCase().replace('jpeg', 'jpg');
    return { ext, mimeType: mimeTypeHint };
  }
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  return { ext, mimeType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` };
}

export async function uploadPlayEventCover(
  userId: string,
  localUri: string,
  mimeTypeHint?: string | null,
): Promise<string> {
  // React Native cannot fetch file:// URIs into a blob — use FormData instead
  const { ext, mimeType } = resolveUploadFormat(localUri, mimeTypeHint);
  const path     = `play-events/${userId}/${Date.now()}.${ext}`;

  const formData = new FormData();
  formData.append('file', { uri: localUri, name: `upload.${ext}`, type: mimeType } as unknown as Blob);

  const { error } = await supabase.storage
    .from('tournament-covers')
    .upload(path, formData, { contentType: mimeType, upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from('tournament-covers').getPublicUrl(path);
  return data.publicUrl;
}

// ─── createRoundRobin ─────────────────────────────────────────────────────────
// Round Robin maps to event_type = 'round_robin' (exists in play_event_type enum).

export async function createRoundRobin(input: CreateRoundRobinInput): Promise<PlayEvent> {
  return createCommunityEvent({ ...input, eventType: 'round_robin' });
}

// ─── createMiniTournament ─────────────────────────────────────────────────────
// Mini Tournament maps to event_type = 'mini_tournament'.
// Bracket / scoring / format fields are not stored in play_events (Slice 1).

export type CreateMiniTournamentInput = Omit<CreateCommunityEventInput, 'eventType'>;

export async function createMiniTournament(input: CreateMiniTournamentInput): Promise<PlayEvent> {
  return createCommunityEvent({ ...input, eventType: 'mini_tournament' });
}

// ─── createClinic ─────────────────────────────────────────────────────────────
// Clinic maps to event_type = 'clinic'. Structurally a Quick Game (single
// session, no bracket/rounds) with an instructor attached — reuses Quick
// Game's created/roster/detail screens.

export type CreateClinicInput = Omit<CreateCommunityEventInput, 'eventType'>;

export async function createClinic(input: CreateClinicInput): Promise<PlayEvent> {
  return createCommunityEvent({ ...input, eventType: 'clinic' });
}

// ─── cancelPlayEvent ──────────────────────────────────────────────────────────
// Sets status = 'cancelled' on the event row. Row is preserved.

export async function cancelPlayEvent(eventId: string): Promise<boolean> {
  // Auth check.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  // Fetch event to verify organizer + status.
  const { data: existing, error: fetchErr } = await supabase
    .from('play_events')
    .select('organizer_id, status, event_type')
    .eq('id', eventId)
    .single();
  if (fetchErr || !existing) throw fetchErr ?? new Error('event_not_found');
  if (existing.organizer_id !== user.id) throw new Error('not_organizer');
  if (existing.event_type !== 'open_play' && existing.event_type !== 'round_robin' && existing.event_type !== 'mini_tournament' && existing.event_type !== 'clinic') {
    throw new Error('not_cancelable_event_type');
  }
  if (existing.status === 'cancelled' || existing.status === 'completed') throw new Error('already_finalized');

  const { error: updateErr } = await supabase
    .from('play_events')
    .update({ status: 'cancelled' })
    .eq('id', eventId);
  if (updateErr) throw updateErr;

  return true;
}

// ─── completePlayEvent ────────────────────────────────────────────────────────
// Marks a Quick Game completed. Guards: auth, organizer, event_type, allowed status.

const COMPLETABLE_STATUSES = new Set(['open', 'full', 'in_progress']);

export async function completePlayEvent(eventId: string): Promise<PlayEvent> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  const { data: existing, error: fetchErr } = await supabase
    .from('play_events')
    .select('*')
    .eq('id', eventId)
    .single();
  if (fetchErr || !existing) throw fetchErr ?? new Error('event_not_found');
  if (existing.organizer_id !== user.id) throw new Error('not_organizer');
  if (existing.event_type !== 'open_play' && existing.event_type !== 'clinic') throw new Error('not_quick_game');
  if (!COMPLETABLE_STATUSES.has(existing.status)) throw new Error('status_not_completable');

  const { data, error } = await supabase
    .from('play_events')
    .update({ status: 'completed' })
    .eq('id', eventId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── updatePlayEventStatus ────────────────────────────────────────────────────
// Allows organizer to toggle a Quick Game between open and closed.
// Forbidden transitions: cancelled/completed → any.

// 'closed' is represented as 'full' in the DB enum (no schema change).
// open → full (close), full → open (reopen).
const TOGGLEABLE_STATUSES = new Set(['open', 'full']);

export async function updatePlayEventStatus(
  eventId: string,
  intent: 'open' | 'closed',
): Promise<PlayEvent> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  const { data: existing, error: fetchErr } = await supabase
    .from('play_events')
    .select('*')
    .eq('id', eventId)
    .single();
  if (fetchErr || !existing) throw fetchErr ?? new Error('event_not_found');
  if (existing.organizer_id !== user.id) throw new Error('not_organizer');
  if (existing.event_type !== 'open_play' && existing.event_type !== 'clinic') throw new Error('not_quick_game');
  if (!TOGGLEABLE_STATUSES.has(existing.status)) throw new Error('status_not_toggleable');

  // Reopen guard: if roster is already at capacity, reopening creates a broken
  // open-but-unjoinable state — reject with a clear error.
  if (intent === 'open') {
    const { count, error: countErr } = await supabase
      .from('play_participants')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);
    if (countErr) throw countErr;
    if ((count ?? 0) >= (existing.max_players ?? 0)) {
      throw new Error('reopen_at_capacity');
    }
  }

  // Map intent to DB enum value: 'closed' → 'full', 'open' → 'open'.
  const dbStatus = intent === 'closed' ? 'full' : 'open';

  const { data, error } = await supabase
    .from('play_events')
    .update({ status: dbStatus })
    .eq('id', eventId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── updatePlayEvent ──────────────────────────────────────────────────────────
// Patch allowed organizer-editable fields on an open play_event.
// Guards: authenticated, caller is organizer, status=open, max_players >= participant count.

const ALLOWED_PATCH_KEYS: ReadonlySet<string> = new Set([
  'name', 'event_date', 'start_time', 'max_players', 'notes',
  'facility_id', 'venue_name', 'location', 'city', 'state',
  'duration_minutes',
]);

export type UpdatePlayEventPatch = {
  name?:             string;
  event_date?:       string;
  start_time?:       string | null;
  max_players?:      number;
  notes?:            string | null;
  facility_id?:      string | null;
  venue_name?:       string | null;
  location?:         string;
  city?:             string | null;
  state?:            string | null;
  duration_minutes?: number | null;
};

export async function updatePlayEvent(
  eventId: string,
  patch: UpdatePlayEventPatch,
): Promise<PlayEvent> {
  // Strip any keys not in the allowlist (runtime guard).
  const safePatch = Object.fromEntries(
    Object.entries(patch).filter(([k]) => ALLOWED_PATCH_KEYS.has(k)),
  ) as UpdatePlayEventPatch;

  // Auth check.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  // Fetch existing event to verify organizer + status.
  const { data: existing, error: fetchErr } = await supabase
    .from('play_events')
    .select('*')
    .eq('id', eventId)
    .single();
  if (fetchErr || !existing) throw fetchErr ?? new Error('event_not_found');

  if (existing.organizer_id !== user.id) throw new Error('not_organizer');
  if (existing.event_type !== 'open_play' && existing.event_type !== 'round_robin' && existing.event_type !== 'mini_tournament' && existing.event_type !== 'clinic') throw new Error('not_editable_event_type');
  if (existing.status !== 'open') throw new Error('event_not_open');

  // Capacity guard: max_players cannot drop below current participant count.
  if (safePatch.max_players !== undefined) {
    const { count, error: countErr } = await supabase
      .from('play_participants')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);
    if (countErr) throw countErr;
    if (safePatch.max_players < (count ?? 0)) {
      throw new Error('below_participant_count');
    }
  }

  const { data, error } = await supabase
    .from('play_events')
    .update(safePatch)
    .eq('id', eventId)
    .select()
    .single();

  if (error) throw error;
  return data;
}


