import React, { useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PickleballIcon } from '@/components/PickleballIcon';
import { goBack } from '@/lib/navigation';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

// Theme-backed alias — brand values resolve from @/theme.
const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  blue:       '#007AFF',
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldBorder: colors.goldBorder,
  text:       colors.text,
  textSub:    colors.textSub,
  textMuted:  colors.textSub,
  border:     colors.border,
  div:        colors.border,
  green:      colors.success,
  greenBg:    colors.successBg,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return <Text style={s.sectionHeader}>{label}</Text>;
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={s.group}>{children}</View>;
}

function Div() {
  return <View style={s.div} />;
}

// ─── DUPR logo box ────────────────────────────────────────────────────────────

function DUPRBox({ size = 46 }: { size?: number }) {
  return (
    <View style={[s.duprBox, { width: size, height: size, borderRadius: size * 0.22 }]}>
      <Text style={[s.duprText, { fontSize: size * 0.26 }]}>DUPR</Text>
    </View>
  );
}

// ─── Gold icon circle ─────────────────────────────────────────────────────────

function IconCircle({ name }: { name: string }) {
  return (
    <View style={s.iconCircle}>
      <Ionicons name={name as never} size={18} color={L.gold} />
    </View>
  );
}

function PARBox() {
  return (
    <View style={s.parBox}>
      <PickleballIcon size={24} color={L.gold} />
    </View>
  );
}

// ─── Rating row (tappable, right-aligned value + chevron) ────────────────────

function RatingRow({
  left, label, sub, value, last, connected, comingSoon,
}: {
  left: React.ReactNode; label: string; sub?: string;
  value?: string; last?: boolean; connected?: boolean;
  /** Renders a pill instead of a value, and no chevron — nothing to open. */
  comingSoon?: boolean;
}) {
  // A plain View when there is nowhere to go: a TouchableOpacity that dims on
  // press and then does nothing reads as a broken link.
  const Row = comingSoon ? View : TouchableOpacity;
  return (
    <>
      <Row style={s.row} activeOpacity={comingSoon ? undefined : 0.7}>
        {left}
        <View style={s.rowCenter}>
          <Text style={s.rowLabel}>{label}</Text>
          {sub && (
            <View style={s.connectedRow}>
              {connected ? (
                <>
                  <Ionicons name="checkmark-circle" size={13} color={L.green} />
                  <Text style={s.connectedText}>{sub}</Text>
                </>
              ) : (
                <Text style={s.rowSub}>{sub}</Text>
              )}
            </View>
          )}
        </View>
        {comingSoon ? (
          <View style={s.comingSoonPill}>
            <Text style={s.comingSoonText}>COMING SOON</Text>
          </View>
        ) : (
          <>
            <Text style={s.ratingValue}>{value}</Text>
            <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
          </>
        )}
      </Row>
      {!last && <Div />}
    </>
  );
}

// ─── Toggle row with icon circle ──────────────────────────────────────────────

function ToggleRow({
  icon, label, sub, value, onChange, last,
}: {
  icon: string; label: string; sub: string;
  value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <>
      <View style={s.row}>
        <IconCircle name={icon} />
        <View style={s.rowCenter}>
          <Text style={s.rowLabel}>{label}</Text>
          <Text style={s.rowSub}>{sub}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: '#D1D1D6', true: L.green }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#D1D1D6"
        />
      </View>
      {!last && <Div />}
    </>
  );
}

// ─── Tappable nav row ─────────────────────────────────────────────────────────

function NavRow({ icon, label, sub, last }: { icon: string; label: string; sub: string; last?: boolean }) {
  return (
    <>
      <TouchableOpacity style={s.row} activeOpacity={0.7}>
        <IconCircle name={icon} />
        <View style={s.rowCenter}>
          <Text style={s.rowLabel}>{label}</Text>
          <Text style={s.rowSub}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
      </TouchableOpacity>
      {!last && <Div />}
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RatingSettingsScreen() {
  const insets = useSafeAreaInsets();
  // self_rating is real: collected at onboarding/self-rating.tsx, editable in
  // edit-profile, stored as TEXT on profiles. It was hardcoded "4.0" here while
  // the account header two screens away read the actual value.
  const { profile } = useProfile();

  // Skill preferences
  const [higherRated,  setHigherRated]  = useState(true);
  const [similarSkill, setSimilarSkill] = useState(true);
  const [lowerRated,   setLowerRated]   = useState(false);

  // Profile visibility
  const [showDUPR,          setShowDUPR]          = useState(true);
  const [showSelfRating,    setShowSelfRating]    = useState(false);
  const [officialRatingFirst,setOfficialFirst]    = useState(true);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.blue} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Player Rating</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* Intro */}
        <Text style={s.intro}>
          Manage your ratings, preferences, and how your skill level is used across Pickleball App.
        </Text>

        {/* ── Rating Overview ── */}
        <SectionHeader label="RATING OVERVIEW" />
        <Group>
          <RatingRow
            left={<PARBox />}
            label="PAR Rating"
            sub="Building from your Pickleball App activity"
            value="Building"
          />
          {/* Matches the RATING SOURCE card below: there is no DUPR
              integration, so no value and nothing to tap. */}
          <RatingRow
            left={<View style={s.sourceLogoMuted}><DUPRBox /></View>}
            label="Official DUPR Rating"
            sub="Not connected yet"
            comingSoon
          />
          <RatingRow
            left={
              <View style={s.selfIconBox}>
                <Ionicons name="person" size={20} color="#FFFFFF" />
              </View>
            }
            label="Self Rating"
            sub="Your playing level"
            value={profile?.self_rating ?? 'Not set'}
            last
          />
        </Group>

        {/* ── Skill Preferences ── */}
        <SectionHeader label="SKILL PREFERENCES" />
        <Group>
          {/* Preferred Skill Range — tappable row */}
          <TouchableOpacity style={s.row} activeOpacity={0.7}>
            <IconCircle name="options-outline" />
            <View style={s.rowCenter}>
              <Text style={s.rowLabel}>Preferred Skill Range</Text>
              <Text style={s.rowSub}>Players you want to play with</Text>
            </View>
            <Text style={s.rangeValue}>3.5 – 4.5</Text>
            <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
          </TouchableOpacity>
          <Div />
          <ToggleRow
            icon="arrow-up-circle-outline"
            label="Allow Higher Rated Matches"
            sub="Play with players rated higher than you"
            value={higherRated}
            onChange={setHigherRated}
          />
          <ToggleRow
            icon="remove-circle-outline"
            label="Allow Similar Skill Matches"
            sub="Play with players close to your rating"
            value={similarSkill}
            onChange={setSimilarSkill}
          />
          <ToggleRow
            icon="arrow-down-circle-outline"
            label="Allow Lower Rated Matches"
            sub="Play with players rated lower than you"
            value={lowerRated}
            onChange={setLowerRated}
            last
          />
        </Group>

        {/* ── Profile Visibility ── */}
        <SectionHeader label="PROFILE VISIBILITY" />
        <Group>
          <ToggleRow
            icon="eye-outline"
            label="Show DUPR Rating"
            sub="Display your official rating on your profile"
            value={showDUPR}
            onChange={setShowDUPR}
          />
          <ToggleRow
            icon="person-outline"
            label="Show Self Rating"
            sub="Display your self rating on your profile"
            value={showSelfRating}
            onChange={setShowSelfRating}
          />
          <ToggleRow
            icon="shield-checkmark-outline"
            label="Use Official Rating First"
            sub="Show DUPR first when both are available"
            value={officialRatingFirst}
            onChange={setOfficialFirst}
            last
          />
        </Group>

        {/* ── Rating Source ── */}
        <SectionHeader label="RATING SOURCE" />
        <Group>
          {/* There is no DUPR integration. `profiles.dupr` and `dupr_history`
              exist and are empty (0 verified, 0 history rows), so "Connected",
              the 4.12 and the June 2026 date were all literals. "Manage DUPR"
              was a TouchableOpacity with no onPress. Says "coming soon" and
              does nothing, visibly, until the integration is real. */}
          <View style={s.sourceCard}>
            <View style={s.sourceLogoMuted}>
              <DUPRBox size={52} />
            </View>
            <View style={s.sourceInfo}>
              <Text style={s.sourceTitle}>Official DUPR</Text>
              <Text style={s.sourceDate}>
                Connect your DUPR rating and keep it in step with your profile.
              </Text>
            </View>
            <View style={s.comingSoonPill}>
              <Text style={s.comingSoonText}>COMING SOON</Text>
            </View>
          </View>
        </Group>

        {/* ── About ── */}
        <SectionHeader label="ABOUT" />
        <Group>
          <NavRow
            icon="information-circle-outline"
            label="How Ratings Work"
            sub="Learn about DUPR and skill levels"
          />
          <NavRow
            icon="help-circle-outline"
            label="Rating FAQ"
            sub="Common questions about ratings"
            last
          />
        </Group>

        {/* Was "Changes are saved automatically", under toggles that are
            useState only — this screen imports no data layer and persists
            nothing. A claim about someone's data has to be true, and that one
            was not. */}
        <View style={s.footer}>
          <Ionicons name="information-circle-outline" size={13} color={L.textMuted} />
          <Text style={s.footerText}>Rating preferences are coming soon</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
    paddingHorizontal: 8, paddingVertical: 12,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minWidth: 80 },
  backText: { color: L.blue, fontSize: 17, fontWeight: '400' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },

  scroll: { padding: 20 },

  // Intro
  intro: {
    color: L.textMuted, fontSize: text.body.size, fontWeight: '500',
    textAlign: 'center', lineHeight: 20, marginBottom: 4,
  },

  // Section header
  sectionHeader: {
    color: L.textMuted, fontSize: text.sectionLabel.size, fontWeight: '800',
    letterSpacing: text.sectionLabel.letterSpacing, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 24, paddingHorizontal: 4,
  },

  // Group
  group: {
    backgroundColor: L.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border, overflow: 'hidden',
  },

  // Divider
  div: { height: StyleSheet.hairlineWidth, backgroundColor: L.div, marginLeft: 68 },

  // Row
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  rowCenter: { flex: 1 },
  rowLabel: { color: L.navy, fontSize: text.body.size, fontWeight: '500', marginBottom: 2 },
  rowSub: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },

  // Connected badge inline
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  connectedText: { color: L.green, fontSize: text.caption.size, fontWeight: '500' },

  // Rating value
  ratingValue: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', marginRight: 4 },

  // Skill range value
  rangeValue: { color: L.gold, fontSize: text.body.size, fontWeight: '500', marginRight: 4 },

  // DUPR logo box
  duprBox: {
    backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  duprText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 0.5 },

  // Self rating icon box
  selfIconBox: {
    width: 46, height: 46, borderRadius: shape.cta,
    backgroundColor: L.gold, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  parBox: {
    width: 46, height: 46, borderRadius: shape.cta,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Icon circle
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Rating source card
  sourceCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 14,
  },
  sourceInfo: { flex: 1 },
  sourceTitle: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800', marginBottom: 3 },
  sourceDate: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', marginTop: 3 },
  // Dimmed, so the logo reads as an upcoming partner rather than a live link.
  sourceLogoMuted: { opacity: 0.45 },
  comingSoonPill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: shape.pill,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
  },
  comingSoonText: {
    color: L.gold, fontSize: text.cardLabel.size, fontWeight: '800',
    letterSpacing: text.cardLabel.letterSpacing,
  },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 28,
  },
  footerText: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },
});
