import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Line, Polygon, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
import { radius as shape, text, lessonTypeTint, LESSON_TYPE_TINT_FALLBACK } from '@shared/tokens';
import { OFFER_TYPE_OPTIONS, formatPriceCents, discountPercent, effectiveOfferPrice } from '@/lib/coach/constants';
import { travelAreaLabel, type BrowseLesson } from '@/lib/coach/offers';

// One lesson in the Lesson Marketplace list (owner-approved redesign,
// 2026-10-04). Header: the lesson's photo when it has one; otherwise a drawn
// court with a gold ball on the lesson type's tint (lessonTypeTint) — most
// lessons have no photo (1 of 27), so the illustration is the normal case,
// not a fallback that looks broken. Type lives in the badge only, so the coach
// line reads "with …". Price is large and heavy in the body face, never
// condensed (owner dislikes condensed type).

const HEADER_H = 150;

function CourtArt({ tint }: { tint: string }) {
  // A court seen at a slight angle; lines in translucent white over the tint.
  const line = { stroke: 'rgba(255,255,255,0.32)', strokeWidth: 3 };
  return (
    <Svg width="100%" height="100%" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice">
      <Polygon points="0,0 400,0 400,150 0,150" fill={tint} />
      <Polygon points="40,18 372,0 388,152 52,170" fill="none" {...line} />
      <Line x1="206" y1="9" x2="220" y2="161" {...line} />
      <Line x1="46" y1="72" x2="380" y2="52" {...line} />
      <Line x1="49" y1="116" x2="384" y2="98" stroke="rgba(255,255,255,0.55)" strokeWidth={4} />
      <Circle cx="340" cy="34" r="16" fill={colors.gold} />
    </Svg>
  );
}

function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '·';
}

export function LessonCard({ item, isMember, onPress }: { item: BrowseLesson; isMember: boolean; onPress: () => void }) {
  const typeLabel = OFFER_TYPE_OPTIONS.find((o) => o.value === item.offer_type)?.label ?? item.offer_type;
  const tint = (lessonTypeTint as Record<string, string>)[item.offer_type] ?? LESSON_TYPE_TINT_FALLBACK;
  const price = effectiveOfferPrice(item, isMember);
  const off = discountPercent(item.regular_price_cents, price.cents);
  const travel = travelAreaLabel(item);
  const miles = item.distance_miles != null ? `${item.distance_miles} mi` : null;
  const place = item.facility_name
    ? [miles && !travel ? miles : null, item.facility_name, [item.city, item.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
    : null;

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${typeLabel} with ${item.coach_name ?? 'a coach'}, ${formatPriceCents(price.cents)}`}
    >
      <View style={s.header}>
        {item.photo_url
          ? <Image source={{ uri: item.photo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <CourtArt tint={tint} />}
        <View style={s.badge}><Text style={s.badgeText}>{typeLabel}</Text></View>
        {item.premium_only && <View style={s.premium}><Text style={s.premiumText}>MEMBERS</Text></View>}
      </View>

      <View style={s.body}>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>

        <View style={s.coachRow}>
          {item.coach_avatar_url
            ? <Image source={{ uri: item.coach_avatar_url }} style={s.avatar} />
            : <View style={[s.avatar, s.avatarInitials]}><Text style={s.initials}>{initials(item.coach_name)}</Text></View>}
          <Text style={s.coach} numberOfLines={1}>with {item.coach_name ?? 'a coach'}</Text>
        </View>

        {!!place && (
          <View style={s.metaRow}>
            <Ionicons name="location-outline" size={15} color={colors.textSub} />
            <Text style={s.meta} numberOfLines={1}>{place}</Text>
          </View>
        )}
        {!!travel && (
          <View style={s.metaRow}>
            <Ionicons name="car-outline" size={15} color={colors.navy} />
            <Text style={[s.meta, s.travel]} numberOfLines={1}>{miles && !place ? `${miles} · ` : ''}{travel}</Text>
          </View>
        )}

        <View style={s.priceRow}>
          {item.regular_price_cents > price.cents && (
            <Text style={s.was}>{formatPriceCents(item.regular_price_cents)}</Text>
          )}
          <Text style={s.price}>{formatPriceCents(price.cents)}</Text>
          {off > 0 && <View style={s.offPill}><Text style={s.offText}>{off}% OFF</Text></View>}
          <View style={{ flex: 1 }} />
          <Ionicons name="chevron-forward" size={20} color={colors.textSub} />
        </View>

        {!price.isMemberPrice && item.premium_price_cents != null && (
          <View style={s.memberRow}>
            <Ionicons name="star" size={14} color={colors.goldDeep} />
            <Text style={s.memberText}>Members pay {formatPriceCents(item.premium_price_cents)}</Text>
          </View>
        )}
        {price.isMemberPrice && (
          <View style={s.memberRow}>
            <Ionicons name="star" size={14} color={colors.goldDeep} />
            <Text style={s.memberText}>Your member price</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.bg, borderRadius: shape.card, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    shadowColor: colors.navy, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  header: { height: HEADER_H, backgroundColor: colors.navy },
  badge: {
    position: 'absolute', top: 14, left: 14,
    backgroundColor: 'rgba(10,18,40,0.85)', borderRadius: shape.badge, paddingHorizontal: 10, paddingVertical: 5,
  },
  badgeText: {
    color: colors.white, fontSize: text.cardLabel.size, fontWeight: '800',
    letterSpacing: text.cardLabel.letterSpacing, textTransform: 'uppercase',
  },
  premium: {
    position: 'absolute', top: 14, right: 14,
    backgroundColor: colors.gold, borderRadius: shape.badge, paddingHorizontal: 8, paddingVertical: 5,
  },
  premiumText: { color: colors.navy, fontSize: text.microLabel.size, fontWeight: '800' },

  body: { padding: spacing.md, gap: 8 },
  title: { color: colors.navy, fontSize: text.cardTitle.size, lineHeight: text.cardTitle.lineHeight, fontWeight: '800' },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 30, height: 30, borderRadius: 15 },
  avatarInitials: { backgroundColor: colors.goldLight, alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.navy, fontSize: text.microLabel.size, fontWeight: '800' },
  coach: { flex: 1, color: colors.textSub, fontSize: text.body.size, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { flex: 1, color: colors.textSub, fontSize: text.caption.size, fontWeight: '500' },
  travel: { color: colors.navy, fontWeight: '600' },

  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  was: { color: colors.textSub, fontSize: text.body.size, fontWeight: '500', textDecorationLine: 'line-through' },
  price: { color: colors.navy, fontSize: text.statNumber.size, fontWeight: '900', letterSpacing: -0.5 },
  offPill: { backgroundColor: colors.goldLight, borderRadius: shape.badge, paddingHorizontal: 8, paddingVertical: 4 },
  offText: { color: colors.goldDeep, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberText: { color: colors.goldDeep, fontSize: text.caption.size, fontWeight: '700' },
});
