import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { useOnboarding } from '@/lib/onboarding/state';
import { AppIcon, type AppIconName } from '@/components';

const L = colors;
const LOGO = require('../../../assets/images/logo-header.png');
const FALLBACK_COURT_PHOTO = 'https://images.unsplash.com/photo-1543941948-60b9490a4414?w=900&h=560&fit=crop&q=82';

const ACTIVITY_STATS = {
  playersHere: 24,
  gamesNow: 5,
  courtsActive: 4,
  nextGameTime: '6:30 PM',
};

const PLAYER_AVATARS = [
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108755-2616b612b1e8?w=120&h=120&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&q=80',
];

const GAME_AVATARS = [
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108755-2616b612b1e8?w=80&h=80&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&h=80&fit=crop&q=80',
];

const MATCH_AVATARS = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&q=80',
  'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=80&h=80&fit=crop&q=80',
];

export default function WelcomeToCourtScreen() {
  const insets = useSafeAreaInsets();
  const { draft } = useOnboarding();
  const firstName = draft.firstName.trim() || 'Jesus';
  const courtName = draft.homeCourt?.name ?? 'Lakewood Ranch Park';
  const photo = draft.homeCourt?.primaryPhotoUrl ?? FALLBACK_COURT_PHOTO;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}> 
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 98 }]} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <TouchableOpacity style={s.iconBtn} activeOpacity={0.75}>
            <Ionicons name="menu" size={24} color={L.navy} />
          </TouchableOpacity>
          <Image source={LOGO} style={s.logo} resizeMode="contain" />
          <TouchableOpacity style={s.iconBtn} activeOpacity={0.75}>
            <Ionicons name="notifications-outline" size={23} color={L.navy} />
            <View style={s.notificationBadge}><Text style={s.notificationText}>3</Text></View>
          </TouchableOpacity>
        </View>

        <View style={s.heroIntro}>
          <Text style={s.welcome}>Welcome home,</Text>
          <Text style={s.name}>{firstName}!</Text>
          <Text style={s.introSub}>Your pickleball community is active and ready to play.</Text>
        </View>

        <View style={s.sectionIntro}>
          <Text style={s.eyebrow}>COURT CONDITIONS</Text>
        </View>
        <View style={s.conditionsCard}>
          <View style={s.playScoreBlock}>
            <View style={s.sunIcon}><Ionicons name="sunny-outline" size={24} color={L.success} /></View>
            <View>
              <Text style={s.conditionGood}>Excellent</Text>
              <Text style={s.conditionSmall}>Play Score 96</Text>
            </View>
          </View>
          <ConditionMetric value="79" label="Feels like 81" />
          <ConditionMetric value="Light Wind" label="6 mph" />
          <ConditionMetric value="No Rain" label="0%" />
        </View>

        <View style={s.bestTimeRow}>
          <Ionicons name="time-outline" size={16} color={L.textSub} />
          <Text style={s.bestTimeText}>Best time to play: <Text style={s.bestTimeGold}>6:30 PM - 8:30 PM</Text></Text>
        </View>

        <View style={s.courtCard}>
          <Image source={{ uri: photo }} style={s.courtPhoto} resizeMode="cover" />
          <View style={s.courtOverlay} />
          <View style={s.liveBadge}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>LIVE</Text>
          </View>
          <TouchableOpacity style={s.saveBtn} activeOpacity={0.75}>
            <Ionicons name="bookmark-outline" size={22} color={L.navy} />
          </TouchableOpacity>
          <View style={s.courtTitleBlock}>
            <Text style={s.courtTitle} numberOfLines={1}>{courtName}</Text>
            <View style={s.homeCourtRow}>
              <Ionicons name="location" size={14} color={L.gold} />
              <Text style={s.homeCourtText}>Your Home Court</Text>
            </View>
          </View>
          <View style={s.statStrip}>
            <HomeStat icon="people-outline" value={String(ACTIVITY_STATS.playersHere)} label="Players here" />
            <HomeStat icon="pickleball" value={String(ACTIVITY_STATS.gamesNow)} label="Games now" />
            <HomeStat icon="grid-outline" value={String(ACTIVITY_STATS.courtsActive)} label="Courts active" />
            <HomeStat icon="time-outline" value={ACTIVITY_STATS.nextGameTime} label="Next game" />
          </View>
        </View>

        <SectionHeader title="HAPPENING NOW" action="See all" />
        <TouchableOpacity style={s.gameCard} activeOpacity={0.86}>
          <Image source={{ uri: 'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?w=160&h=160&fit=crop&q=80' }} style={s.gamePhoto} />
          <View style={s.gameBody}>
            <View style={s.gameTitleRow}>
              <View style={s.greenDot} />
              <Text style={s.gameTitle}>Advanced Open Play</Text>
            </View>
            <Text style={s.gameMeta}>6:30 PM  -  All Levels</Text>
            <View style={s.avatarStack}>{GAME_AVATARS.map((uri, index) => <Avatar key={uri} uri={uri} index={index} size={26} />)}<View style={s.moreMini}><Text style={s.moreMiniText}>+7</Text></View></View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={L.textSub} />
        </TouchableOpacity>

        <SectionHeader title="People at your court" action="See all" />
        <View style={s.peopleRow}>
          {PLAYER_AVATARS.map(uri => <Image key={uri} source={{ uri }} style={s.peopleAvatar} />)}
          <View style={s.peopleMore}><Text style={s.peopleMoreText}>+19</Text></View>
        </View>

        <View style={s.recommendCard}>
          <View style={s.recommendTop}>
            <View style={s.starBadge}><Ionicons name="star" size={18} color="#7A49CB" /></View>
            <Text style={s.recommendLabel}>RECOMMENDED FOR YOU</Text>
          </View>
          <View style={s.recommendBodyRow}>
            <View style={s.recommendCopy}>
              <Text style={s.recommendText}>3 players within +/-0.20 PAR are playing tonight.</Text>
              <Text style={s.matchPotential}>Great match potential!</Text>
            </View>
            <View style={s.matchStack}>{MATCH_AVATARS.map((uri, index) => <Avatar key={uri} uri={uri} index={index} size={30} />)}</View>
          </View>
        </View>

        <TouchableOpacity style={s.findGameCta} activeOpacity={0.9} onPress={() => router.replace('/')}>
          <Text style={s.findGameText}>Find My First Game</Text>
          <Ionicons name="arrow-forward" size={24} color={L.white} />
        </TouchableOpacity>
      </ScrollView>

      <View style={[s.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}> 
        <TabItem active icon="home" label="Home" />
        <TabItem icon="location-outline" label="Nearby" />
        <TabItem icon="calendar-outline" label="Events" />
        <TabItem icon="people-outline" label="Partner" />
        <TabItem icon="person-outline" label="Profile" />
      </View>
    </View>
  );
}

function ConditionMetric({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.conditionMetric}>
      <Text style={s.conditionValue}>{value}</Text>
      <Text style={s.conditionLabel}>{label}</Text>
    </View>
  );
}

function HomeStat({ icon, value, label }: { icon: AppIconName; value: string; label: string }) {
  return (
    <View style={s.homeStat}>
      <AppIcon name={icon} size={18} color={L.gold} />
      <Text style={s.homeStatValue}>{value}</Text>
      <Text style={s.homeStatLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, action }: { title: string; action: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.sectionAction}>{action}</Text>
    </View>
  );
}

function Avatar({ uri, index, size }: { uri: string; index: number; size: number }) {
  return <Image source={{ uri }} style={[s.stackedAvatar, { width: size, height: size, borderRadius: size / 2, marginLeft: index === 0 ? 0 : -8 }]} />;
}

function TabItem({ icon, label, active = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean }) {
  return (
    <View style={s.tabItem}>
      <Ionicons name={icon} size={21} color={active ? L.gold : '#7C8494'} />
      <Text style={[s.tabLabel, active && s.tabLabelActive]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  header: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 138, height: 28 },
  notificationBadge: { position: 'absolute', right: 4, top: 7, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444', borderWidth: 2, borderColor: L.white },
  notificationText: { color: L.white, fontSize: 9, fontWeight: '900' },
  heroIntro: { marginBottom: spacing.xl },
  welcome: { color: L.navy, fontSize: text.pageTitle.size, lineHeight: 34, fontWeight: '900' },
  name: { color: L.gold, fontSize: text.pageTitle.size, lineHeight: 36, fontWeight: '900', marginBottom: spacing.md },
  introSub: { width: 230, color: '#6B7280', fontSize: text.body.size, lineHeight: 21, fontWeight: '500' },
  sectionIntro: { marginBottom: spacing.sm },
  eyebrow: { color: '#6B7280', fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  conditionsCard: { minHeight: 82, borderRadius: shape.card, backgroundColor: L.white, borderWidth: 1, borderColor: '#EBEEF3', flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2, marginBottom: spacing.md },
  playScoreBlock: { flex: 1.45, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sunIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECFDF3' },
  conditionGood: { color: L.success, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  conditionSmall: { color: '#6B7280', fontSize: 9, fontWeight: '700' },
  conditionMetric: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: '#EEF1F5' },
  conditionValue: { color: L.navy, fontSize: text.chipValue.size, fontWeight: '800', textAlign: 'center' },
  conditionLabel: { color: '#6B7280', fontSize: 8, lineHeight: 11, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  bestTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xl },
  bestTimeText: { color: '#4B5563', fontSize: text.caption.size, fontWeight: '500' },
  bestTimeGold: { color: L.gold, fontWeight: '900' },
  courtCard: { borderRadius: shape.card, backgroundColor: L.white, overflow: 'hidden', borderWidth: 1, borderColor: '#E7EAF0', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 4, marginBottom: spacing.xl },
  courtPhoto: { height: 205, width: '100%', backgroundColor: '#E5E7EB' },
  courtOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 205, backgroundColor: 'rgba(0,0,0,0.22)' },
  liveBadge: { position: 'absolute', top: spacing.md, left: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: L.success, borderRadius: shape.pill, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: L.white },
  liveText: { color: L.white, fontSize: 10, fontWeight: '900' },
  saveBtn: { position: 'absolute', top: spacing.md, right: spacing.md, width: 38, height: 42, borderRadius: shape.cta, backgroundColor: 'rgba(255,255,255,0.72)', alignItems: 'center', justifyContent: 'center' },
  courtTitleBlock: { position: 'absolute', left: spacing.lg, right: spacing.lg, top: 142 },
  courtTitle: { color: L.white, fontSize: text.cardTitle.size, lineHeight: 28, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.28)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  homeCourtRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  homeCourtText: { color: L.white, fontSize: text.chipValue.size, fontWeight: '800' },
  statStrip: { flexDirection: 'row', paddingVertical: spacing.md, backgroundColor: L.white },
  homeStat: { flex: 1, alignItems: 'center', gap: 3, borderRightWidth: 1, borderRightColor: '#EEF1F5' },
  homeStatValue: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  homeStatLabel: { color: '#6B7280', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: { color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing },
  sectionAction: { color: L.gold, fontSize: text.link.size, fontWeight: '700' },
  gameCard: { minHeight: 92, borderRadius: shape.card, backgroundColor: '#F8FCFA', borderWidth: 1, borderColor: '#DDEAE6', flexDirection: 'row', alignItems: 'center', padding: spacing.sm, marginBottom: spacing.xl },
  gamePhoto: { width: 70, height: 70, borderRadius: shape.cta, marginRight: spacing.md },
  gameBody: { flex: 1, minWidth: 0 },
  gameTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: L.success },
  gameTitle: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  gameMeta: { color: '#4B5563', fontSize: text.caption.size, fontWeight: '500', marginBottom: spacing.sm },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  stackedAvatar: { borderWidth: 2, borderColor: L.white, backgroundColor: '#E5E7EB' },
  moreMini: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF0F4', marginLeft: -8, borderWidth: 2, borderColor: L.white },
  moreMiniText: { color: L.navy, fontSize: 10, fontWeight: '900' },
  peopleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  peopleAvatar: { width: 45, height: 45, borderRadius: 23, marginRight: spacing.sm, backgroundColor: '#E5E7EB' },
  peopleMore: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F0F1F4', alignItems: 'center', justifyContent: 'center' },
  peopleMoreText: { color: '#6B7280', fontSize: 15, fontWeight: '900' },
  recommendCard: { borderRadius: shape.card, borderWidth: 1.5, borderColor: '#E0D0FA', backgroundColor: '#FBF7FF', padding: spacing.md, marginBottom: spacing.xl },
  recommendTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  starBadge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0E7FF' },
  recommendLabel: { color: '#7A49CB', fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  recommendBodyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recommendCopy: { flex: 1 },
  recommendText: { color: L.navy, fontSize: text.rowTitle.size, lineHeight: 19, fontWeight: '700' },
  matchPotential: { color: '#8B5CF6', fontSize: text.chipValue.size, fontWeight: '800', marginTop: spacing.sm },
  matchStack: { flexDirection: 'row', alignItems: 'center' },
  findGameCta: { minHeight: 60, borderRadius: shape.cta, backgroundColor: L.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl, shadowColor: L.gold, shadowOpacity: 0.36, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  findGameText: { color: L.white, fontSize: text.actionLarge.size, fontWeight: '800' },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 74, borderTopWidth: 1, borderColor: '#E5E7EB', backgroundColor: L.white, flexDirection: 'row', paddingTop: 9, paddingHorizontal: spacing.sm, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 8 },
  tabItem: { flex: 1, alignItems: 'center', gap: 4 },
  tabLabel: { color: '#7C8494', fontSize: 10, fontWeight: '700' },
  tabLabelActive: { color: L.gold, fontWeight: '900' },
});