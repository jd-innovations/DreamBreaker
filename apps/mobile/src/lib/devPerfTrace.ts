/**
 * TEMPORARY - Phase 0 of PERFORMANCE_REGRESSION_AUDIT.md.
 *
 * Measurement harness for validating findings F1/F2/F3.
 *
 * GATING - deliberately NOT `__DEV__`:
 * the diagnostic build runs Metro with `--no-dev --minify` (so JS speed is close
 * to release), which makes `__DEV__` false. Gating on `__DEV__` would have
 * silently produced an empty trace in exactly the build we want to measure.
 * So this is gated on an explicit opt-in flag, with a hard production stop.
 *
 * BUFFERING: events accumulate in memory and are flushed in one batch once the
 * app goes quiet. Logging during an interaction would measurably slow the very
 * interaction being measured.
 *
 * DELETE THIS FILE and revert its call sites once the baseline is recorded.
 * Call sites are tagged `// PERF-TRACE`.
 */

// Opt-in flag. Undefined in every eas.json profile, so an ordinary build has it off.
const FLAG_ON = process.env.EXPO_PUBLIC_PERF_TRACE === '1';

// Hard stop: even if the flag were ever set in a production-channel build, the
// harness stays inert. Two independent conditions must both hold.
const IS_PRODUCTION = process.env.EXPO_PUBLIC_APP_ENV === 'production';

export const PERF_TRACE_ON = FLAG_ON && !IS_PRODUCTION;

type PerfEvent = { t: number; event: string; detail: string };

const BUFFER_CAP = 5000;
const QUIET_MS = 1500;

let buffer: PerfEvent[] = [];
let t0 = Date.now();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let batch = 0;

function record(event: string, detail: string) {
  if (!PERF_TRACE_ON) return;
  if (buffer.length < BUFFER_CAP) buffer.push({ t: Date.now() - t0, event, detail });
  if (flushTimer) clearTimeout(flushTimer);
  // Flush only once the app has been quiet for a moment, so console work never
  // lands inside the interaction being measured.
  flushTimer = setTimeout(flush, QUIET_MS);
}

/** Aggregate view - this is what fills in the results form. */
function summarize(events: PerfEvent[]): string[] {
  const out: string[] = [];
  const count = (p: (e: PerfEvent) => boolean) => events.filter(p).length;

  const focusEvents = events.filter(e => e.event === 'profile.focus');
  const instances = new Set(focusEvents.map(e => e.detail));
  const loads = events.filter(e => e.event === 'profile.load');
  const withForce = loads.filter(e => e.detail.includes('force=true')).length;
  const bypassed = loads.filter(e => e.detail.includes('dedupeBypassed=true')).length;
  const state = (s: string) => loads.filter(e => e.detail.includes(`state=${s}`)).length;
  const emits = events.filter(e => e.event === 'profile.emit');
  const listenerCounts = emits
    .map(e => Number(/listeners=(\d+)/.exec(e.detail)?.[1] ?? 0))
    .filter(n => n > 0);
  // IN-BATCH count, not the cumulative counter. The counter is module-level and
  // survives perfReset(), so reporting its last value described the whole app
  // session rather than this interaction - it read 32 on a batch that contained
  // 10 hook executions, a 3x overstatement, directly on the F1 threshold.
  const renderLines = events.filter(e => e.event === 'profile.renders');
  const rendersThisBatch = renderLines.length;
  const cumulativeAtEnd = renderLines.length
    ? Number(/cumulative=(\d+)/.exec(renderLines[renderLines.length - 1].detail)?.[1] ?? 0)
    : 0;
  const netDone = events.filter(e => e.event === 'net.done');
  const netMs = netDone
    .map(e => Number(/ (\d+)ms$/.exec(e.detail)?.[1] ?? 0))
    .reduce((a, b) => a + b, 0);
  const homeFocus = (w: string) => count(e => e.event === 'home.focus' && e.detail === `effect=${w}`);
  const flips = events.filter(e => e.event === 'home.loadingFlip');

  // Notifications DISPATCHED = sum of listeners walked across every emit. This is
  // work the store does; it is NOT a render count. React coalesces an unknown
  // number of these into far fewer actual renders, so the two are reported
  // separately and neither is ever derived from the other.
  const notifications = emits
    .map(e => Number(/listeners=(\d+)/.exec(e.detail)?.[1] ?? 0))
    .reduce((a, b) => a + b, 0);

  out.push('--- F1: profile store ---');
  out.push(`  useProfile focus callbacks fired : ${focusEvents.length}`);
  out.push(`  distinct hook instances firing   : ${instances.size}  [${[...instances].join(' ')}]`);
  out.push(`  loadProfile calls                : ${loads.length}  (force=true on ${withForce}; store was inflight=${state('inflight')} cached=${state('cached')} cold=${state('cold')})`);
  out.push(`  >> dedupe BYPASSED (F1 signal)   : ${bypassed}   (force=true while a request was already in flight)`);
  out.push('  [1] store emits                       : ' + emits.length);
  out.push(`  [2] listener notifications dispatched : ${notifications}   (sum of listeners per emit; store-side work, NOT renders)`);
  out.push(`      live subscribers at emit          : min=${listenerCounts.length ? Math.min(...listenerCounts) : 0} max=${listenerCounts.length ? Math.max(...listenerCounts) : 0}`);
  out.push(`  [3] useProfile hook executions        : ${rendersThisBatch}   THIS BATCH (hook body; real renders, post-batching)`);
  out.push(`      ratio vs subscribers              : ${listenerCounts.length ? (rendersThisBatch / Math.max(...listenerCounts)).toFixed(2) : 'n/a'}x   (F1 rule trips above 2.00x)`);
  out.push(`      cumulative since app start        : ${cumulativeAtEnd}   (context only - NOT the per-interaction metric)`);
  out.push('  [4] React commits                     : not measured here - Build A2 Profiler only');

  out.push('--- F3: Home focus effects ---');
  out.push(`  tournaments / pushToken / community : ${homeFocus('tournaments')} / ${homeFocus('pushToken')} / ${homeFocus('communityCards')}`);
  out.push(`  loading flips over populated data  : ${flips.filter(e => e.detail.endsWith('true')).length} of ${flips.length}`);

  out.push('--- Network ---');
  out.push(`  requests started / completed : ${count(e => e.event === 'net.start')} / ${netDone.length}`);
  out.push(`  total request time           : ${netMs}ms`);
  return out;
}

// --- On-device delivery -----------------------------------------------------
// Metro's console is not a reliable transport (it did not surface anything on
// the first attempt), and the DevTools console cannot be open during a
// measurement without affecting it. So the completed batch is also kept in
// memory for the on-device viewer to read.

let lastBatchText = '';
const flushListeners = new Set<() => void>();

/** Text of the most recently completed batch, for the on-device viewer. */
export function getLastBatch(): string {
  return lastBatchText;
}

/** How many events are buffered but not yet flushed. */
export function getBufferedCount(): number {
  return buffer.length;
}

/**
 * Notified when a batch completes. Used ONLY by the viewer while its sheet is
 * open — never subscribe during a measurement, or the subscriber's re-renders
 * become part of what is being measured.
 */
export function subscribeToFlush(listener: () => void): () => void {
  flushListeners.add(listener);
  return () => { flushListeners.delete(listener); };
}

/** Print everything buffered, then clear. Safe to call at any time. */
export function flush() {
  if (!PERF_TRACE_ON) return;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (buffer.length === 0) return;
  const events = buffer;
  buffer = [];
  batch += 1;

  const span = events[events.length - 1].t - events[0].t;
  const lines = [
    '',
    `===== [PERF] BATCH ${batch} - ${events.length} events over ${span}ms =====`,
    ...summarize(events),
    '--- raw ---',
    ...events.map(e => `  ${String(e.t).padStart(6, ' ')}ms  ${e.event.padEnd(18, ' ')} ${e.detail}`),
    `===== [PERF] END BATCH ${batch} =====`,
    '',
  ];
  lastBatchText = lines.join('\n');
  // One console call, after the interaction has finished. Metro may or may not
  // surface this; the on-device viewer is the reliable path.
  console.log(lastBatchText);
  for (const l of flushListeners) l();
}

/** Clear the buffer and restart the clock, e.g. between scripted interactions. */
export function perfReset() {
  if (!PERF_TRACE_ON) return;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  buffer = [];
  t0 = Date.now();
  console.log('[PERF] buffer reset - begin the next interaction now');
}

// --- F1: useProfile / profile store -----------------------------------------

export function traceProfileFocus(who: string) { record('profile.focus', who); }

/**
 * `force` is the argument actually passed to loadProfile. `inFlight` and
 * `hasProfile` describe the store at that moment. They are recorded separately
 * because a force=true call with an idle store still bypasses the dedupe - the
 * earlier single-`kind` version hid exactly that case.
 *
 * `dedupeBypassed` is the F1 signal: a call that would have been collapsed into
 * an existing request if force had been false.
 */
export function traceProfileLoad(force: boolean, inFlight: boolean, hasProfile: boolean, userId: string) {
  const state = inFlight ? 'inflight' : hasProfile ? 'cached' : 'cold';
  const bypassed = force && inFlight;
  record(
    'profile.load',
    `force=${force} state=${state} dedupeBypassed=${bypassed} user=${userId.slice(0, 8)}`,
  );
}

export function traceProfileEmit(reason: string, listeners: number) {
  record('profile.emit', `reason=${reason} listeners=${listeners}`);
}

/**
 * Counts ACTUAL useProfile hook-body executions.
 *
 * Call site: the first statement of `useProfile()` in hooks/useProfile.ts, so it
 * increments once per real render of a component that consumes the hook — after
 * React has already batched/coalesced whatever notifications the store
 * dispatched. It is measured independently and is never derived from emit or
 * listener counts.
 *
 * Caveats:
 * - Counts hook executions, not React commits. One commit can render several
 *   consumers; a commit that renders none of them is invisible here.
 * - Recorded during render (a deliberate impurity for temporary instrumentation).
 *   A render React discards still counts.
 * - In Build A2 only (`__DEV__` true), StrictMode double-invocation can inflate
 *   this. Build A (`--no-dev`) is unaffected — prefer A for this number.
 */
let hookExecutions = 0;
export function traceProfileRender() {
  if (!PERF_TRACE_ON) return;
  hookExecutions += 1;
  record('profile.renders', `cumulative=${hookExecutions}`);
}

// --- F3: Home focus effects --------------------------------------------------

export function traceHomeFocus(which: 'tournaments' | 'pushToken' | 'communityCards') {
  record('home.focus', `effect=${which}`);
}

export function traceHomeLoadingFlip(hadData: boolean) {
  record('home.loadingFlip', `hadDataBeforeFlip=${hadData}`);
}

// --- Network counting --------------------------------------------------------

let netInstalled = false;
/**
 * MUST run before `lib/supabase.ts` is evaluated. supabase-js resolves its fetch
 * implementation when createClient() runs at module scope, so a patch applied
 * later (e.g. from _layout's body) is captured too late and counts nothing -
 * which is exactly what the first real batch showed: a profile load completed
 * with `requests started/completed: 0/0`.
 *
 * This is why devPerfTrace is imported FIRST in _layout.tsx and self-installs
 * below, rather than waiting to be called.
 */
export function installNetworkCounter() {
  if (!PERF_TRACE_ON || netInstalled) return;
  netInstalled = true;
  const original = globalThis.fetch;
  // Loosely typed on purpose: RN's fetch signature and the DOM lib's disagree on
  // the input union, and this wrapper is deleted at the end of Phase 0.
  const patched = async (...args: unknown[]) => {
    const first = args[0];
    const url = typeof first === 'string' ? first : String((first as { url?: string })?.url ?? first ?? '');
    const short = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const started = Date.now();
    record('net.start', short);
    try {
      const res = await (original as (...a: unknown[]) => Promise<Response>)(...args);
      record('net.done', `${short} ${res.status} ${Date.now() - started}ms`);
      return res;
    } catch (e) {
      record('net.fail', `${short} ${Date.now() - started}ms`);
      throw e;
    }
  };
  (globalThis as { fetch: unknown }).fetch = patched;
}

// --- Manual control from the React Native DevTools console -------------------

if (PERF_TRACE_ON) {
  // Self-install at module load, before any other module can capture fetch.
  installNetworkCounter();
  (globalThis as Record<string, unknown>).__PERF_FLUSH__ = flush;
  (globalThis as Record<string, unknown>).__PERF_RESET__ = perfReset;
  console.log(
    '[PERF] instrumentation ACTIVE. Buffered; auto-prints ~1.5s after each interaction goes quiet.\n' +
    '[PERF] Manual: __PERF_FLUSH__() to print now, __PERF_RESET__() to clear between interactions.',
  );
}
