import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, Dimensions, Alert, ActivityIndicator, Pressable,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import type { RatingSource } from '@/lib/playerRating';
import { PressableCTA } from '@/components';
import { resolvePlayerRating, formatPlayerRating } from '@/lib/playerRating';
import { colors, spacing } from '@/theme';
import { EmptyState } from '@/components/states/ScreenState';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { supabase } from '@/lib/supabase';
import { getOrCreateConversation } from '@/lib/conversationService';
import { openPhotoViewer } from '@/lib/photoViewer';
import { computeMatch } from '@shared/match';
import { distanceMilesOrNull, formatMiles } from '@shared/geo';
import {
  normalizeSchedule, isScheduleEmpty, scheduleOverlap, describeOverlap, summarizeSchedule,
} from '@shared/availability';
import {
  playStyleSummary,
  lookingStatusLabel, genderLabel, handLabel, preferredFormatLabel, playIntensityLabel,
} from '@shared/play-profile';
import { useSupportContext } from '@/lib/support/supportContext';
import { ReportUserSheet } from '@/components/safety/ReportUserSheet';

const { width: SW } = Dimensions.get('window');
const HERO_H = SW * 1.1;

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold, goldBg: colors.goldBg,
  text: colors.text, textSub: colors.textSub, border: colors.border,
  success: colors.success, danger: colors.danger,
};

type ProfileData = {
  name: string;
  dupr: number;
  ratingSource: RatingSource;
  location: string;
  /** Miles, or null when either side has no coordinates. Was hardcoded to 0,
   *  so every profile claimed "0 mi" regardless of where the player was. */
  distanceMi: number | null;
  lookingFor: string;
  skillRange: string;
  hand: string | null;
  style: string | null;
  age: number | null;
  bio: string;
  verifiedDupr: boolean;
  gender: string | null;
  formats: string[];
  intensity: string | null;
  homeCourt: string | null;
  /** Slots BOTH players share, when the viewer has a schedule; otherwise this
   *  player's own availability summary. */
  availabilityLabel: string | null;
  availabilityIsShared: boolean;
  upcomingEvents: { name: string; date: string; type: string }[];
  groups: { name: string; role: string }[];
  stats: { label: string; value: string }[];
  photos: string[];
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sec.wrap}>
      <Text style={sec.title}>{title}</Text>
      {children}
    </View>
  );
}
const sec = StyleSheet.create({
  wrap: { marginBottom: 24 },
  title: { color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing, marginBottom: 10 },
});

export default function PartnerProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  // No setter: the hero opens the shared viewer rather than advancing in
  // place, and the viewer owns paging across a set.
  const [photoIdx]                = useState(0);
  const [loading, setLoading]       = useState(true);
  const [profile, setProfile]       = useState<ProfileData | null>(null);
  const [myId, setMyId]             = useState<string | null>(null);
  const [connected, setConnected]   = useState(false);
  const [pending, setPending]       = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  useSupportContext({ feature: 'partner_finder', entityType: 'player_profile', entityId: id, entityLabel: profile?.name });
  const [msgLoading, setMsgLoading] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? null;

      const [
        { data: p }, { count }, myLikes, { data: myProfile },
        { data: regRows }, { data: playRows }, { data: groupRows },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, avatar_url, dupr, self_rating, skill_level, hand, play_style, bio, dupr_verified, location_city, location_state, looking_status, availability, availability_schedule, location_lat, location_lng, preferred_formats, play_intensity, gender, home_court_id, facilities:home_court_id(name, city, state)')
          .eq('id', id)
          .single(),
        supabase
          .from('partner_matches')
          .select('*', { count: 'exact', head: true })
          .or(`user_a.eq.${id},user_b.eq.${id}`),
        uid
          ? supabase
              .from('partner_likes')
              .select('kind')
              .eq('from_user_id', uid)
              .eq('to_user_id', id)
          : Promise.resolve({ data: [] as { kind: string }[] }),
        uid
          ? supabase.from('profiles').select('dupr, self_rating, availability, availability_schedule, location_lat, location_lng').eq('id', uid).maybeSingle()
          : Promise.resolve({ data: null }),
        // Activity. Both sections existed in the UI with hardcoded empty arrays
        // behind them, so the render blocks could never fire. The queries are
        // lifted from app/players/[id].tsx, which has had them all along but is
        // reachable from exactly one screen (the round-robin roster).
        supabase
          .from('registrations')
          .select('tournament_id, tournaments(name, event_date, city)')
          .or(`player_id.eq.${id},partner_id.eq.${id}`)
          .limit(20),
        supabase
          .from('play_participants')
          .select('event_id, play_events(name, event_date, city, state)')
          .eq('claimed_by', id)
          .limit(20),
        supabase
          .from('group_members')
          .select('role, groups(name)')
          .eq('user_id', id)
          .eq('status', 'active')
          .limit(20),
      ]);

      if (cancelled) return;
      if (!p) { setLoading(false); return; }

      const rating = resolvePlayerRating(p.dupr, p.self_rating);
      const dupr = rating.value;
      const location = [p.location_city, p.location_state].filter(Boolean).join(', ') || 'Unknown';
      const photos = p.avatar_url ? [p.avatar_url] : [];
      // date_of_birth is no longer readable by the client — a birth date is
      // identity-grade PII and this screen only ever wanted the age, so the
      // server returns the integer instead (20260921130000).
      const { data: ageValue } = await supabase.rpc('profile_age', { p_user_id: id });
      const age = typeof ageValue === 'number' ? ageValue : null;

      // Real distance, from the same helper web and the finder use.
      const distanceMi = distanceMilesOrNull(
        myProfile?.location_lat != null && myProfile?.location_lng != null
          ? { lat: myProfile.location_lat, lng: myProfile.location_lng }
          : null,
        { lat: p.location_lat, lng: p.location_lng },
      );

      const { pct } = computeMatch(
        { dupr: dupr || null, schedule: p.availability_schedule, distanceMi },
        {
          dupr: myProfile?.dupr ?? (myProfile?.self_rating ? parseFloat(myProfile.self_rating) : null),
          schedule: myProfile?.availability_schedule ?? null,
        },
      );

      setMyId(uid);
      setBookmarked((myLikes.data ?? []).some(l => l.kind === 'save'));
      setPending((myLikes.data ?? []).some(l => l.kind === 'like'));
      if (uid) {
        const { data: match } = await supabase
          .from('partner_matches')
          .select('id')
          .or(`and(user_a.eq.${uid},user_b.eq.${id}),and(user_a.eq.${id},user_b.eq.${uid})`)
          .maybeSingle();
        if (!cancelled) setConnected(!!match);
      }

      // Prefer what the two of you SHARE — "Both free Wednesday evenings" is a
      // reason to message someone; "Wed, Sat" is a fact about a stranger.
      const theirSchedule = normalizeSchedule(p.availability_schedule);
      const mySchedule = normalizeSchedule(myProfile?.availability_schedule);
      const overlap = isScheduleEmpty(mySchedule) ? [] : scheduleOverlap(mySchedule, theirSchedule);
      const sharedLabel = overlap.length > 0 ? describeOverlap(overlap) : null;
      const ownLabel = isScheduleEmpty(theirSchedule) ? null : summarizeSchedule(theirSchedule);

      const homeCourtRow = (p as { facilities?: { name: string; city: string | null; state: string | null } | null }).facilities;

      const tournaments = (regRows ?? [])
        .map((r) => (r as { tournaments?: { name: string; event_date: string; city: string | null } | null }).tournaments)
        .filter((t): t is { name: string; event_date: string; city: string | null } => !!t)
        .map((t) => ({ name: t.name, date: t.event_date, type: 'Tournament' }));

      const communityEvents = (playRows ?? [])
        .map((r) => (r as { play_events?: { name: string; event_date: string } | null }).play_events)
        .filter((e): e is { name: string; event_date: string } => !!e)
        .map((e) => ({ name: e.name, date: e.event_date, type: 'Community Play' }));

      // Newest first, and capped: this is a profile, not a history screen.
      const activity = [...tournaments, ...communityEvents]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5);

      const groups = (groupRows ?? [])
        .map((r) => {
          const row = r as { role: string | null; groups?: { name: string } | null };
          return row.groups ? { name: row.groups.name, role: row.role ?? 'member' } : null;
        })
        .filter((g): g is { name: string; role: string } => !!g);

      setProfile({
        name: p.full_name,
        dupr,
        ratingSource: rating.source,
        location,
        distanceMi,
        lookingFor: p.looking_status || 'Partner',
        skillRange: p.skill_level || '',
        hand: p.hand,
        style: playStyleSummary(p.play_style),
        age,
        bio: p.bio || '',
        verifiedDupr: p.dupr_verified,
        gender: p.gender ?? null,
        formats: Array.isArray(p.preferred_formats) ? p.preferred_formats : [],
        intensity: p.play_intensity ?? null,
        homeCourt: homeCourtRow?.name ?? null,
        availabilityLabel: sharedLabel ?? ownLabel,
        availabilityIsShared: !!sharedLabel,
        upcomingEvents: activity,
        groups,
        stats: [
          { label: 'Connections', value: String(count ?? 0) },
          ...(uid ? [{ label: 'Match', value: `${pct}%` }] : []),
        ],
        photos,
      });
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  async function handleConnect() {
    if (!profile || !id) return;
    if (connected) { Alert.alert('Already Connected', `You are already connected with ${profile.name}.`); return; }
    if (pending)   { Alert.alert('Request Pending', `Your connection request to ${profile.name} is still pending.`); return; }
    if (!myId)     { Alert.alert('Sign in required', 'Please sign in to send connection requests.'); return; }
    if (connectLoading) return;
    setConnectLoading(true);
    try {
      // supabase-js RESOLVES on a database error — it does not throw — so the
      // surrounding try/catch never sees one. Before this check, a rejected
      // insert still set pending and told the user "Connection Request Sent".
      // The blocking triggers (20260831050000) make that path reachable.
      const { error: likeError } = await supabase
        .from('partner_likes')
        .upsert({ from_user_id: myId, to_user_id: id, kind: 'like' });
      if (likeError) {
        Alert.alert('Could not send request', 'This action is unavailable.');
        return;
      }
      setPending(true);
      const a = myId < id ? myId : id;
      const b = myId < id ? id : myId;
      const { data: match } = await supabase
        .from('partner_matches')
        .select('id')
        .eq('user_a', a)
        .eq('user_b', b)
        .maybeSingle();
      if (match) {
        setConnected(true);
        Alert.alert("It's a Match!", `You and ${profile.name} liked each other.`);
      } else {
        Alert.alert('Connection Request Sent', `Your request to ${profile.name} has been sent.`);
      }
    } catch (e: unknown) {
      Alert.alert('Could not send request', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setConnectLoading(false);
    }
  }

  async function handleBookmark() {
    if (!profile || !id || !myId) return;
    const wasBookmarked = bookmarked;
    setBookmarked(!wasBookmarked); // optimistic
    try {
      // Same trap as handleConnect: check `error`, do not rely on a throw.
      const { error: bookmarkError } = wasBookmarked
        ? await supabase.from('partner_likes').delete()
            .eq('from_user_id', myId).eq('to_user_id', id).eq('kind', 'save')
        : await supabase.from('partner_likes').upsert({ from_user_id: myId, to_user_id: id, kind: 'save' });
      if (bookmarkError) setBookmarked(wasBookmarked); // revert; the write did not happen
    } catch {
      setBookmarked(wasBookmarked); // revert on failure
    }
  }

  if (loading) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={L.navy} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
        <StatusBar style="dark" />
        <EmptyState
          icon="person-outline"
          title="Profile not found"
          inline
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>

        {/* ── Hero section ── */}
        <View style={{ height: HERO_H }}>
          <Image source={{ uri: profile.photos[photoIdx] }} style={StyleSheet.absoluteFill} resizeMode="cover" />

          {/* Photo dots */}
          {profile.photos.length > 1 && (
            <View style={[s.photoDots, { top: insets.top + 48 }]}>
              {profile.photos.map((_, i) => (
                <View key={i} style={[s.dot, i === photoIdx && s.dotActive]} />
              ))}
            </View>
          )}

          {/* Tap the photo to see it whole, as in chat and group feeds.
              This replaced left/right advance zones: `photos` is built from
              avatar_url alone, so there has only ever been one photo and both
              zones were no-ops — tapping a face did nothing. The viewer
              advances across a set by itself if profiles ever gain more. */}
          {profile.photos.length > 0 && (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => openPhotoViewer(profile.photos, photoIdx, profile.name)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`View ${profile.name}'s photo full screen`}
            />
          )}

          {/* Top bar */}
          <View style={[s.heroTopBar, { top: insets.top + 12 }]}>
            <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            {/* Actions group RIGHT, back stays left. With three children under
                space-between the bookmark sat dead centre, reading as a badge
                on the photo rather than a control — and it drifted whenever
                the report button was hidden on your own profile. */}
            <View style={s.heroActions}>
              {/* Saving a player IS adding a contact — same partner_likes
                  kind='save' row the Contacts tab reads. */}
              <PressableCTA
                style={s.iconBtn}
                onPress={handleBookmark}
                hapticType="light"
                pulseOn={bookmarked}
                accessibilityLabel={bookmarked ? 'Remove from contacts' : 'Save to contacts'}
              >
                <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={bookmarked ? L.gold : '#FFFFFF'} />
              </PressableCTA>
              {/* 4.3. Hidden on your own profile — reporting yourself is not a
                  thing, and blocked_users has a no_self_block constraint that
                  would reject it anyway. */}
              {myId && myId !== id ? (
                <TouchableOpacity
                  style={s.iconBtn}
                  onPress={() => setReportOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Report this person"
                >
                  <Ionicons name="flag-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Name overlay */}
          <View style={s.heroOverlay}>
            <View style={s.heroNameRow}>
              <Text style={s.heroName}>{profile.name}</Text>
              {profile.verifiedDupr && (
                <Ionicons name="checkmark-circle" size={22} color={L.gold} style={{ marginLeft: 6, marginTop: 4 }} />
              )}
            </View>
            <View style={s.heroMeta}>
              <View style={s.heroMetaChip}>
                <Ionicons name="speedometer-outline" size={12} color={L.gold} />
                <Text style={s.heroMetaText}>
                  {formatPlayerRating({ value: profile.dupr, source: profile.ratingSource })}
                </Text>
              </View>
              <View style={s.heroMetaChip}>
                <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.8)" />
                <Text style={s.heroMetaText}>
                  {profile.location}
                  {formatMiles(profile.distanceMi) ? ` · ${formatMiles(profile.distanceMi)}` : ''}
                </Text>
              </View>
              <View style={s.heroMetaChip}>
                <Ionicons name="trophy-outline" size={12} color="rgba(255,255,255,0.8)" />
                <Text style={s.heroMetaText}>
                  {lookingStatusLabel(profile.lookingFor) ?? profile.lookingFor}
                </Text>
              </View>
            </View>
            {/* Quick info pills */}
            <View style={s.heroPills}>
              {([
                profile.age    ? { icon: 'calendar-outline',  label: `${profile.age} yrs` }                : null,
                genderLabel(profile.gender) ? { icon: 'person-outline', label: genderLabel(profile.gender)! } : null,
                handLabel(profile.hand)     ? { icon: 'hand-left-outline', label: handLabel(profile.hand)! }  : null,
                profile.intensity ? { icon: 'flame-outline', label: playIntensityLabel(profile.intensity) }   : null,
                profile.style  ? { icon: 'heart-outline',     label: profile.style }                          : null,
              ] as ({ icon: string; label: string } | null)[])
                .filter((p): p is { icon: string; label: string } => p !== null)
                .map(p => (
                <View key={p.label} style={s.heroPill}>
                  <Ionicons name={p.icon as never} size={11} color="rgba(255,255,255,0.85)" />
                  <Text style={s.heroPillText}>{p.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Stats row ── */}
        <View style={s.statsRow}>
          {profile.stats.map((stat, i) => (
            <View key={stat.label} style={[s.statCell, i < profile.stats.length - 1 && s.statCellBorder]}>
              <Text style={s.statVal}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Body sections ── */}
        <View style={s.body}>

          {/* About. Rendered only when there is something in it — an empty
              card under a heading reads as broken, not as "no bio". */}
          {(!!profile.bio || !!profile.skillRange) && (
            <Section title="ABOUT">
              <View style={s.card}>
                {!!profile.bio && <Text style={s.bioText}>{profile.bio}</Text>}
                {!!profile.skillRange && (
                  <View style={s.bioMeta}>
                    <Text style={s.bioMetaChip}>Skill: {profile.skillRange}</Text>
                  </View>
                )}
              </View>
            </Section>
          )}

          {/* Availability. The shared version leads when there is one: "Both
              free Wednesday evenings" is a reason to message someone, where
              "Wed, Sat" is a fact about a stranger. */}
          {!!profile.availabilityLabel && (
            <Section title={profile.availabilityIsShared ? 'WHEN YOU BOTH PLAY' : 'AVAILABILITY'}>
              <View style={s.card}>
                <View style={s.infoRow}>
                  <Ionicons
                    name={profile.availabilityIsShared ? 'people-outline' : 'calendar-outline'}
                    size={16}
                    color={profile.availabilityIsShared ? L.success : L.gold}
                  />
                  <Text style={s.infoText}>{profile.availabilityLabel}</Text>
                </View>
              </View>
            </Section>
          )}

          {/* Where and how they play */}
          {(!!profile.homeCourt || profile.formats.length > 0) && (
            <Section title="PLAYS">
              <View style={s.card}>
                {!!profile.homeCourt && (
                  <View style={s.infoRow}>
                    <Ionicons name="location-outline" size={16} color={L.gold} />
                    <Text style={s.infoText}>Home court: {profile.homeCourt}</Text>
                  </View>
                )}
                {profile.formats.length > 0 && (
                  <View style={s.chipWrap}>
                    {profile.formats.map((f) => (
                      <View key={f} style={s.chip}>
                        <Text style={s.chipText}>{preferredFormatLabel(f)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </Section>
          )}

          {/* Upcoming events */}
          {profile.upcomingEvents.length > 0 && (
            <Section title="UPCOMING EVENTS">
              <View style={s.card}>
                {profile.upcomingEvents.map((ev, i) => (
                  <View key={ev.name} style={[s.listRow, i > 0 && s.listRowBorder]}>
                    <View style={s.eventIcon}>
                      <Ionicons
                        name={ev.type === 'Tournament' ? 'trophy-outline' : 'people-outline'}
                        size={18}
                        color={L.gold}
                      />
                    </View>
                    <View style={s.eventInfo}>
                      <Text style={s.eventName}>{ev.name}</Text>
                      <Text style={s.eventMeta}>{ev.date} · {ev.type}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Section>
          )}

          {/* Groups */}
          {profile.groups.length > 0 && (
            <Section title="GROUPS">
              <View style={s.card}>
                {profile.groups.map((g, i) => (
                  <View key={g.name} style={[s.listRow, i > 0 && s.listRowBorder]}>
                    <View style={s.groupIcon}>
                      <Ionicons name="people-outline" size={18} color={L.textSub} />
                    </View>
                    <View style={s.eventInfo}>
                      <Text style={s.eventName}>{g.name}</Text>
                      <Text style={s.eventMeta}>{g.role}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Section>
          )}

        </View>
      </ScrollView>

      {/* ── Sticky CTA ── */}
      <View style={[s.cta, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={s.passBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={L.textSub} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.connectBtn, connected && s.connectBtnDone]}
          onPress={handleConnect}
          disabled={connectLoading}
          activeOpacity={0.85}
        >
          {connectLoading
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <Ionicons name={connected ? 'checkmark' : pending ? 'time-outline' : 'heart'} size={18} color="#FFFFFF" />}
          <Text style={s.connectText}>
            {connected ? 'Connected' : pending ? 'Pending' : 'Connect'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.msgBtn}
          disabled={msgLoading}
          activeOpacity={0.8}
          onPress={async () => {
            if (!id) return;
            setMsgLoading(true);
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) {
                Alert.alert('Sign in required', 'Please sign in to send messages.');
                return;
              }
              if (user.id === id) return;
              const convId = await getOrCreateConversation(user.id, id);
              router.push(`/conversation/${convId}` as never);
            } catch (e: unknown) {
              Alert.alert('Could not open chat', e instanceof Error ? e.message : 'Please try again.');
            } finally {
              setMsgLoading(false);
            }
          }}
        >
          {msgLoading
            ? <ActivityIndicator size="small" color={L.navy} />
            : <Ionicons name="chatbubble-outline" size={22} color={L.navy} />}
        </TouchableOpacity>
      </View>

      {myId && profile && myId !== id ? (
        <ReportUserSheet
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          reporterId={myId}
          reportedId={id}
          reportedName={profile.name}
          // Blocking from here removes the reason to stay on the profile.
          onBlocked={() => router.back()}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  photoDots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { backgroundColor: L.gold, width: 18 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  infoText: { color: L.text, fontSize: text.body.size, fontWeight: '500', flex: 1, lineHeight: 21 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: {
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.border,
  },
  chipText: { color: L.navy, fontSize: text.caption.size, fontWeight: '700' },

  heroTopBar: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  // Keeps save + report together on the right, so the row is "leave" on one
  // side and "act on this person" on the other, whether or not report renders.
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },

  heroOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingBottom: 20, paddingTop: 40,
  },
  heroNameRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  heroName: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  heroMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  heroMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroMetaText: { color: 'rgba(255,255,255,0.88)', fontSize: text.caption.size, fontWeight: '500' },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: shape.pill,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
  },
  heroPillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },

  statsRow: {
    flexDirection: 'row', backgroundColor: L.bg,
    borderBottomWidth: 1, borderBottomColor: L.border,
  },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statCellBorder: { borderRightWidth: 1, borderRightColor: L.border },
  statVal: { color: L.navy, fontSize: text.cardTitle.size, fontWeight: '800' },
  statLabel: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },

  body: { padding: spacing.screenH, paddingTop: 20 },

  card: {
    backgroundColor: L.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border, overflow: 'hidden',
  },
  bioText: { color: L.text, fontSize: text.body.size, fontWeight: '500', lineHeight: 21, padding: 14, paddingBottom: 8 },
  bioMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 14, paddingTop: 0 },
  bioMetaChip: { color: L.gold, fontSize: text.action.size, fontWeight: '800' },

  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  listRowBorder: { borderTopWidth: 1, borderTopColor: L.border },
  eventIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: L.goldBg, alignItems: 'center', justifyContent: 'center',
  },
  groupIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: L.page, alignItems: 'center', justifyContent: 'center',
  },
  eventInfo: { flex: 1 },
  eventName: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  eventMeta: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },

  cta: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderTopWidth: 1, borderTopColor: L.border,
    paddingHorizontal: spacing.screenH, paddingTop: 14,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  passBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: L.page, borderWidth: 1.5, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  connectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.gold, borderRadius: shape.cta, paddingVertical: 14,
  },
  connectBtnDone: { backgroundColor: colors.success },
  connectText: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800' },
  msgBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: L.page, borderWidth: 1.5, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
});
