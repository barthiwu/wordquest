# WordQuest V22 Security Review

Performed as part of the V22 Beta Validation & Launch Preparation
Specification, §15 "Perform: Security review" and "Perform: Crash
testing". This is a point-in-time code review plus live fault-injection
testing against the local backend, not a third-party penetration test —
see "Scope and limitations" at the end.

## Summary

No exploitable vulnerability was found. One real bug was found by crash
testing and has been fixed (below). Two low-risk hardening
recommendations are noted for future consideration; neither blocks beta.

## Authentication and session security

- Refresh tokens, email-verification tokens, and password-reset tokens
  are stored as SHA-256 hashes, never plaintext
  (`src/auth/auth.service.ts`, `hashToken`).
- Refresh tokens rotate on use and are revocable (`revokedAt`); sessions
  have an absolute lifetime cap (90 days,
  `gameplay-rules.ts:absoluteSessionLifetimeDays`) independent of
  rotation, so a stolen-but-never-detected refresh token cannot extend a
  session forever.
- Account lockout after repeated failed logins
  (`maxFailedLoginAttempts: 5`).
- All auth endpoints (`register`, `login`, `refresh`,
  `request-password-reset`, etc.) carry `@Throttle` rate limits, verified
  live: 7 rapid login attempts against one account returned `401` and the
  8th returned `429`.
- JWT secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) are required at
  process startup — a missing secret fails deployment immediately rather
  than booting a server that only breaks on the first real login
  (`src/main.ts`).
- `CORS_ORIGIN` defaults to `*` in development but the config layer
  throws at startup if a production boot still has the wildcard set —
  prevents the specific misconfiguration of
  `Access-Control-Allow-Origin: *` combined with `credentials: true`,
  which would let any origin ride a player's auth cookies/headers
  (`src/config/config.service.ts`).
- `helmet()` is applied globally (`src/main.ts`).

## Authorization

- Every controller in the app is behind `JwtAuthGuard` except two,
  both intentionally public: `ClansController` (unauthenticated clan
  list needed before account creation exists, exposes no PII — id, name,
  description, lore, banner asset only) and `HealthController`
  (conventional for a load-balancer health check).
- Spot-checked for over-fetching: `/users/me` and leaderboard endpoints
  return only the caller's own data or non-PII fields (id, display name,
  clan name) for other players — no email or other private field leaks
  into a response about someone else.

## Data handling

- No raw/unparameterized SQL anywhere in the codebase — the only
  `$queryRaw` usage (health check) uses Prisma's tagged-template form,
  which is parameterized and not injectable. Live-tested a
  SQL-injection-shaped string in the login email field
  (`a@b.com'; DROP TABLE users;--`); it was rejected by input validation
  (`400`, "email must be an email") before reaching any query.
- Currency (Glyphs/XP) mutation goes through a single authoritative
  service (`ProgressionService`), verified in the V22 §10 audit; a
  Postgres `CHECK (glyphBalance >= 0)` constraint now backs the existing
  application-level guard as defense-in-depth (added this pass — see
  migration `20260824040118_glyph_balance_nonnegative_check`).

## Crash / fault-injection testing (live, against a running local instance)

Eleven requests were sent against a live dev server: malformed JSON, a
~5MB oversized body, wrong `Content-Type`, a garbage JWT, a
SQL-injection-shaped field, an array where a string was expected, a
missing-required-fields body, wrong JSON value types, a nonexistent
route, an empty body with no `Content-Type`, and a control-character
field value. The server never crashed or became unresponsive at any
point — a `/health` check after all eleven still returned `200` with
`"database":"up"` and a continuously increasing uptime (no restart
occurred).

**One real bug was found and fixed**: an oversized request body (or a
field holding a huge array instead of the expected string) was rejected
correctly by body-parser's default size limit, but the rejection surfaced
as `500 Internal Server Error` instead of the correct `413 Payload Too
Large`. Root cause: `PayloadTooLargeError` is thrown by Express
middleware before Nest's routing layer runs, so it's a plain
`http-errors` object, not a `NestJS HttpException` — `AllExceptionsFilter`
didn't recognize it and fell through to its generic 500 branch. Fixed in
`src/common/filters/all-exceptions.filter.ts`: the filter now checks for
a `status`/`statusCode` already present on a non-HttpException error
(4xx range only, to avoid trusting an arbitrary thrown object) and uses
it instead of defaulting to 500. Verified live: both oversized-payload
cases now return `413` with the correct message, and the fix no longer
reports these to Sentry (they're expected client errors, not bugs) —
covered by two new unit tests in `all-exceptions.filter.spec.ts`.

Every other fault-injection case already returned the correct status
with no server-side detail leaked to the client (a generic "Internal
server error" message for the one genuinely-unhandled-error test case in
the filter's own unit tests, never a raw stack trace or exception
message).

## Low-risk recommendations (not blocking, not implemented this pass)

1. **Secrets management is thin for a production launch**: real secrets
   go into Railway's variable store (never committed), but there's no
   rotation policy or dedicated secrets manager/vault. Adequate for a
   beta-scale launch; worth revisiting before a larger production
   footprint.
2. No automated **content-safety check** on ALI's AI-generated text —
   the "never shame/mock/discourage" guardrail is prompt-only (see V22
   §6 finding in the validation report). Not a traditional security
   issue, but flagged here since it's a trust-and-safety gap in the same
   spirit as this review.

## Scope and limitations

This review was static code reading plus live fault-injection against a
local dev instance with seed data — it is not a professional penetration
test, does not include dependency/CVE scanning, fuzzing beyond the eleven
cases above, or testing against a real production deployment (which does
not yet exist — see the V22 validation report's §15 findings). Before a
larger-scale production launch, an external security review and a
dependency vulnerability scan (`npm audit` or equivalent, wired into CI)
are worth adding.
