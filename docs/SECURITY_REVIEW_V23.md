# WordQuest V23 Security Review

Supersedes the V22 review. This pass was an attacker-minded read of the
backend, mobile app, and CI, with every finding checked against the code
before it was changed. It is a code review, not a third-party penetration
test.

Commits: `50ad320` (backend), `1d4124f` (app + CI). Backend: 1508 tests
pass, `tsc` clean. Mobile: 323 tests pass, `tsc` clean.

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

## Still open (none of these is exploitable for account or data takeover)

| Item | Risk | Suggested next step |
|---|---|---|
| Word Duel allows typed chat with random strangers | Players can pass answers or be abused. Versus chat is already quick-chat-only for strangers | Decision for you: restrict Word Duel strangers to quick chat too |
| Web build stores tokens in `localStorage`, no CSP | An XSS bug would expose tokens | Add a CSP and move web tokens to httpOnly cookies. Needs browser testing, so I didn't ship it blind |
| `JwtAuthGuard` doesn't re-check account status | A suspended user keeps a working access token for up to 15 min | Accept, or add a cached status check |
| Rate limiter state is in-memory per instance | Limits multiply by instance count if you scale out | Move the throttler store to Redis before running more than one instance |
| Upload confirm doesn't verify file type or size server-side | Someone can PUT a non-image to storage | HEAD/magic-byte check at confirm, plus a bucket lifecycle rule for unconfirmed uploads |
| AI submissions can be double-sent | Two parallel submissions both trigger a paid AI call | Claim the quest stage before calling the model |
| Guest nicknames: no profanity filter, no bidi/zero-width stripping | Impersonation, abuse | Normalise and filter nicknames |
| Friend request to someone who blocked you returns 403 | Reveals that you are blocked | Return the same response as a normal pending request |
| Host-removed group members can rejoin by link | Host can't truly remove someone | Track removals per group |
| `EmailVerificationGuard` isn't on the AI routes | Unverified accounts can spend AI quota | Add the guard |
| Mobile `npm audit`: 78 findings (2 critical) | All sit in Expo/React Native build tooling (`@expo/cli`, `tar`, `shell-quote`), not in the shipped app; the fix is an Expo SDK upgrade | Fold into your next SDK upgrade |
| GitHub Actions pinned by tag, not commit SHA | A compromised action tag runs in CI | Pin to SHAs |

## What you need to do

1. Push `93aec47`, `a2f2dab`, `50ad320`, `1d4124f`. The two migrations from
   the chat/reminder work and `20261011120000` apply automatically on the
   Railway deploy.
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
5. Tell me what you want to do about Word Duel typed chat with strangers.
