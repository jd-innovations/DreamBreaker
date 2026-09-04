import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Share, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { goBack } from '@/lib/navigation';
import { appLinks } from '@/lib/appLinks';
import { InfoTooltip } from '@/components/InfoTooltip';
import { useSupportContext } from '@/lib/support/supportContext';
import { fetchCoachProfile, fetchCoachPublicOffers, type CoachProfile } from '@/lib/coach/coachProfile';
import type { CoachOfferWithImages } from '@/lib/coach/offers';
import { DEFAULT_LESSON_COVER } from '@/lib/coach/defaultLessonCover';
import { OFFER_TYPE_OPTIONS, formatPriceCents } from '@/lib/coach/constants';

// Public coach profile.
//
// Everything here is backed by a real column or a real row. The mockup this
// came from also carried a rating, review count, "players coached", "repeat
// players", social links and certifications — none of which exist in the
// schema, and three of which would read 0 today because no coach purchase has
// ever completed. They are left out rather than shipped as zeros; the
// tournament screen's invented director stats were deleted for that reason and
// this would have been the same mistake with a new coat of paint.

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text, textSub: colors.textSub,
  border: colors.border, bg: colors.bg, page: colors.page, goldBg: colors.goldBg,
  white: '#FFFFFF',
};

const COVER_H = 170;
const AVATAR = 104;

export default function CoachProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [coach, setCoach] = useState<CoachProfile | null>(null);
  const [offers, setOffers] = useState<CoachOfferWithImages[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyTip, setVerifyTip] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

  useSupportContext({
    feature: 'coach',
    entityType: 'coach',
    entityId: id,
    entityLabel: coach?.fullName,
  });

  useFocusEffect(useCallback(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    Promise.all([fetchCoachProfile(id), fetchCoachPublicOffers(id)])
      .then(([c, o]) => { if (active) { setCoach(c); setOffers(o); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]));

  if (loading) {
    return (
      <View style={[s.root, s.centered]}>
        <ActivityIndicator size="large" color={L.gold} />
      </View>
    );
  }

  if (!coach) {
    return (
      <View style={[s.root, s.centered, { paddingHorizontal: 32 }]}>
        <Ionicons name="person-outline" size={44} color={L.textSub} />
        <Text style={s.emptyTitle}>Coach not found</Text>
        <Text style={s.emptyBody}>This coach profile is not available.</Text>
        <TouchableOpacity style={s.emptyBtn} onPress={() => goBack('/lessons')}>
          <Text style={s.emptyBtnText}>Back to Lessons</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const location = [coach.locationCity, coach.locationState].filter(Boolean).join(', ');

  async function handleShare() {
    if (!coach) return;
    try {
      await Share.share({
        message: `${coach.fullName} coaches on Pickleball App: ${appLinks.coach(coach.id)}`,
      });
    } catch { /* dismissed */ }
  }

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {/* ── COVER ── */}
        <View style={s.cover}>
          {coach.coverUrl
            ? <Image source={{ uri: coach.coverUrl }} style={s.coverImage} resizeMode="cover" />
            : <View style={[s.coverImage, s.coverFallback]} />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />

          <View style={[s.coverControls, { marginTop: insets.top + 8 }]}>
            <TouchableOpacity style={s.circleBtn} onPress={() => goBack('/lessons')} activeOpacity={0.85}>
              <Ionicons name="chevron-back" size={20} color={L.white} />
            </TouchableOpacity>
            <TouchableOpacity style={s.circleBtn} onPress={handleShare} activeOpacity={0.85}>
              <Ionicons name="share-outline" size={20} color={L.white} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── IDENTITY ── */}
        <View style={s.identity}>
          <View style={s.avatarWrap}>
            {coach.avatarUrl
              ? <Image source={{ uri: coach.avatarUrl }} style={s.avatar} />
              : (
                <View style={[s.avatar, s.avatarFallback]}>
                  <Ionicons name="person" size={44} color={L.textSub} />
                </View>
              )}
          </View>

          <Text style={s.name}>{coach.fullName}</Text>

          {!!coach.certification?.trim() && (
            <Text style={s.certification}>{coach.certification}</Text>
          )}

          {/* One badge, not two. In the unverified state a prominent overlay
              badge plus an inline one reads as an accusation; a single muted,
              tappable chip reads as a fact the user can ask about. */}
          <TouchableOpacity
            style={[s.badge, coach.identityVerified ? s.badgeOn : s.badgeOff]}
            activeOpacity={0.75}
            onPress={() => setVerifyTip(true)}
            accessibilityRole="button"
            accessibilityLabel={coach.identityVerified ? 'Identity verified. Learn more' : 'Not yet verified. Learn more'}
          >
            <Ionicons
              name={coach.identityVerified ? 'shield-checkmark' : 'shield-outline'}
              size={13}
              color={coach.identityVerified ? '#2563EB' : L.textSub}
            />
            <Text style={[s.badgeText, coach.identityVerified ? s.badgeTextOn : s.badgeTextOff]}>
              {coach.identityVerified ? 'Identity Verified' : 'Not yet verified'}
            </Text>
            <Ionicons name="information-circle-outline" size={13} color={coach.identityVerified ? '#2563EB' : L.textSub} />
          </TouchableOpacity>

          {coach.socialLinks.length > 0 && (
            <View style={s.socialRow}>
              {coach.socialLinks.map(link => (
                <TouchableOpacity
                  key={link.key}
                  style={s.socialBtn}
                  activeOpacity={0.75}
                  accessibilityRole="link"
                  accessibilityLabel={link.label}
                  // openURL rejects when nothing can handle the scheme — no
                  // mail client, WhatsApp not installed. Swallowed: the tap
                  // simply does nothing, which beats an error dialog naming a
                  // third-party app the user may have deliberately not got.
                  onPress={() => Linking.openURL(link.url).catch(() => {})}
                >
                  <Ionicons name={link.icon} size={18} color={L.navy} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!!location && (
            <View style={s.locationRow}>
              <Ionicons name="location-outline" size={14} color={L.textSub} />
              <Text style={s.locationText}>{location}</Text>
            </View>
          )}
        </View>

        {/* ── OFFERINGS ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>LESSONS &amp; CLINICS</Text>

          {offers.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="calendar-outline" size={26} color={L.textSub} />
              <Text style={s.emptyCardText}>No lessons available right now.</Text>
            </View>
          ) : (
            offers.map(offer => {
              const typeLabel = OFFER_TYPE_OPTIONS.find(o => o.value === offer.offer_type)?.label ?? offer.offer_type;
              const price = offer.discounted_price_cents ?? offer.regular_price_cents;
              const spots = offer.quantity_remaining;
              return (
                <TouchableOpacity
                  key={offer.id}
                  style={s.offerCard}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/lessons/${offer.id}` as never)}
                >
                  <Image
                    source={offer.images?.[0] ? { uri: offer.images[0].url } : DEFAULT_LESSON_COVER}
                    style={s.offerImage}
                    resizeMode="cover"
                  />
                  <View style={s.offerBody}>
                    <Text style={s.offerType}>{typeLabel.toUpperCase()}</Text>
                    <Text style={s.offerTitle} numberOfLines={2}>{offer.title}</Text>
                    <View style={s.offerFooter}>
                      <Text style={s.offerPrice}>{formatPriceCents(price)}</Text>
                      {spots != null && spots > 0 && (
                        <Text style={s.offerSpots}>{spots} left</Text>
                      )}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={L.textSub} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* ── ABOUT ── */}
        {!!coach.bio?.trim() && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>ABOUT</Text>
            <Text style={s.bio} numberOfLines={bioExpanded ? undefined : 4}>{coach.bio}</Text>
            {coach.bio.length > 180 && (
              <TouchableOpacity onPress={() => setBioExpanded(v => !v)} activeOpacity={0.7}>
                <Text style={s.readMore}>{bioExpanded ? 'Show less' : 'Read more'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      <InfoTooltip
        visible={verifyTip}
        onClose={() => setVerifyTip(false)}
        icon={coach.identityVerified ? 'shield-checkmark-outline' : 'shield-outline'}
        title={coach.identityVerified ? 'Identity Verified' : 'Not yet verified'}
        // States what was actually checked, and what was not. "Verified Coach"
        // would imply vetted credentials — certifications, background checks,
        // insurance — none of which are checked anywhere.
        body={coach.identityVerified
          ? `${coach.fullName} has confirmed their identity with Stripe, our payment provider, and can receive payouts.`
          : `${coach.fullName} hasn't completed identity verification with our payment provider yet. They can still offer lessons — verification confirms who they are and lets them receive payouts.`}
        footer="Verification confirms identity, not coaching credentials."
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 10 },

  cover: { height: COVER_H, width: '100%', position: 'relative', overflow: 'hidden' },
  coverImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: COVER_H },
  coverFallback: { backgroundColor: L.navy },
  coverControls: {
    position: 'absolute', top: 0, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  circleBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },

  identity: { alignItems: 'center', marginTop: -(AVATAR / 2), paddingHorizontal: 20, gap: 8 },
  avatarWrap: { borderRadius: AVATAR / 2, borderWidth: 4, borderColor: L.page, backgroundColor: L.page },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  avatarFallback: { backgroundColor: L.bg, alignItems: 'center', justifyContent: 'center' },
  name: { color: L.navy, fontSize: text.cardTitle.size, fontWeight: '800', textAlign: 'center' },
  certification: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center' },
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 },
  socialBtn: {
    width: 40, height: 40, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border, backgroundColor: L.bg,
    alignItems: 'center', justifyContent: 'center',
  },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: shape.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1,
  },
  badgeOn: { backgroundColor: '#DBEAFE', borderColor: '#BFDBFE' },
  badgeOff: { backgroundColor: L.bg, borderColor: L.border },
  badgeText: { fontSize: text.chipValue.size, fontWeight: '800' },
  badgeTextOn: { color: '#2563EB' },
  badgeTextOff: { color: L.textSub },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },

  section: { paddingHorizontal: 16, marginTop: 22, gap: 10 },
  sectionTitle: { color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing },

  offerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderRadius: shape.card,
    borderWidth: 1, borderColor: L.border, padding: 10,
  },
  offerImage: { width: 76, height: 60, borderRadius: shape.cta },
  offerBody: { flex: 1, gap: 2 },
  offerType: { color: L.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  offerTitle: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  offerFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  offerPrice: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  offerSpots: { color: L.textSub, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },

  bio: { color: L.text, fontSize: text.body.size, fontWeight: '500', lineHeight: 21 },
  readMore: { color: L.gold, fontSize: text.link.size, fontWeight: '700' },

  emptyCard: {
    alignItems: 'center', gap: 8, paddingVertical: 26,
    backgroundColor: L.bg, borderRadius: shape.card, borderWidth: 1, borderColor: L.border,
  },
  emptyCardText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },

  emptyTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  emptyBody: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center' },
  emptyBtn: { marginTop: 6, borderRadius: shape.cta, borderWidth: 1.5, borderColor: L.gold, paddingHorizontal: 20, paddingVertical: 10 },
  emptyBtnText: { color: L.gold, fontSize: text.action.size, fontWeight: '800' },
});
