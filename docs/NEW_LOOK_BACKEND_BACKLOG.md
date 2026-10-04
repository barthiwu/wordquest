# New look — backend backlog

The "New look" (Settings → Preferences → New look, `UiVersion 'prototype'`) is a **UI-only** rebuild of the 8-sheet prototype. Anything in the prototype that needs new server state, a new data model, or a change to game rules was **left out of the app on purpose** and is listed here for a later backend pass. Nothing below is faked in the UI: where the prototype showed it, the new look simply shows the live data that already exists (or omits the element).

Decision record: Barth, Oct 2026 — "Other than [social sign-in + 2FA], do not include any other new feature."

## Deferred prototype features

| Prototype element | Why it needs backend work | What the app shows today |
|---|---|---|
| **Statistics charts** (XP over time, accuracy by skill, time spent) | No time-series / per-skill history endpoints; `XpTransaction` exists but there is no aggregation API. | Profile shows live totals only (level, XP, streak, words mastered, CEFR). |
| **Achievements tabs & progress** (categories, in-progress meters, rarity) | Achievements have no category/progress model; only unlocked rows. | Existing Achievements screen (palette-reskinned); Profile shows the unlocked list. |
| **Favourites / tags on word cards** | No per-user word tagging or favourites table. | Word cards unchanged. |
| **Avatar frames, titles, companion customization** | No cosmetics inventory/equip model beyond Shop purchases. | Standard avatar; Shop unchanged. |
| **Offline mode** | Needs a sync/queue contract and idempotent submission for quests and arcade. | Online only (live server state). |
| **Multi-boss seasons** | Boss Battle is one weekly boss; seasons/rosters need a schema. | Single weekly Boss Battle hub + battle. |
| **Continental leaderboard** | No continent grouping on `User.countryCode`; no continental aggregation. | Global / clan / country boards that already exist. |
| **Per-world levels** (levels inside each world) | Journey is stage-based on mastered-word thresholds; no per-world level model. | Journey shows stage progress toward the next world via `getMyProgression`. |
| **XP-changing game rules** (hint costs, time bonuses, arcade bonus XP) | Changes the XP/economy rules — explicitly out of scope for a UI-only pass. | Result screens show the XP the server actually awarded. |

## Sign-in follow-ups (the feature itself shipped)

Shipped in both looks: Google / Apple / Facebook sign-in (server-verified, hidden unless configured) and TOTP two-step verification with one-time recovery codes. Not yet built:

- **Link / unlink a provider** from Settings (v1 links automatically on a provider-*verified* matching email, or creates the account; there is no management UI/endpoint).
- **Sign in with Apple on web and Android** (needs an Apple Services ID + web redirect flow; iOS native only for now).
- **Google on Android** (needs the Android OAuth client + package-scheme redirect; iOS and web only for now).
- **Nonce validation** for Google/Apple ID tokens (currently audience/issuer/expiry/signature only).
- **Set a password on a social-only account** is possible today only through "Forgot password"; a direct "add password" flow is not built.
- **Trusted devices / "remember this device for 30 days"** for 2FA; **SMS** or **WebAuthn** factors.

## Configuration required before the sign-in buttons appear (set on the backend, never in the app)

| Env var | Notes |
|---|---|
| `GOOGLE_CLIENT_IDS` | Comma-separated: the web, iOS (and later Android) OAuth client IDs. Tokens minted for any of these are accepted. |
| `APPLE_CLIENT_IDS` | `com.wordquest.app` (the iOS bundle id) plus a Services ID if web is added later. |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Both required; the secret stays server-side (used for `debug_token`). |
| `TWO_FACTOR_ENCRYPTION_KEY` | Optional, 32 bytes as 64 hex chars or base64. Falls back to a key derived from the refresh secret; set it explicitly before rotating JWT secrets. |

App side (public values, not secrets): `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (or `expo.extra.social` in `app.json`). Apple sign-in needs the `expo-apple-authentication` native module (Xcode rebuild / new dev client) and the "Sign in with Apple" capability on the App ID.

Deploy note: run `prisma migrate deploy` for `20261004180000_social_login_and_two_factor` before (or with) the backend release.
