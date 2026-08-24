/**
 * The device's own IANA timezone name (e.g. "America/Los_Angeles") —
 * collected once during onboarding and PATCHed to /users/me so the
 * server can compute quest windows, streaks, and quiet hours in the
 * player's actual local time (Player Timezone System, V1 Remaining
 * Systems Spec §15) instead of falling back to UTC for every player who
 * hasn't set one.
 *
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` is available in
 * Hermes (React Native's JS engine) same as any modern JS runtime — no
 * native module or extra permission needed. Wrapped in try/catch since
 * this is a "nice to have, never block onboarding on it" value: any
 * failure here just means the server keeps its own UTC fallback, which
 * every date computation in the backend already handles safely.
 */
export function getDeviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
