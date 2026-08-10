import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { AppIcon } from '@/components/AppIcon';
import { CourtIcon } from '@/components/CourtIcon';
import { ProfileCompletionRing } from '@/components/ProfileCompletionRing';
import { StatusChip } from '@/components/StatusChip';
import { colors, radius, spacing, typography } from '@/theme';
import { getProfileCompletion } from '@/lib/profileCompletion';
import type { MyStatsPlayerCard } from '@/lib/stats/myStats';
import { confidenceBandLabel, formatPar } from '@/lib/supabase/par';
import { PAR_GAUGE_SIZE, ParGauge } from './ParGauge';
import { PlayerStatTile } from './PlayerStatTile';


function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getParStageLabel(data: MyStatsPlayerCard) {
  const profile = data.parProfile;
  if (!profile) return 'Building Your PAR';
  if (profile.confidence_band === 'high') return 'Established PAR';
  if (profile.confidence_band === 'medium') return 'Provisional PAR';
  return profile.eligible_games_count > 0 ? 'Estimated PAR' : 'Building Your PAR';
}

function formatName(data: MyStatsPlayerCard) {
  return cleanText(data.profile.full_name) ?? 'DreamBreaker Player';
}

function formatHand(hand: string | null) {
  const clean = cleanText(hand);
  if (!clean) return null;
  return clean.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function PlayerCredentialCard({
  data,
  footerSlot,
}: {
  data: MyStatsPlayerCard;
  footerSlot?: React.ReactNode;
}) {
  const name = formatName(data);
  const hand = formatHand(data.profile.hand);
  const locationLabel = data.locationLabel;
  const currentRating = data.currentRating;
  const homeCourtName = data.homeCourtName;
  const homeCourtId = data.homeCourtId;
  const avatarUrl = cleanText(data.profile.avatar_url);
  const profileCompletion = getProfileCompletion(data.profile);
  const hasInfoPills = Boolean(locationLabel || hand);
  const hasRatingDetail = Boolean(currentRating);
  // Gated on the court name alone — the footer is titled "Home court", so
  // rendering it for a location-only profile left a blank title line.
  const hasFooter = Boolean(homeCourtName);
  const parScore = data.parProfile?.current_par ?? null;
  const parConfidence = data.parProfile ? confidenceBandLabel(data.parProfile.confidence_band) : 'PAR pending';
  const parStage = getParStageLabel(data);
  const gamesLogged = data.loggedGames.total ?? data.parProfile?.eligible_games_count ?? 0;
  const eligibleGames = data.parProfile?.eligible_games_count ?? 0;
  const confidenceScore = data.parProfile ? `${Math.round(data.parProfile.confidence_score)}%` : 'Pending';

  return (
    <View style={styles.wrap}>
      <View style={styles.strap} />
      <View style={styles.ringOuter}>
        <View style={styles.ringInner} />
      </View>
      <View style={styles.clip} />

      <View style={styles.shell}>
        <View style={styles.slot} />
        <View style={styles.credential}>
          <View style={styles.mainContent}>
            <View style={styles.heroRow}>
              <ProfileCompletionRing percent={profileCompletion} size={PAR_GAUGE_SIZE} strokeWidth={3}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.initialsAvatar}>
                    <Text style={styles.initials}>{data.initials}</Text>
                  </View>
                )}
              </ProfileCompletionRing>

              <ParGauge
                score={parScore}
                stageLabel={parStage}
                confidenceLabel={parConfidence}
                confidenceBand={data.parProfile?.confidence_band ?? null}
              />
            </View>

            <View style={styles.nameRow}>
              <Text
                style={styles.name}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {name}
              </Text>
              <View style={styles.verifiedRow}>
                <AppIcon name="shield-checkmark" size={18} color={colors.gold} />
              </View>
            </View>

            {hasInfoPills ? (
              <View style={styles.infoPillsRow}>
                {locationLabel ? <InfoPill icon="location-outline" label={locationLabel} /> : null}
                {hand ? <InfoPill icon="hand-left-outline" label={hand} /> : null}
              </View>
            ) : null}

            {hasRatingDetail ? <View style={styles.divider} /> : null}

            {hasRatingDetail && currentRating ? (
              <View style={styles.profileRows}>
                <View style={styles.ratingRow}>
                  <View style={styles.ratingCopy}>
                    <Text style={styles.profileLabel}>External rating input</Text>
                    <Text style={styles.profileValue}>{currentRating.label}</Text>
                  </View>
                  <View style={styles.ratingValuePill}>
                    <Text style={styles.ratingValue}>{currentRating.value}</Text>
                  </View>
                  {currentRating.verified ? <StatusChip label="Verified" variant="green" /> : null}
                </View>
              </View>
            ) : null}

            <View style={styles.performancePanel}>
              <View style={styles.performanceHeader}>
                <View>
                  <Text style={styles.profileLabel}>PAR profile</Text>
                  <Text style={styles.profileValue}>{formatPar(parScore)} PAR</Text>
                </View>
                <View style={styles.scorePills}>
                  <View style={styles.scorePill}>
                    <Text style={styles.scoreResult}>{eligibleGames}</Text>
                    <Text style={styles.scoreText}>eligible</Text>
                  </View>
                  <View style={styles.scorePill}>
                    <Text style={styles.scoreResult}>{confidenceScore}</Text>
                    <Text style={styles.scoreText}>trust</Text>
                  </View>
                </View>
              </View>
              <View style={styles.statsRow}>
                <PlayerStatTile icon="calendar-outline" label="Games Logged" value={String(gamesLogged)} />
                <PlayerStatTile icon="stats-chart-outline" label="PAR Games" value={String(eligibleGames)} />
                <PlayerStatTile icon="shield-checkmark-outline" label="Confidence" value={confidenceScore} />
              </View>
            </View>
          </View>

          {footerSlot ? <View style={styles.switcherSlot}>{footerSlot}</View> : null}

          {hasFooter ? (
            <FooterWrap onPress={homeCourtId ? () => router.push(`/facility/${homeCourtId}` as never) : undefined}>
              <View style={styles.footerQrStub}>
                <CourtIcon size={35} color={colors.gold} />
              </View>
              <View style={styles.footerTextBlock}>
                <Text style={styles.footerLabel}>Home court</Text>
                <Text style={styles.footerTitle} numberOfLines={1}>{homeCourtName}</Text>
                {locationLabel ? (
                  <View style={styles.footerMetaRow}>
                    <AppIcon name="location" size={13} color={colors.gold} />
                    <Text style={styles.footerMeta} numberOfLines={1}>{locationLabel}</Text>
                  </View>
                ) : null}
              </View>
              {homeCourtId ? <AppIcon name="chevron-forward" size={16} color={colors.playerTextSub} /> : null}
            </FooterWrap>
          ) : null}
        </View>
      </View>
    </View>
  );
}
function FooterWrap({
  onPress,
  children,
}: {
  onPress?: () => void;
  children: React.ReactNode;
}) {
  if (!onPress) return <View style={styles.footer}>{children}</View>;
  return (
    <TouchableOpacity style={styles.footer} onPress={onPress} activeOpacity={0.8}>
      {children}
    </TouchableOpacity>
  );
}

function InfoPill({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof AppIcon>['name'];
  label: string;
}) {
  return (
    <View style={styles.infoPill}>
      <AppIcon name={icon} size={13} color={colors.gold} />
      <Text style={styles.infoPillText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: 0,
    marginTop: -25,
  },
  strap: {
    width: 40,
    height: 58,
    backgroundColor: '#080B12',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: -4,
    zIndex: 4,
  },
  ringOuter: {
    width: 33,
    height: 33,
    borderRadius: 17,
    borderWidth: 4,
    borderColor: colors.gold,
    backgroundColor: '#2A1D09',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -8,
    zIndex: 5,
  },
  ringInner: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.playerDarkBg,
  },
  clip: {
    width: 18,
    height: 44,
    borderRadius: 9,
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    marginBottom: -20,
    zIndex: 6,
  },
  shell: {
    width: '100%',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.playerBadgeShellBorder,
    backgroundColor: colors.playerBadgeShell,
    paddingHorizontal: spacing.lg,
    paddingTop: 46,
    paddingBottom: spacing.lg,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 20 },
    shadowRadius: 30,
    elevation: 12,
  },
  slot: {
    position: 'absolute',
    top: 28,
    alignSelf: 'center',
    width: 88,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.playerDarkBg,
    borderWidth: 1,
    borderColor: colors.playerBadgeShellBorder,
    zIndex: 2,
  },
  credential: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.playerCredentialBg,
  },
  mainContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
  },
  initialsAvatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  initials: {
    ...typography.sectionTitle,
    color: colors.gold,
    fontSize: 32,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  name: {
    flexShrink: 1,
    color: colors.playerCredentialText,
    fontSize: 24,
    lineHeight: 27,
    fontWeight: '900',
    textAlign: 'left',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  infoPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  infoPillText: {
    ...typography.metadata,
    color: colors.playerCredentialText,
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(10,18,40,0.10)',
  },
  profileRows: {
    gap: spacing.sm,
  },
  profileLabel: {
    ...typography.metadata,
    color: colors.playerCredentialMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '800',
  },
  profileValue: {
    ...typography.cardTitle,
    color: colors.playerCredentialText,
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ratingCopy: {
    flex: 1,
  },
  ratingValuePill: {
    borderRadius: radius.chip,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ratingValue: {
    color: colors.playerCredentialText,
    fontSize: 18,
    fontWeight: '900',
  },
  performancePanel: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(10,18,40,0.10)',
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  performanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  scorePills: {
    flexDirection: 'row',
    gap: 5,
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  winPill: {
    backgroundColor: 'rgba(34,197,94,0.14)',
  },
  lossPill: {
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  scoreResult: {
    fontSize: 10,
    fontWeight: '900',
  },
  winText: {
    color: colors.success,
  },
  lossText: {
    color: colors.danger,
  },
  scoreText: {
    ...typography.metadata,
    color: colors.playerCredentialText,
    fontWeight: '800',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(10,18,40,0.10)',
    marginTop: spacing.xs,
  },
  switcherSlot: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.playerDarkBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  footerQrStub: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  footerLabel: {
    ...typography.metadata,
    color: colors.gold,
    textTransform: 'uppercase',
    fontWeight: '900',
    fontSize: 10,
  },
  footerTitle: {
    ...typography.cardTitle,
    color: colors.white,
    marginTop: 3,
  },
  footerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  footerMeta: {
    ...typography.metadata,
    color: colors.playerTextSub,
    flex: 1,
  },
});

