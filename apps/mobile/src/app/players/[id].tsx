import React, { useEffect, useState } from 'react';
import { playStyleSummary } from '@shared/play-profile';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Image, ActivityIndicator, Alert, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { supabase } from '@/lib/supabase';
import { getOrCreateConversation } from '@/lib/conversationService';
import { useSupportContext } from '@/lib/support/supportContext';

// ─── Design tokens ────────────────────────────────────────────────────────────

// Theme-backed alias — brand values resolve from @/theme.
const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldBorder: colors.goldBorder,
  textSub:    colors.textSub,
  textMuted:  colors.textSub,
  border:     colors.border,
  div:        colors.border,
};

type Tab = 'overview' | 'events' | 'marketplace';

type ActivityItem = {
  icon: string;
  label: string;
  sub: string;
  date: string;
  onPress: () => void;
};

type ProfileData = {
  id: string;
  name: string;
  firstName: string;
  avatarUrl: string | null;
  dupr: number | null;
  duprVerified: boolean;
  playStyle: string | null;
  hand: string | null;
  skillLevel: string | null;
  bio: string | null;
  locationLabel: string | null;
  distanceMiles: number | null;
  lookingStatus: string | null;
  eventsPlayed: number;
  partnersPlayed: number;
  activity: ActivityItem[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function titleCase(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ label, action, onAction }: {
  label: string; action?: string; onAction?: () => void;
}) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionLabel}>{label}</Text>
      {action && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text style={s.sectionAction}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Div() {
  return <View style={s.div} />;
}

// ─── Attribute column ─────────────────────────────────────────────────────────

function AttrCol({ icon, value, label, last }: {
  icon: string; value: string; label: string; last?: boolean;
}) {
  return (
    <View style={[s.attrCol, !last && s.attrColBorder]}>
      <Ionicons name={icon as never} size={22} color={L.textSub} />
      <Text style={s.attrValue}>{value}</Text>
      <Text style={s.attrLabel}>{label}</Text>
    </View>
  );
}

// ─── Stat column ──────────────────────────────────────────────────────────────

function StatCol({ number, line1, line2, last }: {
  number: string; line1: string; line2?: string; last?: boolean;
}) {
  return (
    <View style={[s.statCol, !last && s.statColBorder]}>
      <Text style={s.statNumber}>{number}</Text>
      <Text style={s.statLabel}>{line1}</Text>
      {line2 && <Text style={s.statLabel}>{line2}</Text>}
    </View>
  );
}

// ─── Looking-for chip ─────────────────────────────────────────────────────────

function LFChip({ icon, line1, line2 }: { icon: string; line1: string; line2: string }) {
  return (
    <View style={s.lfChip}>
      <Ionicons name={icon as never} size={20} color={L.gold} />
      <View style={{ alignItems: 'center' }}>
        <Text style={s.lfLine1}>{line1}</Text>
        <Text style={s.lfLine2}>{line2}</Text>
      </View>
    </View>
  );
}

// ─── Activity row ─────────────────────────────────────────────────────────────

function ActivityRow({ icon, label, sub, last, onPress }: {
  icon: string; label: string; sub: string; last?: boolean; onPress?: () => void;
}) {
  return (
    <>
      <TouchableOpacity style={s.actRow} activeOpacity={0.7} onPress={onPress}>
        <View style={s.actIcon}>
          <Ionicons name={icon as never} size={18} color={L.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.actLabel}>{label}</Text>
          <Text style={s.actSub}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
      </TouchableOpacity>
      {!last && <Div />}
    </>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview',    label: 'Overview'    },
    { key: 'events',      label: 'Events'      },
    { key: 'marketplace', label: 'Marketplace' },
  ];
  return (
    <View style={s.tabBar}>
      {tabs.map(({ key, label }) => (
        <TouchableOpacity
          key={key}
          style={s.tabItem}
          onPress={() => onChange(key)}
          activeOpacity={0.8}
        >
          <Text style={[s.tabLabel, active === key && s.tabLabelActive]}>
            {label}
          </Text>
          {active === key && <View style={s.tabUnderline} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Events placeholder ───────────────────────────────────────────────────────

function EventsTab() {
  return (
    <View style={s.placeholder}>
      <Ionicons name="trophy-outline" size={36} color={L.textMuted} />
      <Text style={s.placeholderText}>No events to show yet.</Text>
    </View>
  );
}

// ─── Marketplace placeholder ──────────────────────────────────────────────────

function MarketplaceTab() {
  return (
    <View style={s.placeholder}>
      <Ionicons name="storefront-outline" size={36} color={L.textMuted} />
      <Text style={s.placeholderText}>No listings to show yet.</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PlayerProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [saved,      setSaved]      = useState(false);
  const [activeTab,  setActiveTab]  = useState<Tab>('overview');
  const [loading,    setLoading]    = useState(true);
  const [profile,    setProfile]    = useState<ProfileData | null>(null);
  const [myId,       setMyId]       = useState<string | null>(null);
  const [msgLoading,  setMsgLoading]  = useState(false);

  useSupportContext({
    feature: 'partner_finder',
    entityType: 'player_profile',
    entityId: id,
    entityLabel: profile?.name,
  });

  const TAB_BAR_H = 56;

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? null;

      const [{ data: p }, myLikes, { data: myProfile }, { data: regs }, { data: parts }] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, avatar_url, dupr, dupr_verified, hand, play_style, bio, location_city, location_state, location_lat, location_lng, skill_level, looking_status')
          .eq('id', id)
          .single(),
        uid
          ? supabase.from('partner_likes').select('kind').eq('from_user_id', uid).eq('to_user_id', id)
          : Promise.resolve({ data: [] as { kind: string }[] }),
        uid
          ? supabase.from('profiles').select('location_lat, location_lng').eq('id', uid).maybeSingle()
          : Promise.resolve({ data: null }),
        (supabase as any)
          .from('registrations')
          .select('tournament_id, player_id, partner_id, tournaments(name, event_date, city)')
          .or(`player_id.eq.${id},partner_id.eq.${id}`),
        (supabase as any)
          .from('play_participants')
          .select('event_id, play_events(name, event_date, city, state)')
          .eq('claimed_by', id),
      ]);

      if (cancelled) return;
      if (!p) { setLoading(false); return; }

      const locationLabel = [p.location_city, p.location_state].filter(Boolean).join(', ') || null;

      let distanceMiles: number | null = null;
      if (myProfile?.location_lat != null && myProfile?.location_lng != null && p.location_lat != null && p.location_lng != null) {
        distanceMiles = Math.round(haversineMiles(
          { lat: myProfile.location_lat, lng: myProfile.location_lng },
          { lat: p.location_lat, lng: p.location_lng },
        ));
      }

      const regRows: any[] = regs ?? [];
      const partRows: any[] = parts ?? [];

      const partnerIds = new Set<string>();
      regRows.forEach(r => {
        if (r.player_id === id && r.partner_id) partnerIds.add(r.partner_id);
        if (r.partner_id === id && r.player_id) partnerIds.add(r.player_id);
      });

      const regItems: ActivityItem[] = regRows
        .filter(r => r.tournaments)
        .map(r => ({
          icon: 'trophy-outline',
          label: `Registered for ${r.tournaments?.name ?? 'a tournament'}`,
          sub: [formatDate(r.tournaments?.event_date), r.tournaments?.city].filter(Boolean).join(' • '),
          date: r.tournaments?.event_date ?? '',
          onPress: () => router.push(`/tournament/${r.tournament_id}` as never),
        }));

      const partItems: ActivityItem[] = partRows
        .filter(pr => pr.play_events)
        .map(pr => ({
          icon: 'calendar-outline',
          label: `Played ${pr.play_events?.name ?? 'a community event'}`,
          sub: [formatDate(pr.play_events?.event_date), pr.play_events?.city].filter(Boolean).join(' • '),
          date: pr.play_events?.event_date ?? '',
          onPress: () => router.push(`/community/${pr.event_id}` as never),
        }));

      const activity = [...regItems, ...partItems]
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 3);

      setMyId(uid);
      setSaved((myLikes.data ?? []).some((l: { kind: string }) => l.kind === 'save'));
      setProfile({
        id: String(id),
        name: p.full_name,
        firstName: (p.full_name || '').split(' ')[0] || p.full_name,
        avatarUrl: p.avatar_url,
        dupr: p.dupr,
        duprVerified: !!p.dupr_verified,
        playStyle: playStyleSummary(p.play_style),
        hand: p.hand,
        skillLevel: p.skill_level,
        bio: p.bio,
        locationLabel,
        distanceMiles,
        lookingStatus: p.looking_status,
        eventsPlayed: regRows.length + partRows.length,
        partnersPlayed: partnerIds.size,
        activity,
      });
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  async function handleMessage() {
    if (!profile) return;
    if (!myId) { Alert.alert('Sign in required', 'Please sign in to send messages.'); return; }
    if (myId === profile.id) { Alert.alert('This is you', "You can't message yourself."); return; }
    if (msgLoading) return;
    setMsgLoading(true);
    try {
      const convId = await getOrCreateConversation(myId, profile.id);
      router.push(`/conversation/${convId}` as never);
    } catch (e: unknown) {
      Alert.alert('Could not open conversation', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setMsgLoading(false);
    }
  }

  async function handleBookmark() {
    if (!profile || !myId) { Alert.alert('Sign in required', 'Please sign in to save players.'); return; }
    const wasSaved = saved;
    setSaved(!wasSaved); // optimistic
    try {
      if (wasSaved) {
        await supabase.from('partner_likes').delete()
          .eq('from_user_id', myId).eq('to_user_id', profile.id).eq('kind', 'save');
      } else {
        await supabase.from('partner_likes').upsert({ from_user_id: myId, to_user_id: profile.id, kind: 'save' });
      }
    } catch {
      setSaved(wasSaved); // revert on failure
    }
  }

  async function handleShare() {
    if (!profile) return;
    try {
      await Share.share({ message: `Check out ${profile.name} on Pickleball App!` });
    } catch {
      // user cancelled or share unavailable — nothing to do
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
        <TouchableOpacity onPress={() => goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: L.gold, fontWeight: '700' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ratingLabel = profile.dupr != null ? `DUPR ${profile.dupr}` : profile.skillLevel || null;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
          <Text style={s.headerBack}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.headerOverflow} activeOpacity={0.7}>
          <Ionicons name="ellipsis-horizontal" size={20} color={L.navy} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + TAB_BAR_H + 24 }]}
      >
        {/* ── Hero ── */}
        <View style={s.hero}>
          {/* Avatar */}
          <View style={s.avatarWrap}>
            <Image
              source={{ uri: profile.avatarUrl || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=240&h=240&fit=crop&q=80' }}
              style={s.avatar}
            />
            {profile.duprVerified && (
              <View style={s.avatarBadge}>
                <Ionicons name="shield-checkmark" size={18} color={L.gold} />
              </View>
            )}
          </View>

          {/* Name + info */}
          <View style={s.heroInfo}>
            <View style={s.nameRow}>
              <Text style={s.playerName}>{profile.name}</Text>
              {profile.duprVerified && (
                <Ionicons name="checkmark-circle" size={20} color={L.gold} style={{ marginLeft: 6 }} />
              )}
            </View>

            {/* Chips */}
            {(ratingLabel || profile.playStyle) && (
              <View style={s.chipRow}>
                {ratingLabel && (
                  <View style={s.chip}>
                    <Text style={s.chipText}>{ratingLabel}</Text>
                  </View>
                )}
                {profile.playStyle && (
                  <View style={s.chip}>
                    <Text style={s.chipText}>{titleCase(profile.playStyle)}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Location */}
            {(profile.locationLabel || profile.distanceMiles != null) && (
              <View style={s.locationRow}>
                <Ionicons name="location-outline" size={14} color={L.textMuted} />
                {profile.locationLabel && <Text style={s.locationText}>{profile.locationLabel}</Text>}
                {profile.locationLabel && profile.distanceMiles != null && <Text style={s.locationDot}>•</Text>}
                {profile.distanceMiles != null && <Text style={s.locationText}>{profile.distanceMiles} miles</Text>}
              </View>
            )}
          </View>
        </View>

        {/* ── Actions ── */}
        <View style={s.actions}>
          <TouchableOpacity style={s.btnMessage} activeOpacity={0.85} onPress={handleMessage} disabled={msgLoading}>
            {msgLoading
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Ionicons name="chatbubble-ellipses" size={18} color="#FFFFFF" />}
            <Text style={s.btnMessageText}>Message</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.btnInvite} activeOpacity={0.85}
            onPress={() => router.push({
              pathname: '/players/[id]/invite' as never,
              params: { id: profile.id, name: profile.firstName },
            } as never)}>
            <Ionicons name="person-add-outline" size={18} color={L.gold} />
            <Text style={s.btnInviteText}>Invite</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.iconBtn} activeOpacity={0.8} onPress={handleBookmark}>
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={saved ? L.gold : L.navy}
            />
          </TouchableOpacity>

          <TouchableOpacity style={s.iconBtn} activeOpacity={0.8} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color={L.navy} />
          </TouchableOpacity>
        </View>

        {/* ── Attribute card ── */}
        <View style={s.card}>
          <AttrCol icon="hand-right-outline" value={titleCase(profile.hand) || 'Not set'} label="Dominant Hand" />
          <AttrCol icon="scan-circle-outline" value={titleCase(profile.playStyle) || 'Not set'} label="Play Style" />
          <AttrCol icon="speedometer-outline" value={profile.skillLevel || 'Not set'} label="Skill Level" last />
        </View>

        {/* ── Stats card ── */}
        <View style={[s.card, { marginTop: 12 }]}>
          <StatCol number={String(profile.eventsPlayed)} line1="Events" line2="Played" />
          <StatCol number="—" line1="Medals" line2="Won" />
          <StatCol number={String(profile.partnersPlayed)} line1="Partners" line2="Played" />
          <StatCol number="—" line1="Reviews" last />
        </View>

        {activeTab === 'overview' && (
          <>
            {/* ── Looking For ── */}
            <View style={s.section}>
              <SectionLabel label="LOOKING FOR" />
              {profile.lookingStatus ? (
                <View style={s.lfRow}>
                  <LFChip icon="person-outline" line1={titleCase(profile.lookingStatus)} line2="Status" />
                </View>
              ) : (
                <Text style={s.placeholderInline}>Not set yet.</Text>
              )}
            </View>

            {/* ── About ── */}
            <View style={s.section}>
              <SectionLabel label={`ABOUT ${profile.firstName.toUpperCase()}`} />
              <Text style={s.aboutText}>
                {profile.bio || 'No bio yet.'}
              </Text>
            </View>

            {/* ── Recent Activity ── */}
            <View style={s.section}>
              <SectionLabel label="RECENT ACTIVITY" />
              {profile.activity.length > 0 ? (
                <View style={s.actCard}>
                  {profile.activity.map((item, i) => (
                    <ActivityRow
                      key={i}
                      icon={item.icon}
                      label={item.label}
                      sub={item.sub}
                      onPress={item.onPress}
                      last={i === profile.activity.length - 1}
                    />
                  ))}
                </View>
              ) : (
                <View style={s.placeholder}>
                  <Ionicons name="time-outline" size={36} color={L.textMuted} />
                  <Text style={s.placeholderText}>No recent activity yet.</Text>
                </View>
              )}
            </View>

            {/* ── Marketplace Trust ── */}
            <View style={s.section}>
              <SectionLabel label="MARKETPLACE" />
              <View style={s.placeholder}>
                <Ionicons name="storefront-outline" size={36} color={L.textMuted} />
                <Text style={s.placeholderText}>Marketplace features coming soon.</Text>
              </View>
            </View>
          </>
        )}

        {activeTab === 'events'      && <EventsTab />}
        {activeTab === 'marketplace' && <MarketplaceTab />}
      </ScrollView>

      {/* ── Tab bar (fixed) ── */}
      <View style={[s.tabBarWrap, { paddingBottom: insets.bottom }]}>
        <TabBar active={activeTab} onChange={setActiveTab} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: L.bg,
  },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBack: { color: L.navy, fontSize: 17, fontWeight: '400' },
  headerOverflow: { padding: 4 },

  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  // ── Hero ──
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 20 },

  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2.5, borderColor: L.goldBorder,
  },
  avatarBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: L.bg, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: L.goldBorder,
  },

  heroInfo: { flex: 1, paddingTop: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  playerName: { color: L.navy, fontSize: text.heroTitle.size, fontWeight: '800', letterSpacing: 0.2 },

  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: {
    backgroundColor: '#F3F0E8', borderRadius: shape.pill,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  chipText: { color: L.navy, fontSize: text.controlLabel.size, fontWeight: '700' },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationDot: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },
  locationText: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },

  // ── Actions ──
  actions: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  btnMessage: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 12, gap: 7,
  },
  btnMessageText: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800' },

  btnInvite: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: L.bg, borderRadius: shape.cta, paddingVertical: 12, gap: 7,
    borderWidth: 1.5, borderColor: L.goldBorder,
  },
  btnInviteText: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },

  iconBtn: {
    width: 48, height: 48, borderRadius: shape.cta,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Cards ──
  card: {
    flexDirection: 'row',
    backgroundColor: L.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border,
    overflow: 'hidden',
  },

  // Attribute col
  attrCol: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, paddingHorizontal: 4, gap: 4,
  },
  attrColBorder: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: L.div },
  attrValue: { color: L.navy, fontSize: text.chipValue.size, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  attrLabel: { color: L.textMuted, fontSize: 10, fontWeight: '500', textAlign: 'center' },

  // Stat col
  statCol: {
    flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4,
  },
  statColBorder: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: L.div },
  statNumber: { color: L.navy, fontSize: text.statNumber.size, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { color: L.textMuted, fontSize: 11, fontWeight: '500', textAlign: 'center' },

  // ── Sections ──
  section: { marginTop: 20 },
  sectionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  sectionLabel: {
    color: L.textMuted, fontSize: text.sectionLabel.size, fontWeight: '800',
    letterSpacing: text.sectionLabel.letterSpacing, textTransform: 'uppercase',
  },
  sectionAction: { color: L.gold, fontSize: text.rowTitle.size, fontWeight: '700' },

  // Looking For
  lfRow: { flexDirection: 'row', gap: 8 },
  lfChip: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: L.bg, borderRadius: shape.panel, borderWidth: 1, borderColor: L.border,
    paddingVertical: 12, gap: 6,
  },
  lfLine1: { color: L.navy, fontSize: text.chipValue.size, fontWeight: '800', textAlign: 'center' },
  lfLine2: { color: L.textMuted, fontSize: 11, fontWeight: '500', textAlign: 'center' },

  // About
  aboutText: {
    color: L.textSub, fontSize: text.body.size, fontWeight: '500', lineHeight: 22,
    backgroundColor: L.bg, borderRadius: shape.panel, borderWidth: 1, borderColor: L.border,
    padding: 14,
  },

  placeholderInline: { color: L.textMuted, fontSize: text.body.size, fontWeight: '500' },

  // Activity
  actCard: {
    backgroundColor: L.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border, overflow: 'hidden',
  },
  actRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  actIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  actLabel: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700', marginBottom: 2 },
  actSub: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },

  div: { height: StyleSheet.hairlineWidth, backgroundColor: L.div, marginLeft: 62 },

  // Placeholder tabs / sections
  placeholder: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 32, gap: 12,
    backgroundColor: L.bg, borderRadius: shape.panel, borderWidth: 1, borderColor: L.border,
  },
  placeholderText: { color: L.textMuted, fontSize: text.body.size, fontWeight: '500' },

  // ── Tab bar ──
  tabBarWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: L.bg, borderTopWidth: 1, borderTopColor: L.border,
  },
  tabBar: { flexDirection: 'row', height: 56 },
  tabItem: {
    flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  tabLabel: { color: L.textMuted, fontSize: text.controlLabel.size, fontWeight: '700' },
  tabLabelActive: { color: L.gold, fontWeight: '700' },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: 20, right: 20, height: 2.5,
    backgroundColor: L.gold, borderRadius: 2,
  },
});
