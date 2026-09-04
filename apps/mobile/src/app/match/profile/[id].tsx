import React, { useState, useEffect } from 'react';
import { playStyleSummary } from '@shared/play-profile';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, Dimensions, Alert, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { supabase } from '@/lib/supabase';
import { getOrCreateConversation } from '@/lib/conversationService';
import { computeMatch } from '@/lib/computeMatch';
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
  location: string;
  distance: number;
  lookingFor: string;
  skillRange: string;
  hand: string | null;
  style: string | null;
  age: number | null;
  bio: string;
  verifiedDupr: boolean;
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
  const [photoIdx, setPhotoIdx]   = useState(0);
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

      const [{ data: p }, { count }, myLikes, { data: myProfile }] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, avatar_url, dupr, self_rating, skill_level, hand, play_style, bio, dupr_verified, location_city, location_state, looking_status, date_of_birth, availability')
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
          ? supabase.from('profiles').select('dupr, self_rating, availability').eq('id', uid).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (cancelled) return;
      if (!p) { setLoading(false); return; }

      const dupr = p.dupr ?? (p.self_rating ? parseFloat(p.self_rating) : 0);
      const location = [p.location_city, p.location_state].filter(Boolean).join(', ') || 'Unknown';
      const photos = p.avatar_url ? [p.avatar_url] : [];
      const age = p.date_of_birth
        ? Math.floor((Date.now() - new Date(p.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null;

      const { pct } = computeMatch(
        { dupr: dupr || null, availability: p.availability },
        {
          dupr: myProfile?.dupr ?? (myProfile?.self_rating ? parseFloat(myProfile.self_rating) : null),
          availability: myProfile?.availability ?? null,
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

      setProfile({
        name: p.full_name,
        dupr,
        location,
        distance: 0,
        lookingFor: p.looking_status || 'Partner',
        skillRange: p.skill_level || '',
        hand: p.hand,
        style: playStyleSummary(p.play_style),
        age,
        bio: p.bio || '',
        verifiedDupr: p.dupr_verified,
        upcomingEvents: [],
        groups: [],
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
        <Ionicons name="person-outline" size={52} color={L.textSub} />
        <Text style={{ color: L.navy, fontSize: 18, fontWeight: '800', marginTop: 12 }}>Profile not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: L.gold, fontWeight: '700' }}>Go back</Text>
        </TouchableOpacity>
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

          {/* Photo tap zones */}
          <View style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1}
                onPress={() => setPhotoIdx(i => Math.max(0, i - 1))} />
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1}
                onPress={() => setPhotoIdx(i => Math.min(profile.photos.length - 1, i + 1))} />
            </View>
          </View>

          {/* Top bar */}
          <View style={[s.heroTopBar, { top: insets.top + 12 }]}>
            <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={handleBookmark}>
              <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={bookmarked ? L.gold : '#FFFFFF'} />
            </TouchableOpacity>
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
                <Ionicons name="star" size={12} color={L.gold} />
                <Text style={s.heroMetaText}>{profile.dupr.toFixed(1)} DUPR</Text>
              </View>
              <View style={s.heroMetaChip}>
                <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.8)" />
                <Text style={s.heroMetaText}>{profile.location} · {profile.distance} mi</Text>
              </View>
              <View style={s.heroMetaChip}>
                <Ionicons name="trophy-outline" size={12} color="rgba(255,255,255,0.8)" />
                <Text style={s.heroMetaText}>{profile.lookingFor}</Text>
              </View>
            </View>
            {/* Quick info pills */}
            <View style={s.heroPills}>
              {([
                profile.age   ? { icon: 'calendar-outline',  label: `${profile.age} yrs` }    : null,
                profile.hand  ? { icon: 'hand-left-outline', label: `${profile.hand} Hand` }   : null,
                profile.style ? { icon: 'heart-outline',     label: profile.style }             : null,
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

          {/* About */}
          <Section title="ABOUT">
            <View style={s.card}>
              <Text style={s.bioText}>{profile.bio}</Text>
              <View style={s.bioMeta}>
                <Text style={s.bioMetaChip}>Skill: {profile.skillRange}</Text>
              </View>
            </View>
          </Section>

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

  heroTopBar: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'space-between',
  },
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
