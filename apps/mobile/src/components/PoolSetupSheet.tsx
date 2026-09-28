import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { POOL_LETTERS } from '@/lib/poolSchedule';

/**
 * Pool setup for one division (Pool Play → Bracket). Teams go into pools
 * automatically by rating (snake order). The director picks how many pools
 * and how many advance from each (default 2).
 */
export function PoolSetupSheet({
  visible,
  onClose,
  divisionName,
  teamCount,
  defaultPoolCount,
  defaultAdvance,
  hasScores,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  divisionName: string;
  teamCount: number;
  defaultPoolCount: number;
  defaultAdvance: number;
  /** Existing pools already have scores: regenerating wipes them. */
  hasScores: boolean;
  onConfirm: (poolCount: number, advancePerPool: number) => Promise<void>;
}) {
  const maxPools = Math.max(1, Math.min(Math.floor(teamCount / 2), POOL_LETTERS.length));
  const [pools, setPools] = useState(defaultPoolCount);
  const [advance, setAdvance] = useState(defaultAdvance);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setPools(Math.min(Math.max(1, defaultPoolCount), maxPools));
      setAdvance(defaultAdvance);
    }
  }, [visible, defaultPoolCount, defaultAdvance, maxPools]);

  // Snake distribution sizes: the first (teams % pools) pools get one extra.
  const base = Math.floor(teamCount / pools);
  const extra = teamCount % pools;
  const sizes = extra === 0
    ? `${pools} ${pools === 1 ? 'pool' : 'pools'} of ${base}`
    : `${extra} of ${base + 1} and ${pools - extra} of ${base}`;
  const maxAdvance = Math.max(1, base);
  const advanceClamped = Math.min(advance, maxAdvance);
  const matchesIn = (n: number) => (n * (n - 1)) / 2;
  const totalMatches = extra * matchesIn(base + 1) + (pools - extra) * matchesIn(base);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(pools, advanceClamped);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={st.anchor} pointerEvents="box-none">
        <View style={st.sheet}>
          <View style={st.grabber} />
          <Text style={st.title}>Pool play · {divisionName}</Text>
          <Text style={st.sub}>
            {teamCount} teams, placed in pools by rating (snake order). Everyone in a pool plays everyone else.
          </Text>

          <Stepper label="Pools" value={pools} min={1} max={maxPools} onChange={setPools} />
          <Stepper label="Advance per pool" value={advanceClamped} min={1} max={maxAdvance} onChange={setAdvance} />

          <View style={st.preview}>
            <Ionicons name="grid-outline" size={14} color={colors.navy} />
            <Text style={st.previewText}>
              {sizes} · {totalMatches} matches · top {advanceClamped} of each pool ({advanceClamped * pools} teams) go on
              to the bracket
            </Text>
          </View>

          {hasScores && (
            <View style={st.warn}>
              <Ionicons name="warning-outline" size={14} color={colors.danger} />
              <Text style={st.warnText}>
                These pools already have scores. Regenerating deletes every pool match and result.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[st.primary, busy && { opacity: 0.7 }]}
            onPress={confirm}
            disabled={busy}
            activeOpacity={0.88}
          >
            {busy
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={st.primaryText}>{hasScores ? 'Delete results and regenerate' : 'Generate pools'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={st.cancel} onPress={onClose} activeOpacity={0.7}>
            <Text style={st.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Stepper({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={st.stepRow}>
      <Text style={st.stepLabel}>{label}</Text>
      <View style={st.stepper}>
        <TouchableOpacity
          style={[st.stepBtn, value <= min && { opacity: 0.4 }]}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - 1))}
          accessibilityLabel={`Fewer: ${label}`}
        >
          <Ionicons name="remove" size={18} color={colors.navy} />
        </TouchableOpacity>
        <Text style={st.stepValue}>{value}</Text>
        <TouchableOpacity
          style={[st.stepBtn, value >= max && { opacity: 0.4 }]}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + 1))}
          accessibilityLabel={`More: ${label}`}
        >
          <Ionicons name="add" size={18} color={colors.navy} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,18,40,0.45)' },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: shape.card + 8, borderTopRightRadius: shape.card + 8,
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxxl,
  },
  grabber: {
    width: 38, height: 4, borderRadius: 2, alignSelf: 'center',
    backgroundColor: colors.border, marginBottom: spacing.lg,
  },
  title: { color: colors.navy, fontSize: text.modalTitle.size, fontWeight: '900', marginBottom: 4 },
  sub: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 18, marginBottom: spacing.lg },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  stepLabel: { color: colors.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  stepValue: { color: colors.navy, fontSize: text.titleSm.size, fontWeight: '900', minWidth: 22, textAlign: 'center' },
  preview: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: spacing.lg,
    padding: spacing.md, borderRadius: shape.cta, backgroundColor: colors.page,
  },
  previewText: { flex: 1, color: colors.navy, fontSize: text.caption.size, fontWeight: '600', lineHeight: 18 },
  warn: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: spacing.md,
    padding: spacing.md, borderRadius: shape.cta, backgroundColor: colors.dangerBg,
  },
  warnText: { flex: 1, color: colors.danger, fontSize: text.caption.size, fontWeight: '600', lineHeight: 18 },
  primary: {
    marginTop: spacing.xl, backgroundColor: colors.navy, borderRadius: shape.cta,
    paddingVertical: 14, alignItems: 'center',
  },
  primaryText: { color: colors.white, fontSize: text.action.size, fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: colors.textSub, fontSize: text.action.size, fontWeight: '800' },
});
