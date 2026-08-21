import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { MOCK_TOURNAMENTS } from '@/data/mock';
import type { Tournament } from '@/lib/tournamentTypes';
import { AppIcon, type AppIconName } from '@/components';
import { displayText } from '@/theme';

const { width } = Dimensions.get('window');

import { colors } from '@/theme';

// Theme-backed alias — brand values resolve from @/theme.
// navyMid / goldDark / pillActive are local gradient/pill accents — documented exception.
const L = {
  bg: colors.bg,
  page: colors.page,
  card: colors.bg,
  navy: colors.navy,
  navyMid: '#1A2D6B',
  gold: colors.gold,
  goldDark: '#9E7C2B',
  goldBg: colors.goldLight,
  text: colors.text,
  textSub: colors.textSub,
  textMuted: colors.textSub,
  border: colors.border,
  borderLight: colors.border,
  pillActive: '#0F1C40',
  pillBg: colors.bg,
};

const QUICK_ACTIONS = [
  { icon: 'person-add-outline', label: 'Create\nAccount' },
  { icon: 'trophy-outline', label: 'Find\nTournaments' },
  { icon: 'people-outline', label: 'Find\nPartners' },
  { icon: 'ribbon-outline', label: 'Host\nTournament' },
  { icon: 'pickleball', label: 'Community\nPlay' },
  { icon: 'school-outline', label: 'Learn\nto Play' },
];

const DATE_FILTERS = ['Next 7 days', 'Jun 18–24', 'Jun 25–Jul 1', 'Jul 2–Jul 8'];
const TYPE_FILTERS = ['All', 'Pro', 'Amateur', 'Community'];

const VENUE_COLORS = ['#1A3A6B', '#1A4A35', '#6B1A3A', '#3A1A6B', '#4A3A1A'];

function PickleballLogo() {
  return (
    <View style={logo.wrap}>
      <View style={logo.ball}>
        <View style={logo.hole1} />
        <View style={logo.hole2} />
        <View style={logo.hole3} />
        <View style={logo.line1} />
        <View style={logo.line2} />
        <View style={logo.line3} />
      </View>
    </View>
  );
}

const logo = StyleSheet.create({
  wrap: { alignItems: 'center', marginBottom: 2 },
  ball: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: L.gold, position: 'relative', overflow: 'visible',
  },
  hole1: {
    position: 'absolute', width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.55)', top: 8, left: 7,
  },
  hole2: {
    position: 'absolute', width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.55)', top: 8, right: 7,
  },
  hole3: {
    position: 'absolute', width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.55)', bottom: 8, left: 15,
  },
  line1: {
    position: 'absolute', width: 14, height: 2, borderRadius: 1,
    backgroundColor: L.gold, bottom: 10, right: -16, transform: [{ rotate: '-8deg' }],
  },
  line2: {
    position: 'absolute', width: 10, height: 2, borderRadius: 1,
    backgroundColor: L.gold, bottom: 5, right: -14, transform: [{ rotate: '-8deg' }],
  },
  line3: {
    position: 'absolute', width: 7, height: 2, borderRadius: 1,
    backgroundColor: L.gold, bottom: 0, right: -12, transform: [{ rotate: '-8deg' }],
  },
});

function StatusBadge({ status }: { status: Tournament['status'] }) {
  const map: Record<Tournament['status'], { label: string; bg: string; color: string }> = {
    draft:            { label: 'DRAFT',         bg: '#9CA3AF', color: '#FFFFFF' },
    pending_approval: { label: 'PENDING',        bg: '#F59E0B', color: '#FFFFFF' },
    open:             { label: 'OPEN',           bg: '#1A3A6B', color: '#FFFFFF' },
    filling_fast:     { label: 'FILLING FAST',   bg: L.gold,    color: L.navy },
    full:             { label: 'FULL',           bg: '#EF4444', color: '#FFFFFF' },
    upcoming:         { label: 'UPCOMING',       bg: '#6B7FA3', color: '#FFFFFF' },
    completed:        { label: 'COMPLETED',      bg: '#1A4D35', color: '#FFFFFF' },
    cancelled:        { label: 'CANCELLED',      bg: '#6B7280', color: '#FFFFFF' },
  };
  const s = map[status];
  return (
    <View style={[badge.wrap, { backgroundColor: s.bg }]}>
      <Text style={[badge.text, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  text: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
});

function TournamentRow({ t, index }: { t: Tournament; index: number }) {
  const vColor = VENUE_COLORS[index % VENUE_COLORS.length];
  const fee = t.entryFeeCents > 0 ? `$${(t.entryFeeCents / 100).toFixed(0)} entry` : 'Free';
  return (
    <TouchableOpacity
      style={row.wrap}
      onPress={() => router.push(`/tournament/${t.id}` as never)}
      activeOpacity={0.9}
    >
      <View style={[row.thumb, { backgroundColor: vColor }]}>
        <Ionicons name="trophy-outline" size={22} color="rgba(255,255,255,0.3)" />
        <View style={row.badgeOverlay}>
          <StatusBadge status={t.status} />
        </View>
      </View>
      <View style={row.info}>
        <Text style={row.time}>{t.date}</Text>
        <Text style={row.name} numberOfLines={1}>{t.name}</Text>
        <View style={row.venueRow}>
          <Ionicons name="location-outline" size={11} color={L.gold} />
          <Text style={row.venue} numberOfLines={1}>{t.venue}</Text>
        </View>
        <View style={row.metaRow}>
          <Ionicons name="speedometer-outline" size={11} color={L.textMuted} />
          <Text style={row.meta}>{t.skillMin}–{t.skillMax}</Text>
          <View style={row.dot} />
          <Ionicons name="people-outline" size={11} color={L.textMuted} />
          <Text style={row.meta}>{t.spotsFilled} / {t.drawSize}</Text>
          <View style={row.dot} />
          <Text style={row.meta}>{fee}</Text>
        </View>
      </View>
      {t.status === 'full' && (
        <Ionicons name="lock-closed" size={18} color="#EF4444" style={{ alignSelf: 'center' }} />
      )}
    </TouchableOpacity>
  );
}

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row', gap: 12, marginBottom: 12,
    backgroundColor: L.card, borderRadius: 14,
    borderWidth: 1, borderColor: L.border, padding: 10, alignItems: 'flex-start',
  },
  thumb: {
    width: 90, height: 80, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
  },
  badgeOverlay: { position: 'absolute', bottom: 6, left: 6 },
  info: { flex: 1, gap: 3 },
  time: { color: L.textSub, fontSize: 11, fontWeight: '600' },
  name: { ...displayText(17, { color: L.text }) },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  venue: { color: L.textSub, fontSize: 12, fontWeight: '500', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  meta: { color: L.textMuted, fontSize: 11, fontWeight: '600' },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: L.border },
});

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const [dateFilter, setDateFilter] = useState('Next 7 days');
  const [typeFilter, setTypeFilter] = useState('All');

  const filtered = MOCK_TOURNAMENTS.filter((t) => {
    if (typeFilter === 'Pro') return t.skillMin >= 4.0;
    if (typeFilter === 'Amateur') return t.skillMax <= 4.0;
    return true;
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/account-settings' as never)}
          >
            <Ionicons name="person-circle-outline" size={28} color={L.navy} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, styles.addBtn]}>
            <Ionicons name="add" size={20} color={L.gold} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoCenter}>
          <PickleballLogo />
          <Text style={styles.logoText}>
            pickleball<Text style={styles.logoPB}>app</Text>
          </Text>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/invites' as never)}
          >
            <Ionicons name="mail-outline" size={24} color={L.navy} />
            <View style={styles.badge}><Text style={styles.badgeText}>1</Text></View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/(tabs)/chat' as never)}
          >
            <Ionicons name="chatbubble-outline" size={23} color={L.navy} />
            <View style={styles.badge}><Text style={styles.badgeText}>2</Text></View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
        >
          {QUICK_ACTIONS.map((qa) => (
            <TouchableOpacity key={qa.label} style={styles.qaCard} activeOpacity={0.8}>
              <View style={styles.qaIconBox}>
                <AppIcon name={qa.icon as AppIconName} size={26} color={L.navy} />
              </View>
              <Text style={styles.qaLabel}>{qa.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Invitations preview ── */}
        <TouchableOpacity
          style={styles.inboxCard}
          onPress={() => router.push('/invites' as never)}
          activeOpacity={0.85}
        >
          <View style={styles.inboxIconWrap}>
            <Ionicons name="mail-outline" size={20} color={L.gold} />
            <View style={styles.inboxBadge}><Text style={styles.inboxBadgeText}>1</Text></View>
          </View>
          <View style={styles.inboxBody}>
            <Text style={styles.inboxTitle}>John D. invited you to play</Text>
            <Text style={styles.inboxSub}>Community Play · Red Bug Lake Park · May 24</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
        </TouchableOpacity>

        {/* ── Messages preview ── */}
        <TouchableOpacity
          style={[styles.inboxCard, { marginTop: -4 }]}
          onPress={() => router.push('/(tabs)/chat' as never)}
          activeOpacity={0.85}
        >
          <View style={[styles.inboxIconWrap, { backgroundColor: 'rgba(10,18,40,0.07)', borderColor: 'rgba(10,18,40,0.15)' }]}>
            <Ionicons name="chatbubble-outline" size={20} color={L.navy} />
            <View style={[styles.inboxBadge, { backgroundColor: L.navy }]}><Text style={styles.inboxBadgeText}>2</Text></View>
          </View>
          <View style={styles.inboxBody}>
            <Text style={styles.inboxTitle}>2 unread messages</Text>
            <Text style={styles.inboxSub}>Sarah M., Mark D.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
        </TouchableOpacity>

        <View style={styles.joinBanner}>
          <View style={styles.joinBallArea}>
            <View style={styles.joinBallOuter}>
              <View style={styles.joinBall}>
                <View style={styles.joinHole1} />
                <View style={styles.joinHole2} />
                <View style={styles.joinHole3} />
                <View style={styles.joinHole4} />
              </View>
              <View style={styles.joinLine1} />
              <View style={styles.joinLine2} />
              <View style={styles.joinLine3} />
            </View>
          </View>
          <View style={styles.joinContent}>
            <Text style={styles.joinTitle}>
              Join pickleball<Text style={styles.joinPB}>app</Text>!
            </Text>
            <Text style={styles.joinSub}>
              Become part of the fastest growing pickleball tournament circuit.
            </Text>
            <TouchableOpacity style={styles.joinBtn} activeOpacity={0.85}>
              <Text style={styles.joinBtnText}>Create Account</Text>
              <View style={styles.joinArrow}>
                <Ionicons name="arrow-forward" size={14} color={L.gold} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Find Tournaments</Text>
            <TouchableOpacity style={styles.customizeRow}>
              <Text style={styles.customizeText}>Customize</Text>
              <Ionicons name="filter-outline" size={16} color={L.gold} />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {DATE_FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.pill, dateFilter === f && styles.pillActive]}
                onPress={() => setDateFilter(f)}
              >
                <Text style={[styles.pillText, dateFilter === f && styles.pillTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {TYPE_FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.pill, typeFilter === f && styles.pillActive]}
                onPress={() => setTypeFilter(f)}
              >
                <Text style={[styles.pillText, typeFilter === f && styles.pillTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            <TouchableOpacity>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {filtered.slice(0, 4).map((t, i) => (
            <TournamentRow key={t.id} t={t} index={i} />
          ))}

          {filtered.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="trophy-outline" size={32} color={L.textMuted} />
              <Text style={styles.emptyText}>No tournaments match this filter</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: L.bg, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: L.borderLight,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 72 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 72, justifyContent: 'flex-end' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: L.gold },
  logoCenter: { alignItems: 'center', flex: 1 },
  // Matches the brand wordmark in assets/images/logo-header.png: lowercase,
  // navy "pickleball" + gold "app", set tight. Not letter-spaced — the old
  // uppercase treatment belonged to the previous mark.
  logoText: { color: L.navy, fontSize: 17, fontWeight: '900', letterSpacing: -0.2, marginTop: 2 },
  logoPB: { color: L.gold },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 16 },
  quickRow: { paddingHorizontal: 16, gap: 10, paddingBottom: 16 },
  qaCard: { alignItems: 'center', width: 76 },
  qaIconBox: {
    width: 64, height: 64, borderRadius: 18, backgroundColor: L.card,
    borderWidth: 1, borderColor: L.border, alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  qaLabel: { color: L.text, fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 14 },
  joinBanner: {
    marginHorizontal: 16, marginBottom: 20, backgroundColor: L.card,
    borderRadius: 18, borderWidth: 1, borderColor: L.border,
    flexDirection: 'row', padding: 16, alignItems: 'center', gap: 12, overflow: 'hidden',
  },
  joinBallArea: { width: 80, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  joinBallOuter: { position: 'relative', width: 64, height: 64 },
  joinBall: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: L.gold,
    position: 'absolute', left: 0, top: 0, overflow: 'hidden',
  },
  joinHole1: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)', top: 12, left: 10 },
  joinHole2: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)', top: 12, right: 10 },
  joinHole3: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)', bottom: 10, left: 24 },
  joinHole4: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)', top: 30, left: 22 },
  joinLine1: { position: 'absolute', width: 18, height: 3, borderRadius: 2, backgroundColor: L.gold, right: -14, bottom: 22, transform: [{ rotate: '-12deg' }] },
  joinLine2: { position: 'absolute', width: 14, height: 3, borderRadius: 2, backgroundColor: L.gold, right: -12, bottom: 14, transform: [{ rotate: '-12deg' }] },
  joinLine3: { position: 'absolute', width: 10, height: 3, borderRadius: 2, backgroundColor: L.gold, right: -10, bottom: 6, transform: [{ rotate: '-12deg' }] },
  joinContent: { flex: 1, gap: 6 },
  joinTitle: { color: L.text, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  joinPB: { color: L.gold },
  joinSub: { color: L.textSub, fontSize: 12, fontWeight: '500', lineHeight: 17 },
  joinBtn: {
    backgroundColor: L.gold, borderRadius: 24, paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4,
  },
  joinBtnText: { color: L.bg, fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  joinArrow: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
  section: { marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 12,
  },
  sectionTitle: { color: L.text, fontSize: 20, fontWeight: '900', letterSpacing: 0.2 },
  customizeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  customizeText: { color: L.gold, fontSize: 13, fontWeight: '700' },
  seeAll: { color: L.gold, fontSize: 13, fontWeight: '700' },
  filterRow: { paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 24,
    backgroundColor: L.pillBg, borderWidth: 1, borderColor: L.border,
  },
  pillActive: { backgroundColor: L.pillActive, borderColor: L.pillActive },
  pillText: { color: L.text, fontSize: 13, fontWeight: '600' },
  pillTextActive: { color: '#FFFFFF' },
  emptyState: { alignItems: 'center', padding: 32, gap: 8 },
  emptyText: { color: L.textMuted, fontSize: 13, fontWeight: '500' },
  inboxCard: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: L.card, borderRadius: 14,
    borderWidth: 1, borderColor: L.border,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  inboxIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(201,168,76,0.10)',
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.35)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, position: 'relative',
  },
  inboxBadge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: L.gold, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: L.bg,
  },
  inboxBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', lineHeight: 12 },
  inboxBody: { flex: 1, gap: 3 },
  inboxTitle: { color: L.text, fontSize: 14, fontWeight: '700' },
  inboxSub:   { color: L.textMuted, fontSize: 12, fontWeight: '400' },
  badge: {
    position: 'absolute', top: 2, right: 2,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: L.gold, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: L.bg,
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', lineHeight: 12 },
});
