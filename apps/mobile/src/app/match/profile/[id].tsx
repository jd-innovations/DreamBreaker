import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, Alert, ActivityIndicator, Pressable, Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { PressableCTA } from '@/components';
import { ContextMenu, useContextMenu, type MenuItem } from '@/components/ContextMenu';
import { formatPlayerRating } from '@/lib/playerRating';
import { colors } from '@/theme';
import { EmptyState } from '@/components/states/ScreenState';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, space, text } from '@shared/tokens';
import { supabase } from '@/lib/supabase';
import { getOrCreateConversation } from '@/lib/conversationService';
import { openPhotoViewer } from '@/lib/photoViewer';
import { fetchPublicSellerListings } from '@/lib/marketplace/listingService';
import { formatPriceCents } from '@/lib/marketplace/constants';
import { formatMiles } from '@shared/geo';
import {
  buildPublicProfile, PUBLIC_PROFILE_SELECT,
  type PublicProfile, type ProfileRelationship, type PublicProfileRow, type ProfileViewer,
} from '@shared/public-profile';
import { useSupportContext } from '@/lib/support/supportContext';
import { ReportUserSheet } from '@/components/safety/ReportUserSheet';

/**
 * The public player profile — the ONE of them.
 *
 * Consolidated 2026-09-21 (PROFILE_CONSOLIDATION_PLAN.md). This screen holds
 * the connect and safety flows, which were the expensive half to reimplement,
 * and it already had most of the inbound links; it takes players/[id]'s layout,
 * which is the half people preferred. What a profile CONTAINS is decided in
 * @shared/public-profile so web cannot drift from it again.
 */

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold, goldBg: colors.goldBg, goldBorder: colors.goldBorder,
  text: colors.text, textSub: colors.textSub, border: colors.border,
  success: colors.success, white: colors.white,
};

type Tab = 'overview' | 'events' | 'marketplace';

/** Minimum tappable edge. A hit target, not a spacing role. */
const TOUCH_TARGET = 46;
/** Avatar diameter, and its radius. A size, not a spacing role. */
const AVATAR = 96;

function SectionLabel({ label }: { label: string }) {
  return <Text style={s.sectionLabel}>{label}</Text>;
}

export default function PartnerProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading]       = useState(true);
  const [profile, setProfile]       = useState<PublicProfile | null>(null);
  const [myId, setMyId]             = useState<string | null>(null);
  const [connected, setConnected]   = useState(false);
  const [pending, setPending]       = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [tab, setTab]               = useState<Tab>('overview');

  useSupportContext({ feature: 'partner_finder', entityType: 'player_profile', entityId: id, entityLabel: profile?.name });
  const [msgLoading, setMsgLoading] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const overflow = useContextMenu();
  const isSelf = !!myId && myId === id;

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? null;

      const [
        { data: row }, { count: connectionCount }, myLikes, { data: me },
        { data: regRows }, { data: playRows }, { data: groupRows },
        listings, { data: reviewRow }, { data: settingRows },
      ] = await Promise.all([
        supabase.from('profiles').select(PUBLIC_PROFILE_SELECT).eq('id', id).single(),
        supabase.from('partner_matches').select('*', { count: 'exact', head: true })
          .or(`user_a.eq.${id},user_b.eq.${id}`),
        uid
          ? supabase.from('partner_likes').select('kind').eq('from_user_id', uid).eq('to_user_id', id)
          : Promise.resolve({ data: [] as { kind: string }[] }),
        uid
          ? supabase.from('profiles')
              .select('id, dupr, availability_schedule, location_lat, location_lng')
              .eq('id', uid).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('registrations')
          .select('tournament_id, tournaments(name, event_date)')
          .or(`player_id.eq.${id},partner_id.eq.${id}`).limit(20),
        supabase.from('play_participants')
          .select('event_id, play_events(name, event_date)')
          .eq('claimed_by', id).limit(20),
        supabase.from('group_members').select('role, groups(name)')
          .eq('user_id', id).eq('status', 'active').limit(20),
        // Active only: fetchListings({ sellerId }) returns every status for
        // "My Listings", which here would publish a stranger's drafts.
        fetchPublicSellerListings(id, 6).catch(() => []),
        supabase.from('v_review_summary')
          .select('average_rating, review_count')
          .eq('subject_type', 'player').eq('subject_id', id).maybeSingle(),
        // The gate is a product decision, not a missing feature: kept off
        // "until enough transactions exist for an average to mean anything".
        supabase.from('platform_settings').select('key, value')
          .in('key', ['reviews_display_enabled', 'reviews_display_min_count']),
      ]);

      if (cancelled) return;
      if (!row) { setLoading(false); return; }

      const likes = (myLikes.data ?? []) as { kind: string }[];
      const isBookmarked = likes.some((l) => l.kind === 'save');
      const hasLiked = likes.some((l) => l.kind === 'like');

      let isConnected = false;
      if (uid && uid !== id) {
        const { data: match } = await supabase
          .from('partner_matches').select('id')
          .or(`and(user_a.eq.${uid},user_b.eq.${id}),and(user_a.eq.${id},user_b.eq.${uid})`)
          .maybeSingle();
        isConnected = !!match;
      }
      if (cancelled) return;

      const { data: ageValue } = await supabase.rpc('profile_age', { p_user_id: id });
      if (cancelled) return;

      const relationship: ProfileRelationship =
        uid === id ? 'self' : isConnected ? 'connected' : hasLiked ? 'pending' : 'none';

      const settings = Object.fromEntries((settingRows ?? []).map((r) => [r.key, r.value]));

      const activity = [
        ...(regRows ?? []).flatMap((r) => {
          const t = (r as { tournaments?: { name: string; event_date: string } | null }).tournaments;
          return t ? [{ name: t.name, date: t.event_date, kind: 'tournament' as const }] : [];
        }),
        ...(playRows ?? []).flatMap((r) => {
          const e = (r as { play_events?: { name: string; event_date: string } | null }).play_events;
          return e ? [{ name: e.name, date: e.event_date, kind: 'community' as const }] : [];
        }),
      ];

      setMyId(uid);
      setBookmarked(isBookmarked);
      setPending(hasLiked && !isConnected);
      setConnected(isConnected);
      setProfile(buildPublicProfile({
        row: row as unknown as PublicProfileRow,
        viewer: (me ?? null) as ProfileViewer,
        relationship,
        age: typeof ageValue === 'number' ? ageValue : null,
        connectionCount: connectionCount ?? 0,
        // Every registration and claimed participation IS an event played.
        eventsPlayed: activity.length,
        partnersPlayed: connectionCount ?? 0,
        activity,
        groups: (groupRows ?? []).flatMap((r) => {
          const g = r as { role: string | null; groups?: { name: string } | null };
          return g.groups ? [{ name: g.groups.name, role: g.role ?? 'member' }] : [];
        }),
        listings: (listings ?? []).map((l) => ({
          id: l.id, title: l.title, priceCents: l.asking_price_cents, photo: l.primaryPhotoUrl,
        })),
        reviews: {
          displayEnabled: settings.reviews_display_enabled === 'true',
          minCount: Number.parseInt(settings.reviews_display_min_count ?? '3', 10) || 3,
          averageRating: reviewRow?.average_rating != null ? Number(reviewRow.average_rating) : null,
          reviewCount: reviewRow?.review_count ?? 0,
        },
      }));
      setLoading(false);
    }

    load().catch(() => { if (!cancelled) setLoading(false); });
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
        .from('partner_matches').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
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

  async function handleMessage() {
    if (!id || msgLoading) return;
    setMsgLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Sign in required', 'Please sign in to send messages.'); return; }
      if (user.id === id) return;
      const convId = await getOrCreateConversation(user.id, id);
      router.push(`/conversation/${convId}` as never);
    } catch (e: unknown) {
      Alert.alert('Could not open chat', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setMsgLoading(false);
    }
  }

  // The "…" was a TouchableOpacity with no onPress at all. Share lives here
  // rather than in the action bar so it is not offered in two places.
  const menuItems: MenuItem[] = [
    { icon: 'share-outline', label: 'Share Profile' },
    ...(isSelf ? [] : [
      { icon: 'flag-outline', label: 'Report', danger: true } as MenuItem,
    ]),
  ];

  function handleMenu(label: string) {
    overflow.close(() => {
      if (label === 'Share Profile' && profile) {
        // shareEntity has no 'player' type — profiles are not a shareable
        // entity with an Open Graph page yet, so this opens the OS sheet with
        // the profile's app link rather than inventing a share card.
        void Share.share({ message: `${profile.name} on Pickleball App` });
      } else if (label === 'Report') {
        setReportOpen(true);
      }
    });
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

  const distanceLabel = formatMiles(profile.distanceMi);
  const initials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase()).join('') || '?';

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      {/* Safe-area inset on the HEADER, not the root, so the white header
          colour runs to the top of the screen. On the root, the status-bar
          strip takes the root's page grey and the header reads as a band
          floating below it. Pattern and rationale from wallet.tsx. */}
      <View style={[s.header, { paddingTop: insets.top + space.gap }]}>
        <TouchableOpacity style={s.headerBack} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
          <Text style={s.headerBackText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.headerOverflow}
          activeOpacity={0.7}
          onPress={() => overflow.present(menuItems, handleMenu)}
          accessibilityRole="button"
          accessibilityLabel="More actions"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={L.navy} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {/* ── Hero ── */}
        <View style={s.hero}>
          <Pressable
            onPress={() => profile.avatarUrl && openPhotoViewer([profile.avatarUrl], 0, profile.name)}
            disabled={!profile.avatarUrl}
            accessibilityRole="imagebutton"
            accessibilityLabel={`View ${profile.name}'s photo full screen`}
          >
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarEmpty]}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </View>
            )}
          </Pressable>

          <View style={s.heroInfo}>
            <View style={s.heroNameRow}>
              <Text style={s.heroName} numberOfLines={2}>{profile.name}</Text>
              {profile.duprVerified && (
                <Ionicons name="shield-checkmark" size={17} color={L.gold} />
              )}
            </View>

            <View style={s.heroChips}>
              {profile.ratingSource !== 'none' && (
                <View style={[s.heroChip, s.heroChipRating]}>
                  <Ionicons name="speedometer-outline" size={12} color={L.navy} />
                  <Text style={s.heroChipText}>
                    {formatPlayerRating({ value: profile.ratingValue, source: profile.ratingSource })}
                  </Text>
                </View>
              )}
              {!!profile.skillBand && <View style={s.heroChip}><Text style={s.heroChipText}>{profile.skillBand}</Text></View>}
              {!!profile.playStyle && <View style={s.heroChip}><Text style={s.heroChipText}>{profile.playStyle}</Text></View>}
            </View>

            {(!!profile.location || !!distanceLabel) && (
              <View style={s.heroMeta}>
                <Ionicons name="location-outline" size={13} color={L.textSub} />
                <Text style={s.heroMetaText} numberOfLines={1}>
                  {profile.location}
                  {distanceLabel ? ` · ` : ''}
                </Text>
                {!!distanceLabel && <Text style={s.heroDistance}>{distanceLabel}</Text>}
              </View>
            )}
          </View>
        </View>

        {/* ── Actions. Message · Connect · Invite side by side; Share is in "…" ── */}
        {!isSelf && (
          <View style={s.actions}>
            <TouchableOpacity style={s.actionPrimary} onPress={handleMessage} disabled={msgLoading} activeOpacity={0.85}>
              {msgLoading
                ? <ActivityIndicator size="small" color={L.white} />
                : <Text style={s.actionPrimaryText}>Message</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.actionSecondary, connected && s.actionDone]}
              onPress={handleConnect}
              disabled={connectLoading}
              activeOpacity={0.85}
            >
              {connectLoading
                ? <ActivityIndicator size="small" color={L.navy} />
                : <Text style={s.actionSecondaryText}>{connected ? 'Connected' : pending ? 'Pending' : 'Connect'}</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.actionGhost}
              onPress={() => router.push(`/players/${id}/invite` as never)}
              activeOpacity={0.85}
            >
              <Text style={s.actionGhostText}>Invite</Text>
            </TouchableOpacity>

            <PressableCTA
              style={s.actionIcon}
              onPress={handleBookmark}
              hapticType="light"
              pulseOn={bookmarked}
              accessibilityLabel={bookmarked ? 'Remove from contacts' : 'Save to contacts'}
            >
              <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={19} color={bookmarked ? L.gold : L.navy} />
            </PressableCTA>
          </View>
        )}

        {/* ── Attributes ── */}
        {(!!profile.hand || !!profile.playStyle || !!profile.skillBand) && (
          <View style={s.gridCard}>
            {!!profile.hand && <AttrCol value={profile.hand} label="Dominant Hand" />}
            {!!profile.playStyle && <AttrCol value={profile.playStyle} label="Play Style" />}
            {!!profile.skillBand && <AttrCol value={profile.skillBand} label="Skill Level" last />}
          </View>
        )}

        {/* ── Stats. Every cell earns its place — see buildPublicProfile. ── */}
        {profile.stats.length > 0 && (
          <View style={s.gridCard}>
            {profile.stats.map((stat, i) => (
              <View key={stat.key} style={[s.statCol, i < profile.stats.length - 1 && s.colBorder]}>
                <Text style={s.statValue}>{stat.value}</Text>
                <Text style={s.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Tabs ── */}
        <View style={s.tabs}>
          {([['overview', 'Overview'], ['events', 'Events'], ['marketplace', 'Marketplace']] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[s.tab, tab === key && s.tabActive]}
              onPress={() => setTab(key)}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={[s.tabText, tab === key && s.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'overview' && (
          <>
            {!!profile.availabilityLabel && (
              <View style={s.section}>
                <SectionLabel label={profile.availabilityIsShared ? 'WHEN YOU BOTH PLAY' : 'AVAILABILITY'} />
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
              </View>
            )}

            {!!profile.lookingFor && (
              <View style={s.section}>
                <SectionLabel label="LOOKING FOR" />
                <View style={[s.card, s.cardCentered]}>
                  <Text style={s.lookingValue}>{profile.lookingFor}</Text>
                  <Text style={s.lookingLabel}>Status</Text>
                </View>
              </View>
            )}

            {(!!profile.homeCourt || profile.formats.length > 0 || !!profile.intensity || !!profile.gender) && (
              <View style={s.section}>
                <SectionLabel label="PLAYS" />
                <View style={s.card}>
                  {!!profile.homeCourt && (
                    // A real directory entry, not a dead string: facilities are
                    // a first-class screen and this is the one place a player's
                    // home court gets named.
                    <TouchableOpacity
                      style={s.infoRow}
                      activeOpacity={profile.homeCourtId ? 0.7 : 1}
                      disabled={!profile.homeCourtId}
                      onPress={() => router.push(`/facility/${profile.homeCourtId}` as never)}
                      accessibilityRole={profile.homeCourtId ? 'link' : undefined}
                      accessibilityLabel={profile.homeCourtId ? `Home court ${profile.homeCourt}, open facility` : undefined}
                    >
                      <Ionicons name="location-outline" size={16} color={L.gold} />
                      <Text style={s.infoText}>Home court: {profile.homeCourt}</Text>
                      {!!profile.homeCourtId && (
                        <Ionicons name="chevron-forward" size={15} color={L.textSub} />
                      )}
                    </TouchableOpacity>
                  )}
                  {(profile.formats.length > 0 || !!profile.intensity || !!profile.gender) && (
                    <View style={s.chipWrap}>
                      {profile.formats.map((f) => (
                        <View key={f} style={s.chip}><Text style={s.chipText}>{f}</Text></View>
                      ))}
                      {!!profile.intensity && <View style={s.chip}><Text style={s.chipText}>{profile.intensity}</Text></View>}
                      {!!profile.gender && <View style={s.chip}><Text style={s.chipText}>{profile.gender}</Text></View>}
                    </View>
                  )}
                </View>
              </View>
            )}

            {!!profile.bio && (
              <View style={s.section}>
                <SectionLabel label={`ABOUT ${profile.name.split(' ')[0].toUpperCase()}`} />
                <View style={s.card}><Text style={s.bioText}>{profile.bio}</Text></View>
              </View>
            )}

            {profile.groups.length > 0 && (
              <View style={s.section}>
                <SectionLabel label="GROUPS" />
                <View style={s.card}>
                  {profile.groups.map((g, i) => (
                    <View key={g.name} style={[s.listRow, i > 0 && s.listRowBorder]}>
                      <Ionicons name="people-outline" size={16} color={L.textSub} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowTitle}>{g.name}</Text>
                        <Text style={s.rowMeta}>{g.role}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {tab === 'events' && (
          <View style={s.section}>
            <SectionLabel label="RECENT ACTIVITY" />
            {profile.activity.length > 0 ? (
              <View style={s.card}>
                {profile.activity.map((a, i) => (
                  <View key={`${a.name}-${a.date}`} style={[s.listRow, i > 0 && s.listRowBorder]}>
                    <Ionicons
                      name={a.kind === 'tournament' ? 'trophy-outline' : 'people-circle-outline'}
                      size={16}
                      color={L.gold}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle}>{a.name}</Text>
                      <Text style={s.rowMeta}>
                        {a.kind === 'tournament' ? 'Tournament' : 'Community Play'} · {a.date}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={[s.card, s.cardCentered]}>
                <Text style={s.emptyText}>No events yet.</Text>
              </View>
            )}
          </View>
        )}

        {tab === 'marketplace' && (
          <View style={s.section}>
            <SectionLabel label="LISTINGS" />
            {profile.listings.length > 0 ? (
              <View style={s.listingGrid}>
                {profile.listings.map((l) => (
                  <TouchableOpacity
                    key={l.id}
                    style={s.listingCard}
                    activeOpacity={0.85}
                    onPress={() => router.push(`/marketplace/${l.id}` as never)}
                    accessibilityRole="button"
                    accessibilityLabel={`${l.title}, ${formatPriceCents(l.priceCents)}`}
                  >
                    {l.photo ? (
                      <Image source={{ uri: l.photo }} style={s.listingPhoto} resizeMode="cover" />
                    ) : (
                      <View style={[s.listingPhoto, s.listingPhotoEmpty]}>
                        <Ionicons name="pricetag-outline" size={22} color={L.textSub} />
                      </View>
                    )}
                    <Text style={s.listingTitle} numberOfLines={1}>{l.title}</Text>
                    <Text style={s.listingPrice}>{formatPriceCents(l.priceCents)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={[s.card, s.cardCentered]}>
                <Text style={s.emptyText}>Nothing listed right now.</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Android only; on iOS present() shows the system action sheet. */}
      {overflow.visible && (
        <ContextMenu
          items={menuItems}
          top={insets.top + 56}
          right={16}
          opacity={overflow.opacity}
          scale={overflow.scale}
          onItemPress={handleMenu}
        />
      )}

      {myId && myId !== id ? (
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

function AttrCol({ value, label, last }: { value: string; label: string; last?: boolean }) {
  return (
    <View style={[s.statCol, !last && s.colBorder]}>
      <Text style={s.attrValue} numberOfLines={1}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.gap, paddingBottom: space.gap, backgroundColor: L.bg,
    borderBottomWidth: 1, borderBottomColor: L.border,
  },
  headerBack: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: space.gapTight },
  headerBackText: { color: L.navy, fontSize: text.body.size, fontWeight: text.body.weight },
  headerOverflow: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, alignItems: 'flex-end', justifyContent: 'center' },

  hero: { flexDirection: 'row', gap: space.sectionBottom, alignItems: 'flex-start', paddingHorizontal: space.gutter, paddingTop: space.gutter },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, borderWidth: 2, borderColor: L.goldBorder },
  avatarEmpty: { backgroundColor: L.page, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: L.textSub, fontSize: text.heroTitle.size, fontWeight: '700' },
  heroInfo: { flex: 1, gap: 6, paddingTop: space.gapTight / 2 },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroName: {
    color: L.navy, fontSize: text.heroTitle.size, fontWeight: text.heroTitle.weight,
    lineHeight: text.heroTitle.lineHeight, flexShrink: 1,
  },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroChip: {
    borderRadius: shape.pill, paddingHorizontal: space.gapTight + 2, paddingVertical: 4,
    backgroundColor: L.goldBg,
  },
  heroChipRating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroChipText: { color: L.navy, fontSize: text.controlLabel.size, fontWeight: text.controlLabel.weight },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroMetaText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', flexShrink: 1 },
  heroDistance: { color: L.navy, fontSize: text.caption.size, fontWeight: '700' },

  actions: { flexDirection: 'row', gap: space.gapTight, paddingHorizontal: space.gutter, paddingTop: space.sectionBottom },
  actionPrimary: {
    flex: 1, minHeight: TOUCH_TARGET, borderRadius: shape.cta, backgroundColor: L.navy,
    alignItems: 'center', justifyContent: 'center',
  },
  actionPrimaryText: { color: L.white, fontSize: text.action.size, fontWeight: '800' },
  actionSecondary: {
    flex: 1, minHeight: TOUCH_TARGET, borderRadius: shape.cta, backgroundColor: L.bg,
    borderWidth: 1.5, borderColor: L.goldBorder, alignItems: 'center', justifyContent: 'center',
  },
  actionDone: { borderColor: L.success },
  actionSecondaryText: { color: L.navy, fontSize: text.action.size, fontWeight: '800' },
  actionGhost: {
    flex: 1, minHeight: TOUCH_TARGET, borderRadius: shape.cta, backgroundColor: L.bg,
    borderWidth: 1.5, borderColor: L.border, alignItems: 'center', justifyContent: 'center',
  },
  actionGhostText: { color: L.navy, fontSize: text.action.size, fontWeight: '800' },
  actionIcon: {
    width: TOUCH_TARGET, minHeight: TOUCH_TARGET, borderRadius: shape.cta, backgroundColor: L.bg,
    borderWidth: 1.5, borderColor: L.border, alignItems: 'center', justifyContent: 'center',
  },

  gridCard: {
    flexDirection: 'row', marginHorizontal: space.gutter, marginTop: space.gap,
    backgroundColor: L.bg, borderRadius: shape.card, borderWidth: 1, borderColor: L.border,
  },
  statCol: { flex: 1, paddingVertical: space.sectionBottom, paddingHorizontal: 6, alignItems: 'center' },
  colBorder: { borderRightWidth: 1, borderRightColor: L.border },
  attrValue: { color: L.navy, fontSize: text.rowValue.size, fontWeight: text.rowValue.weight },
  // statValueSm is the named role for exactly this: "a stat value smaller
  // than statNumber -- a profile stat, a rating".
  statValue: { color: L.navy, fontSize: text.statValueSm.size, fontWeight: text.statValueSm.weight },
  statLabel: {
    color: L.textSub, fontSize: text.caption.size, fontWeight: text.caption.weight,
    marginTop: 2, textAlign: 'center',
  },

  tabs: {
    flexDirection: 'row', gap: space.sectionTop - 4, marginHorizontal: space.gutter, marginTop: space.gutter,
    borderBottomWidth: 1, borderBottomColor: L.border,
  },
  tab: { paddingVertical: space.gapTight + 2, paddingHorizontal: 2, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: L.gold },
  tabText: { color: L.textSub, fontSize: text.rowTitle.size, fontWeight: '600' },
  tabTextActive: { color: L.navy, fontWeight: '800' },

  section: { paddingHorizontal: space.gutter, paddingTop: space.gutter },
  sectionLabel: {
    color: L.textSub, fontSize: text.cardLabel.size, fontWeight: '800',
    letterSpacing: text.cardLabel.letterSpacing, marginBottom: space.gapTight,
  },
  card: { backgroundColor: L.bg, borderRadius: shape.card, borderWidth: 1, borderColor: L.border, overflow: 'hidden' },
  cardCentered: { alignItems: 'center', paddingVertical: space.sectionTop - 2 },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.gapTight,
    paddingHorizontal: space.gutter, paddingVertical: space.gapTight + 2,
  },
  infoText: { color: L.text, fontSize: text.rowTitle.size, fontWeight: text.rowTitle.weight, flex: 1, lineHeight: 20 },

  chipWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: space.gutter, paddingBottom: space.gap,
  },
  chip: {
    borderRadius: shape.pill, paddingHorizontal: space.gapTight + 2, paddingVertical: 5,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.border,
  },
  chipText: { color: L.navy, fontSize: text.controlLabel.size, fontWeight: text.controlLabel.weight },

  lookingValue: { color: L.navy, fontSize: text.titleSm.size, fontWeight: text.titleSm.weight },
  lookingLabel: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },

  bioText: {
    color: L.text, fontSize: text.body.size, fontWeight: '500', lineHeight: 21,
    padding: space.gutter,
  },

  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.gap,
    paddingHorizontal: space.gutter, paddingVertical: space.sectionBottom,
  },
  listRowBorder: { borderTopWidth: 1, borderTopColor: L.border },
  rowTitle: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: text.rowTitle.weight },
  rowMeta: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
  emptyText: { color: L.textSub, fontSize: text.body.size, fontWeight: '500' },

  listingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gap },
  listingCard: { width: '47%' },
  listingPhoto: {
    width: '100%', height: 110, borderRadius: shape.panel,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
  },
  listingPhotoEmpty: { alignItems: 'center', justifyContent: 'center' },
  listingTitle: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: text.rowTitle.weight, marginTop: 6 },
  listingPrice: { color: L.gold, fontSize: text.chipValue.size, fontWeight: text.chipValue.weight, marginTop: 2 },
});
