# WordQuest V23 Security Review

Supersedes the V22 review. This pass was an attacker-minded read of the
backend, mobile app, and CI, with every finding checked against the code
before it was changed. It is a code review, not a third-party penetration
test.

Commits: `50ad320` (backend), `1d4124f` (app + CI), plus the follow-up in
"Addendum" below. Backend: 1568 tests pass, `tsc` clean. Mobile: 323 tests
pass, `tsc` clean.

## Bottom line

You were not wide open: SQL injection, SSRF, ReDoS, social-login token
verification, hashed refresh/reset tokens, encrypted 2FA secrets, ownership
checks and the guest allow-list all held up. But there were three real
problems, and a handful of ways to get around the protections you already
had. All of those are fixed. What remains is lower risk and listed below.

## What an attacker could do before, and what changed

### Critical / high

1. **Read the answer to today's Daily Quest.** `POST /quests/history/check`,
   `GET /words/:id`, word search and the mastery list would all reveal (or
   let you probe) the word an open quest was asking about. Now: history
   check only accepts a word from a day that has already finished; the other
   three hide the current word of any in-progress quest.
2. **Dodge the login and password-reset rate limits for free.** The limiter
   keyed on the user ID in the bearer token, and guest tokens are free, so an
   attacker could rotate guest tokens and never hit a limit. All `/auth/*`
   routes are now limited by IP, whatever token is attached.
3. **Out-guess the account lockout.** The failed-login counter was updated
   only after the password check, so a burst of parallel requests all got a
   free guess. The attempt is now counted atomically before bcrypt runs. The
   same budget now covers 2FA codes and recovery of deleted accounts, and a
   lock that has expired starts a fresh budget.
4. **Take over an account through a reset link.** If the account's email was
   never verified, whoever registered it first could attach their own
   authenticator. A reset now verifies the email and wipes any 2FA on that
   account. The reset link is also single-use under a race now (two parallel
   requests with one link used to both pass).
5. **Lock the real owner out via a stolen session.** Starting 2FA enrolment
   only needed a bearer token. It now needs the current password and a
   verified email, and wrong passwords count toward the lockout. The app's
   2FA screen has a password field (all 11 languages).
6. **Facebook account linking.** Facebook's email was treated as verified,
   which lets a Facebook sign-in link to an existing WordQuest account with
   the same email. Facebook is now treated as unverified for linking: it can
   still create a new account, but never attach to an existing one.

### Medium

- **Refresh tokens ignored account status.** A suspended or deleted account
  kept refreshing indefinitely. Refresh now requires ACTIVE and revokes the
  whole chain otherwise. Rotation is atomic, so two parallel refreshes with
  one token can't both mint a pair.
- **TOTP replay race.** The "this code was already used" check and the
  update were two steps. They are now one conditional update.
- **Email enumeration by timing.** An unknown email returned instantly while
  a real one spent a bcrypt cost. Unknown emails now burn an equal check.
- **Forged analytics.** Any player could post `quest_completed`,
  `shop_purchase`, `XP_AWARDED` and similar events into the data the admin
  dashboard reads. Server-only event names are now dropped from client
  batches, and oversized `properties` blobs are discarded.
- **Unbounded inputs.** About 30 request fields (answers, sentences,
  paragraphs, passwords, tokens, names, report text) had no maximum length.
  All have one now. Sentence and paragraph AI routes are limited to 10 a
  minute (they are paid calls).
- **Prompt injection into scoring.** The sentence and paragraph evaluators
  pasted learner text straight into the prompt. It is now fenced in tags and
  declared untrusted, the way Master Challenge already did.
- **Timezone abuse.** Changing timezone resets your local day, so players
  could replay daily caps or rescue a streak. A change is now limited to once
  every 7 days (first-time set and re-sending the same value stay free). New
  column `User.timezoneChangedAt`, migration `20261011120000`.
- **Photo upload URL** had no rate limit; now 10 a minute.
- **Dependencies.** `npm audit fix` on the backend and removal of the unused
  socket.io packages. Production audit is down from 1 critical, 3 high and 2
  moderate to a single moderate (`csv-parse`, used only by the word-import
  script, not the running server).

### Hardening

- iOS no longer sets `NSAllowsArbitraryLoads` (the local-network exception
  stays so Metro dev builds keep working).
- Release builds only accept an `https://` API URL and otherwise fall back to
  the production API, so a stray dev setting can't ship tokens in cleartext.
- CI workflows run with `contents: read`; the Railway CLI is pinned instead of
  floating.
- `docker-compose` binds Postgres and Redis to localhost only.
- The server now logs a loud `SECURITY CONFIG` error at every production boot
  if a JWT secret is under 32 characters, the two JWT secrets are identical,
  or `TWO_FACTOR_ENCRYPTION_KEY` is unset. It warns rather than refusing to
  start, so a weak-but-working secret can't turn into an outage.

## Behaviour changes you should know about

- **Social-only accounts and 2FA.** They have no password they know, so they
  must use "Forgot password" to set one before turning 2FA on.
- **2FA logins use one extra attempt** from the 5-attempt budget (the correct
  password counts until the code succeeds). Five abandoned 2FA logins in a row
  lock the account for 15 minutes. This is deliberate: refunding it would
  re-open the stolen-password-plus-code-guessing loop.
- **Facebook users** whose email matches an existing account will be told to
  use another sign-in method instead of being linked.
- **Timezone** can't be changed more than once a week.

## Still open

Fixed in the follow-up are marked in the Addendum below. What genuinely
remains (none of it is exploitable for account or data takeover):

| Item | Risk | Why it is still open |
|---|---|---|
| Web build stores tokens in `localStorage`, no CSP | An XSS bug would expose tokens | Needs a CSP plus httpOnly cookies and real browser testing; not shipped blind |
| `JwtAuthGuard` doesn't re-check account status | A suspended user keeps a working access token for up to 15 min | Accepted: refresh already checks status. A per-request DB check costs more than it buys |
| Rate limiter state is in-memory per instance | Limits multiply by instance count if you scale out | Only matters past one instance. Move the throttler store to Redis first |
| `EmailVerificationGuard` isn't on the AI routes | Unverified accounts can spend AI quota | Deliberately skipped: it would block core gameplay for new users. Per-minute limits already cap spend |
| Removed group guests can rejoin as a *new* guest | Host can't permanently remove a guest | Guests have no stable identity. Account bans are permanent; guest bans would need device fingerprinting |
| Mobile `npm audit`: 78 findings (2 critical) | All sit in Expo/React Native build tooling, not the shipped app | The fix is an Expo SDK upgrade |
| GitHub Actions pinned by tag, not commit SHA | A compromised action tag runs in CI | Pin to SHAs when convenient |

## What you need to do

1. Push the commits. The migrations (`20261011120000` corrected,
   `20261011130000_chat_flags`, `20261011140000_arcade_group_bans`) apply on
   the Railway deploy. If an earlier run left `20261011120000` marked failed,
   clear it with `prisma migrate resolve --rolled-back` first.
2. In Railway, set `TWO_FACTOR_ENCRYPTION_KEY` (32 random bytes as 64 hex
   characters) and make sure `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
   are different and at least 32 characters. Check the deploy logs for
   `SECURITY CONFIG` lines. Caution on the 2FA key: if anyone has already
   turned on 2FA, their secrets are encrypted with the fallback key, and
   adding a dedicated key later would make them undecryptable. Only set it
   now if nobody has enabled 2FA yet; otherwise tell me and I'll add a
   key-migration step first.
3. Rebuild the iOS app natively (ATS change), then ship an app update for the
   2FA password field.
4. Add an S3/R2 lifecycle rule that deletes unconfirmed uploads after a day.

## Addendum: follow-up fixes and chat moderation

### Items from "still open" that are now fixed

- **Friend request to someone who blocked you** returned 403, which revealed
  the block. It now answers like a normal pending request.
- **Host-removed members could rejoin by link.** New `ArcadeGroupBan` table:
  removing an account now bans it from that group. (Guests can still rejoin
  as a new guest; see above.)
- **Guest nicknames and display names** had no profanity filter and no
  bidi/zero-width stripping. Guest names and registration/profile names are
  now filtered (a deliberately narrower filter than chat, so real names such
  as Shittu, Dick or Cockburn still pass) and invisible direction-override
  characters are stripped.
- **Upload confirm didn't check the file.** Confirming an avatar now reads the
  uploaded bytes and checks the magic number (JPEG or PNG only, which are the two types the app uploads).
  A non-image is rejected and removed.
- **AI submissions could be double-sent.** A per-attempt in-memory lock means
  two parallel submissions of the same quest answer produce one paid AI call.

### Word Duel chat: reporting and word flagging

Typed chat with strangers stays, but it is now policed:

- **Report an insult.** Every opponent message has a visible *Report* control
  (insults, offensive language, threats, spam or links). The reported message
  disappears from the reporter's chat immediately and the server never
  returns it to them again. One report per player per message.
- **Sensitive words are flagged, not just refused.** Profanity, slurs and
  threats (including spaced, leetspeak and repeated-letter evasions) are
  blocked as before, and now each one is recorded in a new `chat_flags`
  ledger with severity BLOCKED. Mild insults ("idiot", "stupid") are
  delivered but recorded as INSULT. Reports from the other player are
  recorded as REPORTED.
- **Automatic chat mute.** Thresholds in `CHAT_SAFETY_CONFIG` temporarily mute
  chat for repeat offenders (distinct reporters are counted so one person
  can't mute someone alone). A mute blocks chat only, never play.
- **Review.** `GET /moderation/chat-flags` lists flags for admins.
- The same safety service now backs Versus chat.

New migrations: `20261011130000_chat_flags`, `20261011140000_arcade_group_bans`.

