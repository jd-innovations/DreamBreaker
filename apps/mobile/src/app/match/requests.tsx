import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useSupportContext } from '@/lib/support/supportContext';
import type { ConnectionRequest } from '@/lib/connectionStore';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold,
  text: colors.text, textSub: colors.textSub, border: colors.border,
  success: colors.success,
  danger: colors.danger, dangerBg: colors.dangerBg,
};

const STATUS_META: Record<string, { label: string; color: string; bgColor: string }> = {
  pending:  { label: 'Pending',  color: colors.textSub,  bgColor: colors.page    },
  viewed:   { label: 'Viewed',   color: colors.gold,     bgColor: colors.goldBg  },
  accepted: { label: 'Accepted', color: colors.success,  bgColor: colors.successBg },
  declined: { label: 'Declined', color: colors.danger,   bgColor: colors.dangerBg  },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function Avatar({ uri, size }: { uri?: string; size: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={[av.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="person" size={size * 0.46} color={L.textSub} />
    </View>
  );
}
const av = StyleSheet.create({
  circle: { backgroundColor: L.page, borderWidth: 1, borderColor: L.border, alignItems: 'center', justifyContent: 'center' },
});

function IncomingCard({ req, onAccept, onDecline }: {
  req: ConnectionRequest; onAccept: () => void; onDecline: () => void;
}) {
  return (
    <View style={ic.card}>
      <View style={ic.topRow}>
        <Avatar uri={req.player.photoUri} size={52} />
        <View style={ic.info}>
          <View style={ic.nameRow}>
            <Text style={ic.name}>{req.player.name}</Text>
            <View style={ic.duprBadge}>
              <Ionicons name="star" size={10} color={L.gold} />
              <Text style={ic.duprText}>{req.player.dupr.toFixed(1)}</Text>
            </View>
          </View>
          <View style={ic.metaRow}>
            <Ionicons name="location-outline" size={12} color={L.textSub} />
            <Text style={ic.meta}>{req.player.distance} mi · {req.player.lookingFor}</Text>
          </View>
          <Text style={ic.time}>{relativeTime(req.sentAt)}</Text>
        </View>
        <TouchableOpacity
          style={ic.profileBtn}
          onPress={() => router.push(`/match/profile/${req.player.id}` as never)}
        >
          <Ionicons name="person-outline" size={16} color={L.navy} />
        </TouchableOpacity>
      </View>

      {req.message ? (
        <View style={ic.bubble}>
          <Text style={ic.bubbleText}>{req.message}</Text>
        </View>
      ) : null}

      <View style={ic.actions}>
        <TouchableOpacity style={ic.declineBtn} onPress={onDecline} activeOpacity={0.8}>
          <Ionicons name="close" size={16} color={L.danger} />
          <Text style={ic.declineText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ic.acceptBtn} onPress={onAccept} activeOpacity={0.85}>
          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          <Text style={ic.acceptText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const ic = StyleSheet.create({
  card: {
    backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1, borderColor: L.border, padding: 14, gap: 12,
  },
  topRow:    { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  info:      { flex: 1, gap: 3 },
  nameRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name:      { color: L.navy, fontSize: 15, fontWeight: '800' },
  duprBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  duprText:  { color: L.gold, fontSize: 11, fontWeight: '700' },
  metaRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta:      { color: L.textSub, fontSize: 12 },
  time:      { color: L.textSub, fontSize: 11 },
  profileBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: L.page, borderWidth: 1.5, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  bubble:     { backgroundColor: L.page, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: L.border },
  bubbleText: { color: L.text, fontSize: 13, lineHeight: 18 },
  actions:    { flexDirection: 'row', gap: 10 },
  declineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: L.dangerBg, borderRadius: 12, paddingVertical: 10, backgroundColor: L.dangerBg,
  },
  declineText: { color: L.danger, fontSize: 14, fontWeight: '700' },
  acceptBtn:   {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: L.navy, borderRadius: 12, paddingVertical: 10,
  },
  acceptText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});

function OutgoingCard({ req, onCancel }: { req: ConnectionRequest; onCancel: () => void }) {
  const meta = STATUS_META[req.status] ?? STATUS_META.pending;
  return (
    <View style={oc.card}>
      <Avatar uri={req.player.photoUri} size={50} />
      <View style={oc.info}>
        <View style={oc.nameRow}>
          <Text style={oc.name}>{req.player.name}</Text>
          <View style={oc.duprBadge}>
            <Ionicons name="star" size={10} color={L.gold} />
            <Text style={oc.duprText}>{req.player.dupr.toFixed(1)}</Text>
          </View>
        </View>
        <Text style={oc.sent}>Sent {relativeTime(req.sentAt)}</Text>
        <View style={[oc.statusBadge, { backgroundColor: meta.bgColor }]}>
          <Text style={[oc.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
      {(req.status === 'pending' || req.status === 'viewed') ? (
        <TouchableOpacity style={oc.cancelBtn} onPress={onCancel}>
          <Text style={oc.cancelText}>Cancel</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={oc.profileBtn}
          onPress={() => router.push(`/match/profile/${req.player.id}` as never)}
        >
          <Ionicons name="person-outline" size={15} color={L.navy} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const oc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderRadius: 14,
    borderWidth: 1, borderColor: L.border,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  info:      { flex: 1, gap: 4 },
  nameRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name:      { color: L.navy, fontSize: 15, fontWeight: '800' },
  duprBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  duprText:  { color: L.gold, fontSize: 11, fontWeight: '700' },
  sent:      { color: L.textSub, fontSize: 12 },
  statusBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:  { fontSize: 11, fontWeight: '700' },
  cancelBtn: {
    borderWidth: 1.5, borderColor: L.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  cancelText: { color: L.textSub, fontSize: 12, fontWeight: '600' },
  profileBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: L.page, borderWidth: 1.5, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
});

function profileToPlayer(p: {
  id: string; full_name: string; avatar_url: string | null;
  dupr: number | null; self_rating: string | null;
  location_city: string | null; location_state: string | null;
  looking_status: string;
}) {
  return {
    id: p.id,
    name: p.full_name,
    dupr: p.dupr ?? (p.self_rating ? parseFloat(p.self_rating) : 0),
    location: [p.location_city, p.location_state].filter(Boolean).join(', ') || 'Unknown',
    distance: 0,
    lookingFor: p.looking_status || 'Partner',
    photoUri: p.avatar_url ?? undefined,
  };
}

async function fetchRequests(uid: string): Promise<ConnectionRequest[]> {
  // fetch incoming and outgoing likes in parallel
  const [{ data: inLikes }, { data: outLikes }, { data: matches }] = await Promise.all([
    supabase
      .from('partner_likes')
      .select('id, from_user_id, created_at')
      .eq('to_user_id', uid)
      .eq('kind', 'like')
      .order('created_at', { ascending: false }),
    supabase
      .from('partner_likes')
      .select('id, to_user_id, created_at')
      .eq('from_user_id', uid)
      .eq('kind', 'like')
      .order('created_at', { ascending: false }),
    supabase
      .from('partner_matches')
      .select('user_a, user_b')
      .or(`user_a.eq.${uid},user_b.eq.${uid}`),
  ]);

  // build set of already-matched partner IDs
  const matchedIds = new Set(
    (matches ?? []).map(m => (m.user_a === uid ? m.user_b : m.user_a))
  );

  const filteredIn  = (inLikes  ?? []).filter(l => !matchedIds.has(l.from_user_id));
  const filteredOut = (outLikes ?? []).filter(l => !matchedIds.has(l.to_user_id));

  // collect all profile IDs needed
  const profileIds = [
    ...filteredIn.map(l => l.from_user_id),
    ...filteredOut.map(l => l.to_user_id),
  ];
  if (profileIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, dupr, self_rating, location_city, location_state, looking_status')
    .in('id', profileIds);

  const pm = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

  const incoming: ConnectionRequest[] = filteredIn
    .filter(l => pm[l.from_user_id])
    .map(l => ({
      id: l.id,
      player: profileToPlayer(pm[l.from_user_id]),
      direction: 'incoming' as const,
      sentAt: l.created_at,
      status: 'pending' as const,
    }));

  const outgoing: ConnectionRequest[] = filteredOut
    .filter(l => pm[l.to_user_id])
    .map(l => ({
      id: l.id,
      player: profileToPlayer(pm[l.to_user_id]),
      direction: 'outgoing' as const,
      sentAt: l.created_at,
      status: 'pending' as const,
    }));

  return [...incoming, ...outgoing];
}

export default function MatchRequestsScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [requests, setRequests]   = useState<ConnectionRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [uid, setUid]             = useState<string | null>(null);

  useSupportContext({ feature: 'match' });

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id ?? null;
      if (!userId || cancelled) { setLoading(false); return; }
      setUid(userId);
      fetchRequests(userId).then(reqs => {
        if (!cancelled) { setRequests(reqs); setLoading(false); }
      });
    });
    return () => { cancelled = true; };
  }, []));

  const incoming = requests.filter(r => r.direction === 'incoming');
  const outgoing = requests.filter(r => r.direction === 'outgoing');

  async function handleAccept(req: ConnectionRequest) {
    if (!uid) return;
    // insert reverse like; DB trigger creates the match
    await supabase.from('partner_likes').upsert({
      from_user_id: uid,
      to_user_id: req.player.id,
      kind: 'like',
    });
    setRequests(prev => prev.filter(r => r.id !== req.id));
  }

  async function handleDecline(req: ConnectionRequest) {
    // delete the incoming like row
    await supabase.from('partner_likes').delete().eq('id', req.id);
    setRequests(prev => prev.filter(r => r.id !== req.id));
  }

  async function handleCancel(req: ConnectionRequest) {
    // delete the outgoing like row
    await supabase.from('partner_likes').delete().eq('id', req.id);
    setRequests(prev => prev.filter(r => r.id !== req.id));
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.title}>Match Requests</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.segWrap}>
        <View style={s.segControl}>
          {(['incoming', 'outgoing'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.segBtn, activeTab === t && s.segBtnActive]}
              onPress={() => setActiveTab(t)}
            >
              <Text style={[s.segText, activeTab === t && s.segTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
                {t === 'incoming' && incoming.length > 0 ? ` (${incoming.length})` : ''}
                {t === 'outgoing' && outgoing.length > 0 ? ` (${outgoing.length})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {loading ? (
          <View style={s.empty}>
            <ActivityIndicator size="large" color={L.navy} />
          </View>
        ) : activeTab === 'incoming' ? (
          incoming.length > 0 ? (
            <View style={s.list}>
              {incoming.map(r => (
                <IncomingCard
                  key={r.id}
                  req={r}
                  onAccept={() => handleAccept(r)}
                  onDecline={() => handleDecline(r)}
                />
              ))}
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="mail-outline" size={52} color={L.textSub} />
              <Text style={s.emptyTitle}>No pending requests</Text>
              <Text style={s.emptySub}>When players send you a connect request, they'll appear here.</Text>
            </View>
          )
        ) : (
          outgoing.length > 0 ? (
            <View style={s.list}>
              {outgoing.map(r => (
                <OutgoingCard
                  key={r.id}
                  req={r}
                  onCancel={() => handleCancel(r)}
                />
              ))}
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="paper-plane-outline" size={52} color={L.textSub} />
              <Text style={s.emptyTitle}>No outgoing requests</Text>
              <Text style={s.emptySub}>Connect with players from the Partner Finder to see your sent requests here.</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()} activeOpacity={0.85}>
                <Text style={s.emptyBtnText}>Find Players</Text>
              </TouchableOpacity>
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.screenH, paddingVertical: 12,
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:   { flex: 1, color: L.navy, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  segWrap: {
    backgroundColor: L.bg, paddingHorizontal: spacing.screenH,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: L.border,
  },
  segControl:    { flexDirection: 'row', backgroundColor: L.page, borderRadius: 12, padding: 4, gap: 4 },
  segBtn:        { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  segBtnActive:  { backgroundColor: L.bg, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  segText:       { color: L.textSub, fontSize: 14, fontWeight: '600' },
  segTextActive: { color: L.navy, fontWeight: '800' },
  scroll: { paddingHorizontal: spacing.screenH, paddingTop: 16 },
  list:   { gap: 12 },
  empty:      { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { color: L.navy, fontSize: 18, fontWeight: '800' },
  emptySub:   { color: L.textSub, fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  emptyBtn:   {
    backgroundColor: L.gold, borderRadius: 14,
    paddingHorizontal: 28, paddingVertical: 13, marginTop: 8,
  },
  emptyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
