import React, { useEffect, useState } from 'react';
import { playStyleSummary } from '@/lib/playProfile';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Image, Platform, Modal, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { goBack } from '@/lib/navigation';
import { colors } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { getOrCreateConversation, sendMessage } from '@/lib/conversationService';
import {
  fetchUpcomingPlayEvents, fetchJoinedPlayEvents, localDateString, type PlayEventWithCount,
} from '@/lib/supabase/playEvents';
import { fetchInvitedUserIds, sendPlayEventInvite } from '@/lib/supabase/playEventInvites';

// ─── Design tokens ────────────────────────────────────────────────────────────

// Theme-backed alias — brand values resolve from @/theme.
const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldBorder: colors.goldBorder,
  textSub:    colors.textSub,
  textMuted:  colors.textSub,
  border:     colors.border,
  div:        colors.border,
  disabled:   '#B0BFDA',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type InviteType = 'community' | 'tournament' | 'team' | 'practice';

const INVITE_LABELS: Record<InviteType | string, string> = {
  community:  'Community Play',
  tournament: 'Tournament Partner',
  team:       'Team Event',
  practice:   'Practice Match',
};

const SKILL_RANGES = [
  '2.5 – 3.0',
  '3.0 – 3.5',
  '3.5 – 4.0',
  '4.0 – 4.5',
  '4.5 – 5.0',
];

const MAX_MSG = 200;

type TargetProfile = {
  fullName: string;
  avatarUrl: string | null;
  dupr: number | null;
  duprVerified: boolean;
  skillLevel: string | null;
  playStyle: string | null;
  locationLabel: string | null;
};

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtEventDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Form row wrapper ─────────────────────────────────────────────────────────

function FormRow({
  label, last, children,
}: {
  label: string; last?: boolean; children: React.ReactNode;
}) {
  return (
    <>
      <View style={s.formRow}>
        <Text style={s.rowLabel}>{label}</Text>
        <View style={s.rowValue}>{children}</View>
      </View>
      {!last && <View style={s.divider} />}
    </>
  );
}

// ─── Skill range picker modal ─────────────────────────────────────────────────

function SkillModal({
  visible, selected, onSelect, onClose,
}: {
  visible: boolean;
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Skill Range</Text>
          {SKILL_RANGES.map((r) => (
            <TouchableOpacity
              key={r}
              style={s.modalRow}
              onPress={() => { onSelect(r); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={[s.modalOption, selected === r && s.modalOptionSelected]}>{r}</Text>
              {selected === r && (
                <Ionicons name="checkmark" size={18} color={L.gold} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Community Play event picker row ──────────────────────────────────────────

function EventRow({
  event, selected, alreadyInvited, onPress,
}: {
  event: PlayEventWithCount; selected: boolean; alreadyInvited: boolean; onPress: () => void;
}) {
  const venue = event.venue_name || [event.city, event.state].filter(Boolean).join(', ');
  return (
    <TouchableOpacity
      style={[s.eventRow, selected && s.eventRowSelected]}
      activeOpacity={alreadyInvited ? 1 : 0.7}
      disabled={alreadyInvited}
      onPress={onPress}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.eventName}>{event.name}</Text>
        <Text style={s.eventMeta}>{fmtEventDate(event.event_date)}{venue ? ` • ${venue}` : ''}</Text>
      </View>
      {alreadyInvited ? (
        <Text style={s.eventInvitedTag}>Invited</Text>
      ) : selected ? (
        <Ionicons name="checkmark-circle" size={22} color={L.gold} />
      ) : (
        <Ionicons name="ellipse-outline" size={22} color={L.border} />
      )}
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InviteDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const params = useLocalSearchParams<{
    id:         string;
    name?:      string;
    inviteType: string;
  }>();

  const targetId    = params.id;
  const inviteType  = (params.inviteType ?? 'community') as InviteType;
  const typeLabel   = INVITE_LABELS[inviteType] ?? inviteType;
  const isCommunity = inviteType === 'community';

  // ── Target profile ──
  const [profileLoading, setProfileLoading] = useState(true);
  const [profile,        setProfile]        = useState<TargetProfile | null>(null);

  useEffect(() => {
    if (!targetId) { setProfileLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, dupr, dupr_verified, skill_level, play_style, location_city, location_state')
        .eq('id', targetId)
        .single();
      if (cancelled) return;
      if (data) {
        setProfile({
          fullName: data.full_name,
          avatarUrl: data.avatar_url,
          dupr: data.dupr,
          duprVerified: !!data.dupr_verified,
          skillLevel: data.skill_level,
          playStyle: playStyleSummary(data.play_style),
          locationLabel: [data.location_city, data.location_state].filter(Boolean).join(', ') || null,
        });
      }
      setProfileLoading(false);
    })();
    return () => { cancelled = true; };
  }, [targetId]);

  const targetName = profile?.fullName ?? params.name ?? 'this player';

  // ── Community Play: my upcoming events ──
  const [eventsLoading, setEventsLoading] = useState(isCommunity);
  const [events,        setEvents]        = useState<PlayEventWithCount[]>([]);
  const [invitedEventIds, setInvitedEventIds] = useState<Set<string>>(new Set());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!isCommunity || !user?.id) { setEventsLoading(false); return; }
    let cancelled = false;
    (async () => {
      setEventsLoading(true);
      const today = localDateString();
      const [organized, joined] = await Promise.all([
        fetchUpcomingPlayEvents(user.id),
        fetchJoinedPlayEvents(user.id),
      ]);
      const upcomingJoined = joined.filter(
        e => e.event_date >= today && ['open', 'full', 'in_progress'].includes(e.status),
      );
      const merged = [...organized, ...upcomingJoined].sort((a, b) => a.event_date.localeCompare(b.event_date));
      if (cancelled) return;
      setEvents(merged);
      setEventsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isCommunity, user?.id]);

  useEffect(() => {
    if (!selectedEventId) return;
    let cancelled = false;
    fetchInvitedUserIds(selectedEventId).then(ids => {
      if (!cancelled && targetId && ids.has(targetId)) {
        setInvitedEventIds(prev => new Set(prev).add(selectedEventId));
      }
    });
    return () => { cancelled = true; };
  }, [selectedEventId, targetId]);

  // ── Message-based form state (tournament / team / practice) ──
  const [date,          setDate]          = useState(new Date());
  const [time,          setTime]          = useState(() => {
    const t = new Date(); t.setHours(10, 0, 0, 0); return t;
  });
  const [location,      setLocation]      = useState('');
  const [skillRange,    setSkillRange]    = useState('3.5 – 4.0');
  const [message,       setMessage]       = useState('');
  const [showDate,      setShowDate]      = useState(false);
  const [showTime,      setShowTime]      = useState(false);
  const [showSkill,     setShowSkill]     = useState(false);
  const [sending,       setSending]       = useState(false);

  function handleDateChange(_: DateTimePickerEvent, d?: Date) {
    if (Platform.OS === 'android') setShowDate(false);
    if (d) setDate(d);
  }

  function handleTimeChange(_: DateTimePickerEvent, d?: Date) {
    if (Platform.OS === 'android') setShowTime(false);
    if (d) setTime(d);
  }

  const canSend = isCommunity
    ? !!selectedEventId && !invitedEventIds.has(selectedEventId ?? '')
    : location.trim().length > 0;

  async function handleSend() {
    if (!canSend || !user?.id || !targetId || sending) return;
    setSending(true);
    try {
      if (isCommunity && selectedEventId) {
        await sendPlayEventInvite(selectedEventId, user.id, targetId);
        const event = events.find(e => e.id === selectedEventId);
        router.push({
          pathname: '/players/[id]/invite-sent' as never,
          params: {
            id: targetId,
            name: targetName,
            inviteType,
            eventName: event?.name ?? '',
            date: event ? fmtEventDate(event.event_date) : '',
            location: event?.venue_name || [event?.city, event?.state].filter(Boolean).join(', ') || '',
          },
        } as never);
        return;
      }

      const convId = await getOrCreateConversation(user.id, targetId);
      const lines = [
        `${typeLabel} invite — ${fmtDate(date)} at ${fmtTime(time)}`,
        `${location.trim()} (skill ${skillRange})`,
      ];
      if (message.trim()) lines.push('', message.trim());
      await sendMessage(convId, user.id, lines.join('\n'));

      router.push({
        pathname: '/players/[id]/invite-sent' as never,
        params: {
          id: targetId,
          name: targetName,
          inviteType,
          date: fmtDate(date),
          time: fmtTime(time),
          location: location.trim(),
          skillRange,
          convId,
        },
      } as never);
    } catch (e: unknown) {
      Alert.alert('Could not send invite', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  }

  const FOOTER_H = 80 + insets.bottom;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Invite Details</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.scroll, { paddingBottom: FOOTER_H + 16 }]}
      >
        {/* ── Subtitle ── */}
        <Text style={s.subtitle}>
          {isCommunity ? 'Pick a game to invite them to.' : 'Set the details for your invite.'}
        </Text>

        {/* ── Player summary card ── */}
        {profileLoading ? (
          <View style={[s.playerCard, { justifyContent: 'center' }]}>
            <ActivityIndicator size="small" color={L.navy} />
          </View>
        ) : (
          <View style={s.playerCard}>
            <Image
              source={{ uri: profile?.avatarUrl || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop&q=80' }}
              style={s.avatar}
            />
            <View style={s.playerInfo}>
              <Text style={s.playerName}>{targetName}</Text>
              {(() => {
                const ratingLabel = profile?.dupr != null ? `DUPR ${profile.dupr}` : profile?.skillLevel || null;
                return (ratingLabel || profile?.playStyle) && (
                  <View style={s.chipRow}>
                    {ratingLabel && (
                      <View style={[s.chip, s.chipGold]}>
                        <Text style={s.chipGoldText}>{ratingLabel}</Text>
                      </View>
                    )}
                    {profile?.playStyle && (
                      <View style={s.chip}>
                        <Text style={s.chipText}>{profile.playStyle}</Text>
                      </View>
                    )}
                  </View>
                );
              })()}
              {profile?.locationLabel && (
                <View style={s.locationRow}>
                  <Ionicons name="location-outline" size={13} color={L.textMuted} />
                  <Text style={s.locationText}>{profile.locationLabel}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {isCommunity ? (
          /* ── Event picker ── */
          eventsLoading ? (
            <View style={[s.formCard, s.emptyWrap]}>
              <ActivityIndicator size="small" color={L.navy} />
            </View>
          ) : events.length === 0 ? (
            <View style={[s.formCard, s.emptyWrap]}>
              <Ionicons name="calendar-outline" size={28} color={L.textMuted} />
              <Text style={s.emptyText}>You don&apos;t have any upcoming games to invite them to.</Text>
              <TouchableOpacity onPress={() => router.push('/create-quick-game' as never)} activeOpacity={0.7}>
                <Text style={s.emptyLink}>Create a Community Play event</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.formCard}>
              {events.map((event, i) => (
                <React.Fragment key={event.id}>
                  <EventRow
                    event={event}
                    selected={selectedEventId === event.id}
                    alreadyInvited={invitedEventIds.has(event.id)}
                    onPress={() => setSelectedEventId(event.id)}
                  />
                  {i < events.length - 1 && <View style={s.divider} />}
                </React.Fragment>
              ))}
            </View>
          )
        ) : (
          <>
            {/* ── Form card ── */}
            <View style={s.formCard}>
              {/* Type — read-only */}
              <FormRow label="Type">
                <View style={s.readonlyRow}>
                  <Text style={s.readonlyText}>{typeLabel}</Text>
                  <Ionicons name="chevron-down" size={16} color={L.textMuted} />
                </View>
              </FormRow>

              {/* Date */}
              <FormRow label="Date">
                <TouchableOpacity
                  style={s.pickerRow}
                  onPress={() => setShowDate(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="calendar-outline" size={16} color={L.textSub} />
                  <Text style={s.pickerText}>{fmtDate(date)}</Text>
                </TouchableOpacity>
              </FormRow>

              {/* Time */}
              <FormRow label="Time">
                <TouchableOpacity
                  style={s.pickerRow}
                  onPress={() => setShowTime(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="time-outline" size={16} color={L.textSub} />
                  <Text style={s.pickerText}>{fmtTime(time)}</Text>
                </TouchableOpacity>
              </FormRow>

              {/* Location */}
              <FormRow label="Location">
                <View style={s.pickerRow}>
                  <Ionicons name="location-outline" size={16} color={L.textSub} />
                  <TextInput
                    style={s.locationInput}
                    value={location}
                    onChangeText={setLocation}
                    placeholder="Court or venue name"
                    placeholderTextColor={L.textMuted}
                    returnKeyType="done"
                    selectionColor={L.gold}
                    underlineColorAndroid="transparent"
                  />
                </View>
              </FormRow>

              {/* Skill range */}
              <FormRow label="Skill Range" last>
                <TouchableOpacity
                  style={s.pickerRow}
                  onPress={() => setShowSkill(true)}
                  activeOpacity={0.7}
                >
                  <Text style={s.pickerText}>{skillRange}</Text>
                  <Ionicons name="chevron-down" size={16} color={L.textMuted} />
                </TouchableOpacity>
              </FormRow>
            </View>

            {/* ── Message ── */}
            <Text style={s.msgLabel}>Message (optional)</Text>
            <View style={s.msgCard}>
              <TextInput
                style={s.msgInput}
                value={message}
                onChangeText={(v) => setMessage(v.slice(0, MAX_MSG))}
                placeholder={`Hey! I'm heading to the courts Saturday morning. Want to join?`}
                placeholderTextColor={L.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                selectionColor={L.gold}
                underlineColorAndroid="transparent"
              />
              <Text style={s.charCount}>{message.length}/{MAX_MSG}</Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Send Invite footer ── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[s.sendBtn, !canSend && s.sendBtnDisabled]}
          onPress={handleSend}
          activeOpacity={canSend ? 0.85 : 1}
          disabled={!canSend || sending}
        >
          {sending
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <Text style={s.sendText}>Send Invite</Text>}
        </TouchableOpacity>
      </View>

      {/* ── iOS date picker (inline sheet) ── */}
      {showDate && Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" onRequestClose={() => setShowDate(false)}>
          <View style={s.pickerSheetOverlay}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowDate(false)} activeOpacity={1} />
            <View style={s.pickerSheet}>
              <View style={s.pickerSheetHeader}>
                <TouchableOpacity onPress={() => setShowDate(false)}>
                  <Text style={s.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={date}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                minimumDate={new Date()}
                themeVariant="light"
              />
            </View>
          </View>
        </Modal>
      )}
      {showDate && Platform.OS === 'android' && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}

      {/* ── iOS time picker ── */}
      {showTime && Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" onRequestClose={() => setShowTime(false)}>
          <View style={s.pickerSheetOverlay}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowTime(false)} activeOpacity={1} />
            <View style={s.pickerSheet}>
              <View style={s.pickerSheetHeader}>
                <TouchableOpacity onPress={() => setShowTime(false)}>
                  <Text style={s.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={time}
                mode="time"
                display="spinner"
                onChange={handleTimeChange}
                themeVariant="light"
              />
            </View>
          </View>
        </Modal>
      )}
      {showTime && Platform.OS === 'android' && (
        <DateTimePicker
          value={time}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      )}

      {/* ── Skill range modal ── */}
      <SkillModal
        visible={showSkill}
        selected={skillRange}
        onSelect={setSkillRange}
        onClose={() => setShowSkill(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 12, backgroundColor: L.page,
  },
  backBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '700' },

  scroll: { paddingHorizontal: 20, paddingTop: 4 },

  subtitle: {
    color: L.navy, fontSize: 22, fontWeight: '800', marginBottom: 20,
  },

  // Player card
  playerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1, borderColor: L.border,
    padding: 16, gap: 14, marginBottom: 16, minHeight: 88,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2, borderColor: L.goldBorder, flexShrink: 0,
  },
  playerInfo:  { flex: 1, gap: 6 },
  playerName:  { color: L.navy, fontSize: 17, fontWeight: '800' },
  chipRow:     { flexDirection: 'row', gap: 6 },
  chip: {
    backgroundColor: '#F0EDE4', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  chipGold:     { backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder },
  chipText:     { color: L.navy, fontSize: 12, fontWeight: '600' },
  chipGoldText: { color: L.gold, fontSize: 12, fontWeight: '700' },
  locationRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { color: L.textMuted, fontSize: 12 },

  // Form card
  formCard: {
    backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1, borderColor: L.border,
    overflow: 'hidden', marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 8,
    minHeight: 52,
  },
  rowLabel: {
    width: 88, color: L.navy, fontSize: 15, fontWeight: '600', flexShrink: 0,
  },
  rowValue:    { flex: 1 },
  divider:     { height: StyleSheet.hairlineWidth, backgroundColor: L.div, marginLeft: 16 },

  // Read-only type row
  readonlyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readonlyText: { color: L.textSub, fontSize: 15, fontWeight: '500' },

  // Picker rows
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerText: { color: L.textSub, fontSize: 15, fontWeight: '500', flex: 1 },

  locationInput: {
    flex: 1, color: L.navy, fontSize: 15, fontWeight: '500',
    padding: 0, margin: 0,
    borderWidth: 0, backgroundColor: 'transparent',
  },

  // Event picker rows
  eventRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  eventRowSelected: { backgroundColor: L.goldBg },
  eventName: { color: L.navy, fontSize: 15, fontWeight: '700' },
  eventMeta: { color: L.textMuted, fontSize: 13, fontWeight: '400', marginTop: 2 },
  eventInvitedTag: { color: L.textMuted, fontSize: 12, fontWeight: '600' },

  // Empty state
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 10 },
  emptyText: { color: L.textMuted, fontSize: 14, fontWeight: '500', textAlign: 'center', paddingHorizontal: 24 },
  emptyLink: { color: L.gold, fontSize: 14, fontWeight: '700' },

  // Message
  msgLabel: {
    color: L.textMuted, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.7, textTransform: 'uppercase',
    marginBottom: 8,
  },
  msgCard: {
    backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1, borderColor: L.border,
    padding: 14,
  },
  msgInput: {
    color: L.navy, fontSize: 15, fontWeight: '400', lineHeight: 22,
    minHeight: 96,
    borderWidth: 0, backgroundColor: 'transparent',
    padding: 0, margin: 0,
  },
  charCount: {
    color: L.textMuted, fontSize: 12, fontWeight: '400',
    textAlign: 'right', marginTop: 8,
  },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: L.page,
    borderTopWidth: 1, borderTopColor: L.border,
    paddingHorizontal: 20, paddingTop: 12,
  },
  sendBtn: {
    backgroundColor: L.navy, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: L.disabled },
  sendText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  // Date/time picker sheet
  pickerSheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  pickerSheet: {
    backgroundColor: L.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  pickerSheetHeader: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.div,
  },
  pickerDone: { color: L.gold, fontSize: 16, fontWeight: '700' },

  // Skill modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
    padding: 32,
  },
  modalCard: {
    backgroundColor: L.bg, borderRadius: 18, width: '100%',
    paddingVertical: 8, overflow: 'hidden',
  },
  modalTitle: {
    color: L.textMuted, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.7, textTransform: 'uppercase',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  modalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.div,
  },
  modalOption:         { color: L.navy, fontSize: 16, fontWeight: '500' },
  modalOptionSelected: { color: L.gold, fontWeight: '700' },
});
