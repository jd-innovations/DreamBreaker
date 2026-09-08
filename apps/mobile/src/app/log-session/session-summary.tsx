import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ImageBackground } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getSavedGames } from '@/lib/logSessionStore';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

export default function SessionSummaryScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    facilityName?: string;
    facilityLocation?: string;
    facilityPhotoUrl?: string;
  }>();

  const facilityName = params.facilityName || 'Session Location';
  const facilityLocation = params.facilityLocation || '';
  const facilityPhotoUrl = params.facilityPhotoUrl || null;
  const games = getSavedGames();
  const wins = games.filter((game) => game.myScore > game.opponentScore).length;
  const losses = games.filter((game) => game.myScore < game.opponentScore).length;
  const winPct = games.length ? `${Math.round((wins / games.length) * 100)}%` : '0%';
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>Session Summary</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        {facilityPhotoUrl ? (
          <ImageBackground source={{ uri: facilityPhotoUrl }} style={styles.hero} imageStyle={styles.heroImage}>
            <LocationBadge name={facilityName} location={facilityLocation} />
          </ImageBackground>
        ) : (
          <View style={[styles.hero, styles.heroFallback]}>
            <LocationBadge name={facilityName} location={facilityLocation} />
          </View>
        )}

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={15} color={colors.textSub} />
            <Text style={styles.metaText}>{dateLabel}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={15} color={colors.textSub} />
            <Text style={styles.metaText}>Saved just now</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>SESSION OVERVIEW</Text>
        <View style={styles.statsGrid}>
          <StatCard value={String(games.length)} label="Games" />
          <StatCard value="-" label="Players" />
          <StatCard value="-" label="Duration" />
          <StatCard value={`${wins}-${losses}`} label="Record" />
        </View>
        <View style={styles.winPctCard}>
          <Text style={styles.winPctValue}>{winPct}</Text>
          <Text style={styles.winPctLabel}>Win %</Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton
          label="View Session Details"
          style={styles.detailsButton}
          textStyle={styles.detailsButtonText}
          onPress={() => router.push('/log-session/session-games')}
        />
      </View>
    </View>
  );
}

function LocationBadge({ name, location }: { name: string; location: string }) {
  return (
    <View style={styles.locationBadge}>
      <Ionicons name="location" size={16} color={colors.white} />
      <View>
        <Text style={styles.locationName} numberOfLines={1}>{name}</Text>
        {location ? <Text style={styles.locationSub} numberOfLines={1}>{location}</Text> : null}
      </View>
    </View>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH,
    paddingVertical: 12,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.navy, fontSize: text.sectionTitle.size, fontWeight: '900' },
  body: { flex: 1, paddingHorizontal: spacing.screenH, paddingTop: spacing.sm },
  hero: {
    height: 140,
    borderRadius: shape.card,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  heroImage: {
    borderRadius: shape.card,
  },
  heroFallback: {
    backgroundColor: colors.page,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(10,18,40,0.72)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    margin: spacing.sm,
    borderRadius: shape.panel,
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  locationName: {
    color: colors.white,
    fontSize: text.rowTitle.size, fontWeight: '700',
  },
  locationSub: { fontSize: text.caption.size, fontWeight: '500',
    color: colors.playerTextSub,
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: colors.textSub,
    fontSize: text.caption.size, fontWeight: '500',
  },
  sectionLabel: { fontSize: text.sectionLabel.size,
    color: colors.textSub,
    fontWeight: '800',
    letterSpacing: text.sectionLabel.letterSpacing,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: shape.card,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    color: colors.navy,
    fontSize: text.cardTitle.size,
    fontWeight: '800',
  },
  statLabel: { fontSize: text.caption.size, fontWeight: '500',
    color: colors.textSub,
    marginTop: 2,
  },
  winPctCard: {
    borderWidth: 1,
    borderColor: colors.goldBorder,
    backgroundColor: colors.goldLight,
    borderRadius: shape.card,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  winPctValue: {
    color: colors.gold,
    fontSize: text.cardTitle.size,
    fontWeight: '800',
  },
  winPctLabel: { fontSize: text.caption.size, fontWeight: '500',
    color: colors.textSub,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailsButton: {
    backgroundColor: colors.gold,
  },
  detailsButtonText: {
    color: colors.navy,
  },
});
