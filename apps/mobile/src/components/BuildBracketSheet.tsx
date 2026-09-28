import React, { useState } from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import type { BracketPlan } from '@/lib/supabase/pools';

/**
 * Director-confirmed move from pools to the bracket (Pool Play → Bracket,
 * step 2). Shows exactly who is seeded where before anything is written.
 */
export function BuildBracketSheet({
  visible,
  onClose,
  plan,
  rebuilding,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  plan: BracketPlan;
  /** A bracket already exists: building replaces it and its results. */
  rebuilding: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const blocked = plan.unmatched.length > 0;

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
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
          <Text style={st.title}>{rebuilding ? 'Rebuild bracket from pools' : 'Build bracket from pools'}</Text>
          <Text style={st.sub}>
            {plan.seeds.length} teams advance · {plan.byes > 0 ? `${plan.byes} ${plan.byes === 1 ? 'bye' : 'byes'} to the top seeds · ` : ''}
            pool winners seeded first, then runners-up, by pool record. Teams from the same pool don&apos;t meet in the first round.
          </Text>

          <ScrollView style={st.list} contentContainerStyle={{ paddingVertical: 4 }}>
            {plan.seeds.map(sd => (
              <View key={sd.teamKey} style={st.row}>
                <Text style={st.seed}>{sd.seed}</Text>
                <Text style={st.name} numberOfLines={1}>{sd.name}</Text>
                <View style={st.poolTag}>
                  <Text style={st.poolTagText}>{sd.pool}{sd.rank}</Text>
                </View>
                <Text style={st.record}>{sd.wins}W · {sd.diff > 0 ? `+${sd.diff}` : sd.diff}</Text>
              </View>
            ))}
          </ScrollView>

          {plan.cutoffTiePools.length > 0 && (
            <View style={st.warn}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.gold} />
              <Text style={st.warnText}>
                Exact tie at the cut in Pool {plan.cutoffTiePools.join(', ')}: level on wins, head-to-head, point
                difference and points scored. The order shown was decided by the system. Settle it before building if needed.
              </Text>
            </View>
          )}

          {blocked && (
            <View style={[st.warn, st.warnDanger]}>
              <Ionicons name="close-circle-outline" size={14} color={colors.danger} />
              <Text style={[st.warnText, { color: colors.danger }]}>
                Can&apos;t find the registration for {plan.unmatched.join(', ')}. Check they&apos;re still registered.
              </Text>
            </View>
          )}

          {rebuilding && !blocked && (
            <View style={[st.warn, st.warnDanger]}>
              <Ionicons name="warning-outline" size={14} color={colors.danger} />
              <Text style={[st.warnText, { color: colors.danger }]}>
                This replaces the current bracket and deletes its results. Pool results are kept.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[st.primary, (busy || blocked) && { opacity: 0.6 }]}
            onPress={confirm}
            disabled={busy || blocked}
            activeOpacity={0.88}
          >
            {busy
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={st.primaryText}>{rebuilding ? 'Delete and rebuild bracket' : 'Build bracket'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={st.cancel} onPress={onClose} activeOpacity={0.7}>
            <Text style={st.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,18,40,0.45)' },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: shape.card + 8, borderTopRightRadius: shape.card + 8,
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxxl, maxHeight: '88%',
  },
  grabber: {
    width: 38, height: 4, borderRadius: 2, alignSelf: 'center',
    backgroundColor: colors.border, marginBottom: spacing.lg,
  },
  title: { color: colors.navy, fontSize: text.modalTitle.size, fontWeight: '900', marginBottom: 4 },
  sub: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 18, marginBottom: spacing.md },
  list: {
    maxHeight: 320, borderWidth: 1, borderColor: colors.border, borderRadius: shape.card,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  seed: { width: 22, color: colors.navy, fontSize: text.rowTitle.size, fontWeight: '900' },
  name: { flex: 1, color: colors.navy, fontSize: text.caption.size, fontWeight: '700' },
  poolTag: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: shape.pill,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
  },
  poolTagText: { color: colors.navy, fontSize: 11, fontWeight: '800' },
  record: { width: 64, textAlign: 'right', color: colors.textSub, fontSize: 11, fontWeight: '600' },
  warn: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: spacing.md,
    padding: spacing.md, borderRadius: shape.cta, backgroundColor: colors.goldBg,
  },
  warnDanger: { backgroundColor: colors.dangerBg },
  warnText: { flex: 1, color: colors.navy, fontSize: text.caption.size, fontWeight: '600', lineHeight: 18 },
  primary: {
    marginTop: spacing.lg, backgroundColor: colors.navy, borderRadius: shape.cta,
    paddingVertical: 14, alignItems: 'center',
  },
  primaryText: { color: colors.white, fontSize: text.action.size, fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: colors.textSub, fontSize: text.action.size, fontWeight: '800' },
});
