import { Injectable, Logger } from '@nestjs/common';

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';
/** Expo caps a single push request at 100 messages. */
const EXPO_BATCH_SIZE = 100;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Delivery for the notification engine's push channel (V1 Remaining
 * Systems Spec §15) — Expo's push API needs no server-side secret for
 * the common case (see PushToken's schema comment), so this is a plain
 * fetch call rather than a new SDK dependency. Delivery is always
 * best-effort: a failed/unreachable push must never surface as an error
 * to whatever triggered the notification, since the in-app Notification
 * row is already the source of truth by the time this runs.
 */
@Injectable()
export class ExpoPushProvider {
  private readonly logger = new Logger(ExpoPushProvider.name);

  async send(messages: PushMessage[]): Promise<void> {
    if (messages.length === 0) return;

    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
      try {
        await fetch(EXPO_PUSH_API, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            batch.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data ?? {} })),
          ),
        });
      } catch (err) {
        // Best-effort — see doc comment. Logged, not rethrown.
        this.logger.warn(`Expo push delivery failed for a batch of ${batch.length}: ${err}`);
      }
    }
  }
}
