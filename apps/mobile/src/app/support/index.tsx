import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { goBack } from '@/lib/navigation';
import { LoadingState, ErrorState } from '@/components';
import { useSession } from '@/hooks/useSession';
import { fetchMyTickets, type SupportTicket, type SupportTicketStatus } from '@/lib/supportTicketService';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy, gold: colors.gold,
  blue: '#007AFF', text: colors.text, textSub: colors.textSub, textMuted: colors.textSub,
  border: colors.border, greenBg: colors.successBg, green: colors.success,
};

const STATUS_STYLE: Record<SupportTicketStatus, { label: string; bg: string; color: string }> = {
  open:        { label: 'Open',        bg: L.greenBg,       color: L.green },
  in_progress: { label: 'In Progress', bg: '#DBEAFE',       color: '#2563EB' },
  resolved:    { label: 'Resolved',    bg: '#F3F4F6',       color: '#6B7280' },
  closed:      { label: 'Closed',      bg: '#F3F4F6',       color: '#6B7280' },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function TicketRow({ ticket }: { ticket: SupportTicket }) {
  const st = STATUS_STYLE[ticket.status];
  return (
    <TouchableOpacity
      style={s.row}
      activeOpacity={0.75}
      onPress={() => router.push(`/support/${ticket.id}` as never)}
    >
      <View style={{ flex: 1 }}>
        <View style={s.rowTop}>
          <Text style={s.subject} numberOfLines={1}>{ticket.subject}</Text>
          <View style={[s.badge, { backgroundColor: st.bg }]}>
            <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>
        <Text style={s.meta}>Updated {fmtDate(ticket.updated_at)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={L.textMuted} />
    </TouchableOpacity>
  );
}

export default function MyTicketsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  // The catch was `() => {}`, so a failed load rendered "No tickets yet —
  // questions or issues you report will show up here" to a user who has open
  // tickets. On the support screen specifically, that is the worst possible
  // place to imply nothing is wrong (item 6.3).
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) { setLoading(false); return; }
      setLoading(true);
      setError(false);
      fetchMyTickets(user.id)
        .then(setTickets)
        .catch((err) => {
          console.error('[support] failed to load tickets', err);
          setError(true);
        })
        .finally(() => setLoading(false));
    }, [user?.id, reloadKey]),
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.blue} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Tickets</Text>
        <View style={{ width: 80 }} />
      </View>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          message="We couldn't load your tickets."
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : tickets.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="chatbubbles-outline" size={48} color={L.textMuted} />
          <Text style={s.emptyTitle}>No tickets yet</Text>
          <Text style={s.emptySub}>Questions or issues you report will show up here.</Text>
          <TouchableOpacity
            style={s.newBtn}
            activeOpacity={0.85}
            onPress={() => router.push('/support/new-ticket' as never)}
          >
            <Text style={s.newBtnText}>New Ticket</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        >
          {tickets.map(t => <TicketRow key={t.id} ticket={t} />)}
        </ScrollView>
      )}

      <TouchableOpacity
        style={[s.fab, { bottom: insets.bottom + 20 }]}
        activeOpacity={0.85}
        onPress={() => router.push('/support/new-ticket' as never)}
      >
        <Ionicons name="add" size={26} color={L.navy} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
    paddingHorizontal: 8, paddingVertical: 12,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minWidth: 80 },
  backText: { color: L.blue, fontSize: 17, fontWeight: '400' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyTitle: { color: L.text, fontSize: text.titleSm.size, fontWeight: '800' },
  emptySub: { color: L.textMuted, fontSize: text.body.size, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  newBtn: { marginTop: 8, backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 12, paddingHorizontal: 22 },
  newBtnText: { color: L.gold, fontSize: text.rowValue.size, fontWeight: '800' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: L.bg, borderRadius: shape.panel, borderWidth: 1, borderColor: L.border,
    padding: 14, marginBottom: 10,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  subject: { flex: 1, color: L.navy, fontSize: text.body.size, fontWeight: '500' },
  meta: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },
  badge: { borderRadius: shape.pill, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  fab: {
    position: 'absolute', right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: L.bg, borderWidth: 1.5, borderColor: L.gold,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10, shadowRadius: 8, elevation: 4,
  },
});
