import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Pressable, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

export const DISTANCE_STEPS = ['5 mi', '25 mi', '50 mi', 'Any distance'];

// [min, max] — max is null for open-ended "4.5+".
export const SKILL_RANGES: { label: string; min: number; max: number | null }[] = [
  { label: '3.0 – 3.5', min: 3.0, max: 3.5 },
  { label: '3.5 – 4.0', min: 3.5, max: 4.0 },
  { label: '4.0 – 4.5', min: 4.0, max: 4.5 },
  { label: '4.5+',      min: 4.5, max: null },
];

export type FindGamesFilterModalProps = {
  visible: boolean;
  distanceIdx: number;
  onChangeDistanceIdx: (idx: number) => void;
  selectedSkillLabels: string[];
  onToggleSkillLabel: (label: string) => void;
  hideFullGames: boolean;
  onChangeHideFullGames: (value: boolean) => void;
  onClose: () => void;
};

export function FindGamesFilterModal({
  visible,
  distanceIdx,
  onChangeDistanceIdx,
  selectedSkillLabels,
  onToggleSkillLabel,
  hideFullGames,
  onChangeHideFullGames,
  onClose,
}: FindGamesFilterModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.grabber} />

          <View style={s.headerRow}>
            <Text style={s.title}>Customize Find Games</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.navy} />
            </TouchableOpacity>
          </View>

          <Text style={s.sectionLabel}>MAX DISTANCE</Text>
          <View style={s.distRow}>
            {DISTANCE_STEPS.map((label, i) => {
              const active = i === distanceIdx;
              return (
                <TouchableOpacity
                  key={label}
                  style={[s.distStep, active && s.distStepActive]}
                  onPress={() => onChangeDistanceIdx(i)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.distText, active && s.distTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={s.hint}>Applies to Community Play near you.</Text>

          <Text style={s.sectionLabel}>SKILL LEVEL</Text>
          <View style={s.distRow}>
            {SKILL_RANGES.map((range) => {
              const active = selectedSkillLabels.includes(range.label);
              return (
                <TouchableOpacity
                  key={range.label}
                  style={[s.distStep, active && s.distStepActive]}
                  onPress={() => onToggleSkillLabel(range.label)}
                  activeOpacity={0.8}
                >
                  {active && <Ionicons name="checkmark" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />}
                  <Text style={[s.distText, active && s.distTextActive]}>{range.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={s.hint}>Leave blank to see all skill levels. Games with no skill range set always show.</Text>

          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Hide Full Games</Text>
              <Text style={s.toggleSub}>Only show games with open spots</Text>
            </View>
            <Switch
              value={hideFullGames}
              onValueChange={onChangeHideFullGames}
              trackColor={{ false: colors.border, true: colors.gold }}
              thumbColor="#FFFFFF"
            />
          </View>

          <TouchableOpacity style={s.applyBtn} onPress={onClose} activeOpacity={0.88}>
            <Text style={s.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 32,
  },
  grabber: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: { color: colors.navy, fontSize: text.modalTitle.size, fontWeight: '900' },
  sectionLabel: {
    color: colors.navy, fontSize: text.sectionLabel.size, fontWeight: '800',
    letterSpacing: text.sectionLabel.letterSpacing, marginBottom: 10, marginTop: 4,
  },
  distRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  distStep: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: shape.pill, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.page,
  },
  distStepActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  distText: { color: colors.textSub, fontSize: text.controlLabel.size, fontWeight: '700' },
  distTextActive: { color: '#FFFFFF' },
  hint: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', marginBottom: 20 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, marginBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  toggleLabel: { color: colors.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  toggleSub: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
  applyBtn: {
    backgroundColor: colors.gold, borderRadius: shape.cta,
    paddingVertical: 15, alignItems: 'center',
  },
  applyBtnText: { color: colors.navy, fontSize: text.actionLarge.size, fontWeight: '800' },
});
