import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Switch, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { supabase } from '@/lib/supabase';
import { useSupportContext } from '@/lib/support/supportContext';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold, goldBg: colors.goldBg, goldLight: colors.goldLight,
  text: colors.text, textSub: colors.textSub, border: colors.border,
  success: colors.success,
};

const GAME_TYPES = ["Men's Singles", "Women's Singles", "Men's Doubles", "Women's Doubles", 'Mixed Doubles', 'Community Play'];
const SKILL_RANGES = ['3.0–3.5', '3.5–4.0', '4.0–4.5', '4.5–5.0', '5.0+'];
const DISTANCE_STEPS = ['5 mi', '25 mi', '50 mi', '100+ mi'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIMES = ['Early Morning', 'Morning', 'Afternoon', 'Evening', 'Night'];
const GENDERS = ['No Preference', 'Men', 'Women', 'Non-binary'];
const AGES = ['No Preference', '18–25', '26–35', '36–45', '46–55', '55+'];

function SectionLabel({ label }: { label: string }) {
  return <Text style={sl.label}>{label}</Text>;
}
const sl = StyleSheet.create({
  label: { color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing, marginBottom: 10, marginTop: 4 },
});

function ChipGroup({ options, selected, onToggle, multi = true }: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  multi?: boolean;
}) {
  return (
    <View style={cg.row}>
      {options.map(o => {
        const active = selected.includes(o);
        return (
          <TouchableOpacity
            key={o}
            style={[cg.chip, active && cg.chipActive]}
            onPress={() => onToggle(o)}
          >
            {active && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
            <Text style={[cg.text, active && cg.textActive]}>{o}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const cg = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: shape.pill, borderWidth: 1.5, borderColor: L.border,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: L.bg,
  },
  chipActive: { backgroundColor: L.navy, borderColor: L.navy },
  text: { color: L.textSub, fontSize: text.controlLabel.size, fontWeight: '700' },
  textActive: { color: '#FFFFFF' },
});

export default function PartnerPreferencesScreen() {
  const insets = useSafeAreaInsets();

  // Measured rather than hardcoded so the floating support button clears
  // this bar even if its height changes. The safe-area inset is subtracted
  // because the button applies that itself - reporting the raw height would
  // count it twice - and rounded because the support registry re-registers
  // on any change to the serialized context.
  const [barHeight, setBarHeight] = useState(0);

  useSupportContext({ feature: 'match', bottomClearance: barHeight });

  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [activelyLooking, setActivelyLooking] = useState(true);
  const [gameTypes, setGameTypes]       = useState<string[]>(['Mixed Doubles']);
  const [skillRanges, setSkillRanges]   = useState<string[]>(['3.5–4.0', '4.0–4.5']);
  const [distanceIdx, setDistanceIdx]   = useState(1);
  const [days, setDays]                 = useState<string[]>(['Sat', 'Sun']);
  const [times, setTimes]               = useState<string[]>(['Morning', 'Afternoon']);
  const [gender, setGender]             = useState<string[]>(['No Preference']);
  const [age, setAge]                   = useState<string[]>(['No Preference']);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from('partner_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled || !data) { setLoading(false); return; }
      setActivelyLooking(data.actively_looking);
      setGameTypes(data.game_types);
      setSkillRanges(data.skill_ranges);
      setDistanceIdx(data.distance_idx);
      setDays(data.preferred_days);
      setTimes(data.preferred_times);
      setGender([data.gender_preference]);
      setAge([data.age_preference]);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  function toggle(val: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(val) ? list.filter(x => x !== val) : [...list, val]);
  }
  function singleToggle(val: string, list: string[], setList: (v: string[]) => void) {
    setList([val]);
  }

  async function handleSave() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('partner_preferences').upsert({
        user_id:           user.id,
        actively_looking:  activelyLooking,
        game_types:        gameTypes,
        skill_ranges:      skillRanges,
        distance_idx:      distanceIdx,
        preferred_days:    days,
        preferred_times:   times,
        gender_preference: gender[0] ?? 'No Preference',
        age_preference:    age[0] ?? 'No Preference',
      });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); router.back(); }, 1200);
  }

  if (loading) {
    return (
      <View style={[s.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={L.navy} />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.title}>Partner Preferences</Text>
          <Text style={s.subtitle}>Customize who shows up in your feed.</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 120 }]}
      >
        {/* Active status */}
        <View style={s.card}>
          <View style={s.switchRow}>
            <View style={s.switchInfo}>
              <View style={s.switchLabelRow}>
                <View style={[s.statusDot, { backgroundColor: activelyLooking ? L.success : L.textSub }]} />
                <Text style={s.switchLabel}>Actively Looking</Text>
              </View>
              <Text style={s.switchSub}>
                {activelyLooking ? 'Your profile is visible in the Partner Finder.' : 'Your profile is hidden from the Partner Finder.'}
              </Text>
            </View>
            <Switch
              value={activelyLooking}
              onValueChange={setActivelyLooking}
              trackColor={{ false: L.border, true: L.gold }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Game type */}
        <SectionLabel label="LOOKING FOR" />
        <View style={s.card}>
          <View style={s.cardPad}>
            <ChipGroup
              options={GAME_TYPES}
              selected={gameTypes}
              onToggle={(v) => toggle(v, gameTypes, setGameTypes)}
            />
          </View>
        </View>

        {/* Skill range */}
        <SectionLabel label="SKILL RANGE" />
        <View style={s.card}>
          <View style={s.cardPad}>
            <ChipGroup
              options={SKILL_RANGES}
              selected={skillRanges}
              onToggle={(v) => toggle(v, skillRanges, setSkillRanges)}
            />
          </View>
        </View>

        {/* Distance */}
        <SectionLabel label="MAX DISTANCE" />
        <View style={s.card}>
          <View style={s.cardPad}>
            <View style={s.distRow}>
              {DISTANCE_STEPS.map((d, i) => (
                <TouchableOpacity
                  key={d}
                  style={[s.distStep, i === distanceIdx && s.distStepActive]}
                  onPress={() => setDistanceIdx(i)}
                >
                  <Text style={[s.distText, i === distanceIdx && s.distTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Visual bar */}
            <View style={s.distBar}>
              <View style={[s.distFill, { width: `${((distanceIdx + 1) / DISTANCE_STEPS.length) * 100}%` }]} />
            </View>
          </View>
        </View>

        {/* Availability */}
        <SectionLabel label="AVAILABILITY — DAYS" />
        <View style={s.card}>
          <View style={s.cardPad}>
            <ChipGroup
              options={DAYS}
              selected={days}
              onToggle={(v) => toggle(v, days, setDays)}
            />
          </View>
        </View>

        <SectionLabel label="AVAILABILITY — TIMES" />
        <View style={s.card}>
          <View style={s.cardPad}>
            <ChipGroup
              options={TIMES}
              selected={times}
              onToggle={(v) => toggle(v, times, setTimes)}
            />
          </View>
        </View>

        {/* Gender preference */}
        <SectionLabel label="GENDER PREFERENCE" />
        <View style={s.card}>
          <View style={s.cardPad}>
            <ChipGroup
              options={GENDERS}
              selected={gender}
              onToggle={(v) => singleToggle(v, gender, setGender)}
              multi={false}
            />
          </View>
        </View>

        {/* Age preference */}
        <SectionLabel label="AGE PREFERENCE" />
        <View style={s.card}>
          <View style={s.cardPad}>
            <ChipGroup
              options={AGES}
              selected={age}
              onToggle={(v) => singleToggle(v, age, setAge)}
              multi={false}
            />
          </View>
        </View>
      </ScrollView>

      {/* Sticky Save */}
      <View
        style={[s.footer, { paddingBottom: insets.bottom + 16 }]}
        onLayout={e => {
          const h = Math.round(Math.max(0, e.nativeEvent.layout.height - insets.bottom));
          setBarHeight(prev => (prev === h ? prev : h));
        }}
      >
        <TouchableOpacity style={[s.saveBtn, saved && s.saveBtnDone]} onPress={handleSave} activeOpacity={0.85} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : saved ? (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
              <Text style={s.saveBtnText}>Preferences Saved!</Text>
            </>
          ) : (
            <Text style={s.saveBtnText}>Save Preferences</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.screenH, paddingVertical: 12,
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1 },
  title: { color: L.navy, fontSize: text.modalTitle.size, fontWeight: '900' },
  subtitle: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },

  scroll: { padding: spacing.screenH, paddingTop: 20 },

  card: {
    backgroundColor: L.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border, marginBottom: 4,
    overflow: 'hidden',
  },
  cardPad: { padding: 14 },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16,
  },
  switchInfo: { flex: 1, gap: 3 },
  switchLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  switchLabel: { color: L.navy, fontSize: text.body.size, fontWeight: '500' },
  switchSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 17 },

  distRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  distStep: {
    flex: 1, borderRadius: shape.cta, borderWidth: 1.5, borderColor: L.border,
    paddingVertical: 8, alignItems: 'center', backgroundColor: L.page,
  },
  distStepActive: { backgroundColor: L.navy, borderColor: L.navy },
  distText: { color: L.textSub, fontSize: text.controlLabel.size, fontWeight: '700' },
  distTextActive: { color: '#FFFFFF' },
  distBar: { height: 4, backgroundColor: L.page, borderRadius: 2, overflow: 'hidden' },
  distFill: { height: '100%', backgroundColor: L.gold, borderRadius: 2 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: L.bg, borderTopWidth: 1, borderTopColor: L.border,
    paddingHorizontal: spacing.screenH, paddingTop: 14,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 16,
  },
  saveBtnDone: { backgroundColor: L.success },
  saveBtnText: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800' },
});
