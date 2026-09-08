/**
 * TEMPORARY - Phase 0 of PERFORMANCE_REGRESSION_AUDIT.md.
 *
 * Two things live here:
 *
 * 1. PerfTraceDiagnosticBanner - renders REGARDLESS of the PERF flag, because a
 *    diagnostic gated on the thing being diagnosed can never tell you why the
 *    thing is off. It reports the raw flag value, the computed PERF_TRACE_ON,
 *    whether the overlay mounted, and which bundle is running.
 *
 * 2. PerfTraceOverlay - the actual trace viewer, gated on PERF_TRACE_ON.
 *
 * Neither can reach production:
 * - The banner is hidden when EXPO_PUBLIC_APP_ENV is 'production' OR 'internal',
 *   so it appears on a local Metro/dev-client run only - never in the preview
 *   (Build B) that measures perceived performance, and never in production.
 * - The overlay keeps the harness's own unmodified double gate.
 *
 * DELETE THIS FILE with the rest of the harness. Tagged `// PERF-TRACE`.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Share, ScrollView,
} from 'react-native';
import {
  PERF_TRACE_ON, flush, perfReset, getLastBatch, getBufferedCount, subscribeToFlush,
} from '@/lib/devPerfTrace';

/**
 * Change this string whenever you want to prove the device picked up a fresh
 * bundle. If the banner shows an old marker, the dev client served a cached
 * bundle/update and nothing else on screen can be trusted.
 */
const BUNDLE_MARKER = 'PERF-DIAG-v1';

const RAW_FLAG = process.env.EXPO_PUBLIC_PERF_TRACE;
const RAW_APP_ENV = process.env.EXPO_PUBLIC_APP_ENV;

// Deliberately excludes 'internal' as well as 'production': Build B (preview,
// APP_ENV=internal) must stay visually clean, since it is the build used to
// judge perceived performance.
const DIAG_VISIBLE = RAW_APP_ENV !== 'production' && RAW_APP_ENV !== 'internal';

function bundleSource(): string {
  try {
    // Required lazily so a missing/disabled module cannot break the banner.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates');
    if (!Updates?.isEnabled) return 'Metro / dev bundle (updates disabled)';
    if (Updates.isEmbeddedLaunch) return 'embedded bundle (NOT Metro)';
    return `OTA update ${String(Updates.updateId ?? 'unknown').slice(0, 8)} (NOT Metro)`;
  } catch {
    return 'unknown (expo-updates unavailable)';
  }
}

export function PerfTraceDiagnosticBanner({ overlayMounted }: { overlayMounted: boolean }) {
  if (!DIAG_VISIBLE) return null;

  const ok = PERF_TRACE_ON;
  return (
    <View style={[d.wrap, ok ? d.ok : d.bad]} pointerEvents="none">
      <Text style={d.line}>
        {ok ? 'PERF ACTIVE' : 'PERF INACTIVE'} · {BUNDLE_MARKER}
      </Text>
      <Text style={d.line}>
        raw EXPO_PUBLIC_PERF_TRACE = {RAW_FLAG === undefined ? 'undefined' : JSON.stringify(RAW_FLAG)}
      </Text>
      <Text style={d.line}>
        raw EXPO_PUBLIC_APP_ENV = {RAW_APP_ENV === undefined ? 'undefined' : JSON.stringify(RAW_APP_ENV)}
      </Text>
      <Text style={d.line}>
        PERF_TRACE_ON = {String(PERF_TRACE_ON)} · overlay mounted = {String(overlayMounted)}
      </Text>
      <Text style={d.line}>running: {bundleSource()}</Text>
    </View>
  );
}

export function PerfTraceOverlay() {
  // The banner must render whether or not the harness is on, so it is outside
  // the PERF_TRACE_ON gate; the viewer itself stays behind it.
  return (
    <>
      <PerfTraceDiagnosticBanner overlayMounted={PERF_TRACE_ON} />
      {PERF_TRACE_ON ? <PerfTraceOverlayInner /> : null}
    </>
  );
}

function PerfTraceOverlayInner() {
  const [open, setOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [buffered, setBuffered] = useState(0);
  const [note, setNote] = useState('');

  const refresh = useCallback(() => {
    setBatchText(getLastBatch());
    setBuffered(getBufferedCount());
  }, []);

  // Subscribe ONLY while the sheet is open. During a measurement the sheet is
  // closed, so this component never re-renders as part of what is measured.
  useEffect(() => {
    if (!open) return;
    refresh();
    return subscribeToFlush(refresh);
  }, [open, refresh]);

  async function share() {
    const text = getLastBatch();
    if (!text) { setNote('Nothing to share yet - run an interaction first.'); return; }
    try {
      await Share.share({ message: text });
    } catch {
      setNote('Share sheet failed. Select the text below and copy it instead.');
    }
  }

  return (
    <>
      {/* Static badge. No counter, no animation, no re-render during measurement. */}
      <TouchableOpacity
        style={s.badge}
        activeOpacity={0.7}
        onPress={() => setOpen(true)}
      >
        <Text style={s.badgeText}>PERF</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="none" transparent={false} onRequestClose={() => setOpen(false)}>
        <View style={s.sheet}>
          <Text style={s.active}>PERF instrumentation ACTIVE</Text>
          <Text style={s.sub}>
            buffered events: {buffered}   ·   last batch: {batchText ? `${batchText.length} chars` : 'none yet'}
          </Text>
          {note ? <Text style={s.note}>{note}</Text> : null}

          <View style={s.row}>
            <Btn
              label="RESET"
              onPress={() => { perfReset(); setNote('Buffer reset. Close this, do ONE interaction, then reopen.'); refresh(); }}
            />
            <Btn label="FLUSH" onPress={() => { flush(); refresh(); setNote('Flushed.'); }} />
            <Btn label="SHARE" onPress={share} />
            <Btn label="CLOSE" onPress={() => { setNote(''); setOpen(false); }} />
          </View>

          <Text style={s.hint}>
            Long-press the text below to select and copy, or use SHARE to send it off-device.
          </Text>

          <ScrollView style={s.scroll} contentContainerStyle={{ padding: 8 }}>
            <TextInput
              style={s.text}
              value={batchText || '(no batch yet)\n\n1. Tap RESET\n2. Close this sheet\n3. Do exactly one interaction\n4. Wait ~2s\n5. Reopen this sheet'}
              multiline
              editable={false}
              scrollEnabled={false}
              selectTextOnFocus
            />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.btn} activeOpacity={0.7} onPress={onPress}>
      <Text style={s.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const d = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 99999, elevation: 99999,
    // Fixed inset: this component renders OUTSIDE the navigator, and the app has
    // no SafeAreaProvider of its own (screens get one from React Navigation's
    // internal SafeAreaProviderCompat), so useSafeAreaInsets() throws here.
    paddingTop: 56, paddingHorizontal: 8, paddingBottom: 4,
  },
  ok: { backgroundColor: 'rgba(6,95,70,0.94)' },
  bad: { backgroundColor: 'rgba(153,27,27,0.94)' },
  line: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
});

const s = StyleSheet.create({
  badge: {
    position: 'absolute', left: 12, bottom: 140, zIndex: 99999, elevation: 99999,
    backgroundColor: '#111827', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  sheet: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingTop: 60, paddingBottom: 24 },
  active: { color: '#065F46', fontSize: 15, fontWeight: '800' },
  sub: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  note: { color: '#B45309', fontSize: 12, marginTop: 6 },
  hint: { color: '#6B7280', fontSize: 11, marginTop: 8 },

  row: { flexDirection: 'row', gap: 6, marginTop: 10 },
  btn: { flex: 1, backgroundColor: '#111827', borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  scroll: { flex: 1, marginTop: 8, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6 },
  text: { color: '#111827', fontSize: 11, fontFamily: 'Menlo' },
});
