import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useAnalyticsQueueStore } from '@/state/analyticsQueueStore';
import { useTokenStore } from '@/state/tokenStore';
import { submitAnalyticsEvents, type AnalyticsEventPayload } from './analytics';

/**
 * The mobile AnalyticsClient (Telemetry spec §24-§25) — the ONE place
 * the rest of the app calls to record a client interaction event.
 * Screens never call services/analytics.ts (the raw POST) directly.
 *
 *   trackEvent() happens
 *          ↓
 *   local queue (analyticsQueueStore, AsyncStorage-backed)
 *          ↓
 *   batched, debounced flush
 *          ↓
 *   POST /analytics/events
 *          ↓
 *   accepted clientEventIds removed from the queue
 *
 * Every call here is synchronous and never throws — gameplay must never
 * wait for, or be affected by, telemetry (spec §4B/§30). A DUEL_CLUE_USED
 * call sits right next to the API call that actually reveals the clue;
 * if trackEvent() ever became async or could reject, it would risk
 * becoming a dependency of the gameplay flow it's supposed to be
 * silently observing.
 */

const BATCH_SIZE = 50;
/** Coalesces a burst of taps into one request rather than one per tap
 * (spec §24) — a flush is scheduled this many ms after the first event
 * in a new burst, so several events fired in quick succession (e.g. a
 * DUEL_CLUE_USED immediately followed by a DUEL_LOCK_IN) go out
 * together. */
const FLUSH_DEBOUNCE_MS = 3_000;
/** Once the queue is this full, flush immediately rather than waiting
 * out the debounce — keeps a long offline backlog from growing past the
 * queue's own MAX_QUEUE_SIZE before ever attempting to drain. */
const FLUSH_IMMEDIATELY_AT = 20;

/** One session id per app process — Telemetry spec §5: "groups events
 * belonging to one play session." Generated once at module load
 * (effectively "app opened"), not persisted — a fresh app launch is a
 * fresh session by definition. */
const sessionId = generateUuid();

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

function generateUuid(): string {
  // No crypto.randomUUID() on Hermes/RN 0.74 without a native polyfill
  // this app doesn't otherwise need — clientEventId only has to be
  // unique enough to dedupe a retried request (spec §25), not
  // cryptographically unguessable, so a plain Math.random-based v4 is
  // the right tool rather than adding a dependency for this alone.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function currentPlatform(): 'ios' | 'android' | 'web' {
  return Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
    ? Platform.OS
    : 'web';
}

function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

/**
 * Records a client interaction event (Telemetry spec §4B) — screen
 * views, button presses, anything only the frontend knows happened.
 * Server-authoritative events (spec §4A — XP, mastery, match results)
 * are emitted by the backend itself via AnalyticsService.track(), never
 * from here.
 *
 * Enqueues locally and schedules a batched flush; never awaits the
 * network, never throws.
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
  screen?: string,
): void {
  // Wrapped end-to-end: a gameplay call site sits right next to this
  // one (see the class doc comment) and must never see an exception
  // from a telemetry helper, however unlikely (a corrupt queue-store
  // state, a broken enqueue) that is in practice.
  try {
    const event: AnalyticsEventPayload = {
      clientEventId: generateUuid(),
      eventName,
      sessionId,
      screen,
      occurredAt: new Date().toISOString(),
      properties,
    };

    useAnalyticsQueueStore.getState().enqueue(event);

    if (useAnalyticsQueueStore.getState().events.length >= FLUSH_IMMEDIATELY_AT) {
      void flushAnalyticsQueue();
      return;
    }
    scheduleFlush();
  } catch {
    // See the comment above — never let telemetry take gameplay down.
  }
}

function scheduleFlush(): void {
  if (flushTimer) return; // a flush is already scheduled for this burst
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAnalyticsQueue();
  }, FLUSH_DEBOUNCE_MS);
}

/** Test-only: resets this module's timer/in-flight state. Without this,
 * a test that calls trackEvent() and never advances/fires its own fake
 * timer leaves `flushTimer` pointing at a now-orphaned id once the next
 * test calls jest.useFakeTimers() again (a fresh fake clock invalidates
 * it), which then silently no-ops every scheduleFlush() call after —
 * exported rather than left as a real bug hiding behind test order. */
export function __resetAnalyticsClientForTests(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  isFlushing = false;
}

/**
 * Sends up to BATCH_SIZE queued events in one request. Safe to call any
 * time (app foreground, network-reconnect, the debounce timer above) —
 * a no-op when there's nothing queued, already flushing, or no access
 * token yet (queued events just wait for the next trigger).
 *
 * On a successful response, every event in THIS batch is removed from
 * the queue — including any the backend reports as `rejected` (an
 * unknown event name from a stale build will never succeed no matter
 * how many times it's retried, so holding onto it would just waste
 * queue space forever). On a network/request failure, the queue is left
 * untouched so the next trigger retries the same events.
 */
export async function flushAnalyticsQueue(): Promise<void> {
  if (isFlushing) return;
  const accessToken = useTokenStore.getState().accessToken;
  if (!accessToken) return; // not signed in yet — events stay queued

  const pending = useAnalyticsQueueStore.getState().events;
  if (pending.length === 0) return;

  const batch = pending.slice(0, BATCH_SIZE);
  isFlushing = true;
  let succeeded = false;
  try {
    await submitAnalyticsEvents(accessToken, batch, {
      platform: currentPlatform(),
      appVersion: currentAppVersion(),
    });
    useAnalyticsQueueStore
      .getState()
      .removeByClientEventIds(batch.map((event) => event.clientEventId));
    succeeded = true;
  } catch {
    // Left queued — see the doc comment above. Deliberately NOT
    // rescheduled below: retrying every few seconds while offline would
    // burn battery/requests for nothing. The next natural trigger
    // (another trackEvent, app foreground, reconnect) tries again.
  } finally {
    isFlushing = false;
  }

  // More than one batch's worth was waiting (e.g. a long offline
  // backlog that just started draining) — keep going without waiting
  // out another debounce. Only on success, so a real network outage
  // doesn't turn into a tight retry loop.
  if (succeeded && useAnalyticsQueueStore.getState().events.length > 0) {
    scheduleFlush();
  }
}
