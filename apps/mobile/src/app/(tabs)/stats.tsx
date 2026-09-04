import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, APP_HEADER_HEIGHT } from '@/components/AppHeader';
import { PrimaryButton } from '@/components/PrimaryButton';
import { PlayerCredentialCard } from '@/components/stats';
import { useSession } from '@/hooks/useSession';
import { OnboardingEntrance } from '@/lib/onboarding/components';
import { fetchMyStatsPlayerCard, type MyStatsPlayerCard } from '@/lib/stats/myStats';
import {
  fetchMyMatchHistory, fetchPersonalSessionWithGames,
  type PersonalMatchHistoryItem, type PersonalSessionDetails,
} from '@/lib/supabase/personalSessions';
import { explainParEvent, explainParProcessing, formatParChange } from '@/lib/supabase/par';
import { onProfileUpdated } from '@/lib/profileEvents';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

type TabKey = 'stats' | 'matches';

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { user, loading: sessionLoading } = useSession();
  const [activeTab, setActiveTab] = useState<TabKey>('stats');
  const [playerCard, setPlayerCard] = useState<MyStatsPlayerCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlayerCard = useCallback(async () => {
    if (sessionLoading) return;

    if (!user?.id) {
      setPlayerCard(null);
      setError('Sign in to view your player card.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyStatsPlayerCard(user.id);
      setPlayerCard(data);
    } catch (err) {
      setPlayerCard(null);
      setError(err instanceof Error ? err.message : 'Unable to load your player card.');
    } finally {
      setLoading(false);
    }
  }, [sessionLoading, user?.id]);

  // Refetch on focus (covers mount, user change, and returning from the
  // log-session flow, which changes games logged and PAR).
  useFocusEffect(
    useCallback(() => {
      void loadPlayerCard();
    }, [loadPlayerCard]),
  );

  // Reload when edit-profile saves (modal dismissal doesn't trigger a focus/mount event here)
  useEffect(() => onProfileUpdated(loadPlayerCard), [loadPlayerCard]);

  const isStats = activeTab === 'stats';

  return (
    <View style={[styles.root, isStats ? styles.statsRoot : styles.matchesRoot]}>
      <StatusBar style={isStats ? 'light' : 'dark'} />
      <AppHeader hideProfile />
      <View
        style={[
          styles.topTabsWrap,
          { paddingHorizontal: spacing.screenH, marginTop: insets.top + APP_HEADER_HEIGHT },
        ]}
      >
        <TabSwitcher activeTab={activeTab} onChange={setActiveTab} />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 140,
          paddingHorizontal: spacing.screenH,
          paddingTop: 0,
        }}
        showsVerticalScrollIndicator={false}
      >
        {isStats ? (
          <MyStatsContent
            data={playerCard}
            error={error}
            loading={loading || sessionLoading}
            onRetry={loadPlayerCard}
          />
        ) : (
          <MyMatchesContent userId={user?.id ?? null} />
        )}
      </ScrollView>
    </View>
  );
}

function TabSwitcher({ activeTab, onChange }: { activeTab: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <View style={styles.tabs}>
      <TouchableOpacity
        onPress={() => onChange('stats')}
        activeOpacity={0.9}
        style={[styles.tab, activeTab === 'stats' && styles.tabActive]}
      >
        <Text style={[styles.tabText, activeTab === 'stats' && styles.tabTextActive]}>My Stats</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onChange('matches')}
        activeOpacity={0.9}
        style={[styles.tab, activeTab === 'matches' && styles.tabActive]}
      >
        <Text style={[styles.tabText, activeTab === 'matches' && styles.tabTextActive]}>My Matches</Text>
      </TouchableOpacity>
    </View>
  );
}

function MyStatsContent({
  data,
  error,
  loading,
  onRetry,
}: {
  data: MyStatsPlayerCard | null;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <View style={states.card}>
        <ActivityIndicator color={colors.gold} />
        <Text style={states.title}>Loading your player card</Text>
        <Text style={states.sub}>We are pulling your profile and completed game history.</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={states.card}>
        <View style={states.iconCircle}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.gold} />
        </View>
        <Text style={states.title}>Player card unavailable</Text>
        <Text style={states.sub}>{error}</Text>
        <TouchableOpacity onPress={onRetry} activeOpacity={0.9} style={states.retryButton}>
          <Text style={states.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={states.card}>
        <Text style={states.title}>Player card unavailable</Text>
        <Text style={states.sub}>Your profile could not be loaded yet.</Text>
      </View>
    );
  }

  return (
    <OnboardingEntrance distance={12}>
      <PlayerCredentialCard data={data} />
      <PrimaryButton
        label="Log a session"
        style={styles.logSessionButton}
        textStyle={styles.logSessionButtonText}
        onPress={() => router.push('/log-session/choose-format')}
      />
    </OnboardingEntrance>
  );
}

const STATUS_LABEL: Record<PersonalMatchHistoryItem['session']['status'], string> = {
  draft: 'Draft',
  active: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function formatSessionDate(playedAt: string) {
  return new Date(playedAt).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatFormat(format: PersonalMatchHistoryItem['session']['format']) {
  return format === 'singles' ? 'Singles' : 'Doubles';
}

type FormatFilter = 'all' | 'singles' | 'doubles';
type StatusFilter = 'all' | 'completed' | 'active' | 'draft' | 'cancelled';

const FORMAT_FILTERS: { key: FormatFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'singles', label: 'Singles' },
  { key: 'doubles', label: 'Doubles' },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'active', label: 'In Progress' },
  { key: 'draft', label: 'Draft' },
  { key: 'cancelled', label: 'Cancelled' },
];

function MyMatchesContent({ userId }: { userId: string | null }) {
  const [items, setItems] = useState<PersonalMatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Refetch on focus so a session logged from this screen shows up on return.
  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setItems([]);
        return;
      }
      let cancelled = false;
      setLoading(true);
      setError(null);
      fetchMyMatchHistory(userId)
        .then((rows) => {
          if (!cancelled) setItems(rows);
        })
        .catch((err) => {
          if (!cancelled) {
            setItems([]);
            setError(err instanceof Error ? err.message : 'Unable to load your match history.');
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  const filteredItems = items.filter((item) =>
    (formatFilter === 'all' || item.session.format === formatFilter) &&
    (statusFilter === 'all' || item.session.status === statusFilter),
  );

  if (loading) {
    return (
      <View style={mm.wrap}>
        <ActivityIndicator color={colors.gold} />
        <Text style={mm.sub}>Loading match history.</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={mm.wrap}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.gold} />
        <Text style={mm.title}>Match history unavailable</Text>
        <Text style={mm.sub}>{error}</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={mm.wrap}>
        <Ionicons name="grid-outline" size={48} color={colors.textMuted} />
        <Text style={mm.title}>No Matches Yet</Text>
        <Text style={mm.sub}>Your match history will appear here once you log a session.</Text>
      </View>
    );
  }

  return (
    <>
      <View style={mm.filters}>
        <FilterRow options={FORMAT_FILTERS} value={formatFilter} onChange={setFormatFilter} />
        <FilterRow options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
      </View>

      {filteredItems.length === 0 ? (
        <View style={mm.wrap}>
          <Ionicons name="filter-outline" size={40} color={colors.textMuted} />
          <Text style={mm.title}>No matches for these filters</Text>
          <Text style={mm.sub}>Try a different format or status.</Text>
        </View>
      ) : (
        <View style={mm.list}>
          {filteredItems.map((item) => (
            <MatchHistoryRow key={item.session.id} item={item} onPress={() => setSelectedSessionId(item.session.id)} />
          ))}
        </View>
      )}

      <MatchDetailModal
        item={items.find((item) => item.session.id === selectedSessionId) ?? null}
        onClose={() => setSelectedSessionId(null)}
      />
    </>
  );
}

function FilterRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={mm.filterRow}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[mm.filterChip, active && mm.filterChipActive]}
            onPress={() => onChange(opt.key)}
            activeOpacity={0.8}
          >
            <Text style={[mm.filterChipText, active && mm.filterChipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function buildMatchShareMessage(item: PersonalMatchHistoryItem): string {
  const { session, facilityName, gameCount, record } = item;
  const lines = [
    `${formatFormat(session.format)} session on ${formatSessionDate(session.played_at)}`,
  ];
  if (facilityName) lines.push(`📍 ${facilityName}`);
  lines.push(`${gameCount} game${gameCount === 1 ? '' : 's'} logged${record ? ` · ${record.wins}-${record.losses} record` : ''}`);
  lines.push('\nLogged on Pickleball App 🏓');
  return lines.join('\n');
}

function MatchHistoryRow({ item, onPress }: { item: PersonalMatchHistoryItem; onPress: () => void }) {
  const { session, facilityName, gameCount, record } = item;

  function handleShare() {
    Share.share({ message: buildMatchShareMessage(item) }).catch(() => {});
  }

  return (
    <TouchableOpacity style={mm.row} onPress={onPress} activeOpacity={0.75}>
      <View style={mm.rowTop}>
        <Text style={mm.rowDate}>{formatSessionDate(session.played_at)}</Text>
        <View style={mm.rowTopRight}>
          <View style={[mm.statusChip, session.status === 'completed' && mm.statusChipCompleted]}>
            <Text style={[mm.statusChipText, session.status === 'completed' && mm.statusChipTextCompleted]}>
              {STATUS_LABEL[session.status]}
            </Text>
          </View>
          <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={18} color={colors.textSub} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={mm.rowLocation}>
        <Ionicons name="location-outline" size={14} color={colors.textSub} />
        <Text style={mm.rowLocationText} numberOfLines={1}>{facilityName ?? 'No facility recorded'}</Text>
      </View>

      <View style={mm.rowMetaRow}>
        <Text style={mm.rowMeta}>{formatFormat(session.format)}</Text>
        <View style={mm.rowMetaDot} />
        <Text style={mm.rowMeta}>{gameCount} game{gameCount === 1 ? '' : 's'}</Text>
        {record ? (
          <>
            <View style={mm.rowMetaDot} />
            <Text style={mm.rowMeta}>{record.wins}-{record.losses} record</Text>
          </>
        ) : null}
      </View>

      <ParImpactLine item={item} />
    </TouchableOpacity>
  );
}

function ParImpactLine({ item }: { item: PersonalMatchHistoryItem }) {
  const impact = item.parImpact;
  const change = formatParChange(impact?.totalChange);
  const processed = impact?.status === 'processed' && change;
  const explanation = processed
    ? explainParEvent(impact.latestEvent)
    : explainParProcessing(impact && impact.status !== 'not_started'
      ? { status: impact.status, eligibility_reason: impact.reason, error_message: null }
      : null);

  return (
    <View style={mm.parLine}>
      <Ionicons
        name={processed ? 'trending-up-outline' : 'time-outline'}
        size={14}
        color={processed ? colors.gold : colors.textMuted}
      />
      <Text style={[mm.parText, processed && mm.parTextProcessed]} numberOfLines={2}>
        {processed ? `PAR impact ${change}` : 'PAR pending'}
        {explanation ? ` - ${explanation}` : ''}
      </Text>
    </View>
  );
}

function MatchDetailModal({ item, onClose }: { item: PersonalMatchHistoryItem | null; onClose: () => void }) {
  const [detail, setDetail] = useState<PersonalSessionDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const sessionId = item?.session.id ?? null;

  useEffect(() => {
    if (!sessionId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    fetchPersonalSessionWithGames(sessionId)
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  function handleShare() {
    if (!item) return;
    Share.share({ message: buildMatchShareMessage(item) }).catch(() => {});
  }

  function participantName(participantId: string) {
    return detail?.participants.find((p) => p.id === participantId)?.display_name_snapshot ?? 'Player';
  }

  return (
    <Modal visible={!!item} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={dm.root}>
        <View style={dm.header}>
          <Text style={dm.headerTitle}>Match Details</Text>
          <View style={dm.headerActions}>
            <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={dm.headerActionBtn}>
              <Ionicons name="share-outline" size={22} color={colors.navy} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.navy} />
            </TouchableOpacity>
          </View>
        </View>

        {item && (
          <ScrollView contentContainerStyle={dm.scroll}>
            <Text style={dm.title}>{formatFormat(item.session.format)} session</Text>
            <Text style={dm.subtitle}>{formatSessionDate(item.session.played_at)}</Text>

            <View style={dm.metaRow}>
              <Ionicons name="location-outline" size={15} color={colors.textSub} />
              <Text style={dm.metaText}>{item.facilityName ?? 'No facility recorded'}</Text>
            </View>
            <View style={dm.metaRow}>
              <Ionicons name="pricetag-outline" size={15} color={colors.textSub} />
              <Text style={dm.metaText}>{STATUS_LABEL[item.session.status]}</Text>
            </View>

            <View style={dm.parWrap}>
              <ParImpactLine item={item} />
            </View>

            {loading ? (
              <ActivityIndicator color={colors.gold} style={{ marginTop: 24 }} />
            ) : (
              <>
                <Text style={dm.sectionLabel}>PLAYERS</Text>
                <View style={dm.participantsWrap}>
                  {(detail?.participants ?? []).map((p) => (
                    <View key={p.id} style={dm.participantChip}>
                      <Text style={dm.participantText}>{p.display_name_snapshot}</Text>
                      {p.estimated_skill ? <Text style={dm.participantSkill}>{p.estimated_skill}</Text> : null}
                    </View>
                  ))}
                </View>

                <Text style={dm.sectionLabel}>GAMES</Text>
                {(detail?.games ?? []).length === 0 ? (
                  <Text style={dm.emptyGamesText}>No games logged for this session.</Text>
                ) : (
                  (detail?.games ?? []).map((game) => {
                    const teamOne = (detail?.gameParticipants ?? []).filter((gp) => gp.game_id === game.id && gp.team_number === 1);
                    const teamTwo = (detail?.gameParticipants ?? []).filter((gp) => gp.game_id === game.id && gp.team_number === 2);
                    return (
                      <View key={game.id} style={dm.gameCard}>
                        <View style={dm.gameHeader}>
                          <Text style={dm.gameNumber}>Game {game.game_number}</Text>
                          {game.status === 'completed' ? (
                            <Text style={dm.gameScore}>{game.team_one_score} - {game.team_two_score}</Text>
                          ) : (
                            <Text style={dm.gamePending}>Not completed</Text>
                          )}
                        </View>
                        <View style={dm.gameTeamsRow}>
                          <Text style={[dm.gameTeamText, game.winning_team === 1 && dm.gameTeamWinner]} numberOfLines={1}>
                            {teamOne.map((gp) => participantName(gp.session_participant_id)).join(' & ') || 'TBD'}
                          </Text>
                          <Text style={dm.gameVs}>vs</Text>
                          <Text style={[dm.gameTeamText, game.winning_team === 2 && dm.gameTeamWinner]} numberOfLines={1}>
                            {teamTwo.map((gp) => participantName(gp.session_participant_id)).join(' & ') || 'TBD'}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  statsRoot: { backgroundColor: colors.playerDarkBg },
  matchesRoot: { backgroundColor: colors.page },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 3,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: shape.cta,
    paddingVertical: 10,
  },
  tabActive: { backgroundColor: colors.navy },
  tabText: {
    color: colors.textSub,
    fontSize: text.controlLabel.size, fontWeight: '700',
  },
  tabTextActive: { color: colors.white },
  topTabsWrap: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  logSessionButton: {
    marginTop: spacing.md,
    backgroundColor: colors.gold,
  },
  logSessionButtonText: {
    color: colors.navy,
  },
});

const states = StyleSheet.create({
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: shape.card,
    borderWidth: 1,
    borderColor: colors.playerCardBorder,
    backgroundColor: colors.playerCardBg,
    padding: spacing.xxl,
    minHeight: 280,
    gap: spacing.md,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(201,168,76,0.12)',
  },
  title: { fontSize: text.cardTitle.size, fontWeight: '800',
    color: colors.playerText,
    textAlign: 'center',
  },
  sub: { fontSize: text.body.size, fontWeight: '500',
    color: colors.playerTextSub,
    textAlign: 'center',
    lineHeight: 21,
  },
  retryButton: {
    borderRadius: shape.cta,
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  retryText: {
    color: colors.navy,
    fontSize: text.action.size, fontWeight: '800',
  },
});

const mm = StyleSheet.create({
  wrap: {
    marginTop: 40,
    alignItems: 'center',
    gap: 12,
    padding: 24,
  },
  title: { fontSize: text.cardTitle.size, fontWeight: '800', color: colors.text },
  sub: { fontSize: text.body.size, fontWeight: '500', color: colors.textSub, textAlign: 'center', lineHeight: 20 },
  filters: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: shape.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  filterChipActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  filterChipText: {
    color: colors.textSub,
    fontWeight: '700',
    fontSize: text.controlLabel.size,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  list: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: shape.card,
    backgroundColor: colors.bg,
    padding: spacing.md,
    gap: 6,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowDate: {
    color: colors.text,
    fontSize: text.rowTitle.size, fontWeight: '700',
  },
  statusChip: {
    borderRadius: shape.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    backgroundColor: colors.page,
  },
  statusChipCompleted: {
    backgroundColor: colors.goldBg,
  },
  statusChipText: {
    color: colors.textSub,
    fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing,
    fontSize: text.cardLabel.size,
  },
  statusChipTextCompleted: {
    color: colors.gold,
  },
  rowLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rowLocationText: {
    color: colors.textSub,
    fontSize: text.caption.size, fontWeight: '500',
    flex: 1,
  },
  rowMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowMeta: {
    color: colors.textMuted,
    fontSize: text.caption.size, fontWeight: '500',
  },
  rowMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textMuted,
  },
  parLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 3,
  },
  parText: {
    color: colors.textMuted,
    fontSize: text.caption.size, fontWeight: '500',
    flex: 1,
    lineHeight: 16,
  },
  parTextProcessed: {
    color: colors.gold,
    fontWeight: '800',
  },
});

const dm = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.navy,
    fontSize: text.sectionTitle.size, fontWeight: '900',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActionBtn: {
    marginRight: spacing.lg,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  title: {
    color: colors.navy,
    fontSize: text.modalTitle.size, fontWeight: '900',
  },
  subtitle: {
    color: colors.textSub,
    fontSize: text.caption.size, fontWeight: '500',
    marginTop: 2,
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metaText: {
    color: colors.textSub,
    fontSize: text.caption.size, fontWeight: '500',
  },
  parWrap: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionLabel: { fontSize: text.sectionLabel.size,
    color: colors.textMuted,
    fontWeight: '800',
    letterSpacing: text.sectionLabel.letterSpacing,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  participantsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  participantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: shape.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.page,
  },
  participantText: {
    color: colors.text,
    fontSize: text.controlLabel.size, fontWeight: '700',
  },
  participantSkill: {
    color: colors.textMuted,
    fontSize: text.caption.size, fontWeight: '500',
  },
  emptyGamesText: {
    color: colors.textMuted,
    fontSize: text.caption.size, fontWeight: '500',
  },
  gameCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: shape.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 6,
  },
  gameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gameNumber: {
    color: colors.text,
    fontSize: text.rowTitle.size, fontWeight: '700',
  },
  gameScore: {
    color: colors.gold,
    fontSize: text.rowValue.size, fontWeight: '800',
  },
  gamePending: {
    color: colors.textMuted,
    fontSize: text.caption.size, fontWeight: '500',
  },
  gameTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gameTeamText: {
    color: colors.textSub,
    fontSize: text.caption.size, fontWeight: '500',
    flex: 1,
  },
  gameTeamWinner: {
    color: colors.navy,
    fontWeight: '800',
  },
  gameVs: {
    color: colors.textMuted,
    fontSize: text.caption.size, fontWeight: '500',
  },
});
