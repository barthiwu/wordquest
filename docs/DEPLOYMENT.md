# Deployment

Status: **hosting target chosen (Railway), staging/production not yet
provisioned.** V19 Stabilization Pass §14 required picking a real target
rather than leaving deployment as an open-ended skeleton. What exists today:
a production-shaped Docker image, a CI pipeline that exercises the full test
suite (unit + e2e) on every push, a deploy pipeline that builds, migrates,
and deploys to a Railway "staging" environment end-to-end, and
`.railway/railway.ts` declaring the intended Railway project shape. What's
still a one-time manual step for whoever stands this up for real: actually
creating the Railway project/services (below) and populating the GitHub
Environment secrets the pipeline needs — none of that can be done from a
repo commit alone, since it requires an authenticated Railway account.

**Analytics**: self-hosted — `AnalyticsService` logs events (account
created, quest completed, Boss Battle joined, shop purchase, ...) to the
backend's own `analytics_events` table via a fire-and-forget `track()`
call, never a third-party analytics product. No extra credentials or
provider setup needed; it's already wired into the services above and
ships with the same migrations as everything else.

**Mobile / Android build**: not covered by this file — see
[`ANDROID_BUILD.md`](./ANDROID_BUILD.md) for the EAS/Play Console
checklist (separate from this backend deploy pipeline, and equally
gated on one-time account setup only you can do).

**Why Railway:** managed Postgres with automatic volume backups and
opt-in point-in-time recovery built in (a provider setting, not application
code to write and maintain), usage-based pricing appropriate for a beta's
traffic level, and a minimal surface to misconfigure — no VPC/IAM/ECS/
subnet decisions the way AWS would require. Render was the runner-up
(similar simplicity, slightly less generous free-tier Postgres); AWS was
ruled out for beta as the most powerful but also most misconfigurable
option, better revisited once WordQuest has production traffic that
justifies the operational overhead.

**Security review and crash testing** (V22 §15): see
[`SECURITY_REVIEW_V22.md`](./SECURITY_REVIEW_V22.md) — a code review plus
live fault-injection pass covering auth, authorization, data handling,
and eleven crash-test cases against a running instance. One real bug
(an oversized request body returning `500` instead of `413`) was found
and fixed; no exploitable vulnerability was found. Two low-risk,
non-blocking hardening items are noted there for future consideration.

## The image

`backend/Dockerfile` is a multi-stage build:

1. `deps` — `npm ci` once, cached and reused by the next stage.
2. `build` — reuses `deps`, adds devDependencies, compiles TypeScript via
   `npm run build` (`nest build`).
3. `runtime` — a **fresh** `npm ci --omit=dev` (not a copy of `deps`'
   `node_modules`, which still has the TS toolchain in it), regenerates the
   Prisma client against that production install, copies in the compiled
   `dist/` from the `build` stage, and runs as a non-root user.

The entrypoint is `node dist/src/main` — `nest build`'s `outDir` is `dist`
with `sourceRoot: "src"` preserved, so the compiled entrypoint lands at
`dist/src/main.js`, not `dist/main.js`. (This was a real, pre-existing bug in
both the Dockerfile's first draft and `package.json`'s `start:prod` script,
caught by actually running the compiled build locally rather than assuming
the path — see the Validation section below.)

The image does **not** run migrations on boot. `prisma migrate deploy` is a
separate, explicit pipeline step (see `.github/workflows/deploy.yml`'s
`migrate-staging` job) that runs once per release, before the new containers
take traffic. Baking it into the container's startup would mean every
replica races to migrate concurrently on every restart — exactly the
failure mode a deploy pipeline exists to prevent.

Build it locally with:

```bash
cd backend
docker build -t wordquest-backend:local .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgresql://wordquest:wordquest@host.docker.internal:5432/wordquest \
  -e JWT_ACCESS_SECRET=local-dev-only \
  -e JWT_REFRESH_SECRET=local-dev-only \
  wordquest-backend:local
```

### Validation note

The image's `docker build` itself has **not** been run in this repo's
authoring environment — that sandbox has no network route to
`registry-1.docker.io` (blocked by its egress allowlist; `npm`/`git` work
fine, Docker Hub does not), so the base-image pull fails before the build
can even start. What was verified directly instead: `npm run build` (the
exact `nest build` the image's `build` stage runs) was run locally, and its
output was started with `node dist/src/main` and confirmed to boot cleanly
and serve a healthy `GET /api/v1/health` — the same command the image's
`CMD` runs. `.github/workflows/ci.yml` and `deploy.yml` run on GitHub's
runners, which do have registry access, so the *first* real `docker build`
of this image happens there — worth watching closely on its first run in
case something about the containerized filesystem (as opposed to this local
check) surfaces something this validation couldn't catch.

## CI (`.github/workflows/ci.yml`)

Runs on every push/PR to `main`/`develop`. Two jobs:

- **backend** — lint, typecheck, `prisma generate`, `prisma migrate deploy`
  against a Postgres service container, unit tests (`npm run test`), then
  `prisma db seed` + full e2e tests (`npm run test:e2e`) against that same
  seeded database. The e2e suite only needs `DATABASE_URL` and the two JWT
  secrets — everything else in `AppConfig` (AI provider, Azure Speech, S3,
  email) is optional at boot, and the stages that depend on those providers
  are deliberately out of e2e's scope (see `backend/test/quests.e2e-spec.ts`'s
  doc comment) since CI has no live third-party credentials and shouldn't.
- **mobile** — lint, typecheck, and `npm run test` (the `jest-expo` unit
  suite).

Neither job builds or pushes the Docker image — that's `deploy.yml`'s job,
kept separate so a routine PR doesn't require registry credentials.

## Deploy pipeline (`.github/workflows/deploy.yml`)

Triggers on a `v*` tag push or manual dispatch. Three jobs, in order:

1. **build-and-push** — builds `backend/Dockerfile` and pushes it to GitHub
   Container Registry (`ghcr.io/<repo>/backend`, tagged by both short SHA and
   `latest`). Needs no secrets beyond the automatic `GITHUB_TOKEN`. This
   image is a versioned audit/manual-rollback artifact — Railway does NOT
   pull it; Railway builds its own copy from the same `backend/Dockerfile`
   independently (see job 3).
2. **migrate-staging** — runs `prisma migrate deploy` against
   `STAGING_DATABASE_URL`, a `staging` GitHub Environment secret. The
   command is real (the same one documented in `backend/README.md`); the
   secret's value is the Railway Postgres service's **public** connection
   string (see setup step 3 below) — GitHub's runners aren't on Railway's
   private network, so the public proxy endpoint is what a CI runner can
   actually reach.
3. **deploy** — installs the Railway CLI and runs `railway up --service
   backend --environment staging --ci`, authenticated via the `RAILWAY_TOKEN`
   GitHub Environment secret (a Railway project token scoped to `staging`).
   This uploads the checked-out repo and triggers Railway's own Dockerfile
   build, then rolls the staging service to the new build once healthy
   (`healthcheck: "/api/v1/health"` in `.railway/railway.ts`).

Both `STAGING_DATABASE_URL` and `RAILWAY_TOKEN`/`RAILWAY_SERVICE` are empty
until the one-time Railway project setup below is done.

## Railway project setup (one-time)

Whoever stands up staging for real does this once, roughly in order:

1. **Create the Railway project** at railway.com, connect it to this repo's
   GitHub source, and add a service named `backend` with its **Root
   Directory set to `backend`** (Settings -> Source). This repo is a
   monorepo (`backend/` alongside `mobile/`), so this is what makes
   Railway's own root-Dockerfile auto-detection find `backend/Dockerfile`
   — and it's also exactly what `deploy.yml`'s `railway up` step uploads
   (it `cd`s into `backend/` first), so this one setting keeps both
   possible trigger paths pointed at the same Dockerfile. Add a Postgres
   database to the same project (Railway's own managed Postgres, not an
   external one — that's what makes the backup/restore story below apply).
2. **Reconcile `.railway/railway.ts`** against the project you just created:
   `railway link`, then `railway config plan` to see the diff, then
   `railway config apply`. Read the diff — this file was authored against
   Railway's IaC docs, not exercised against a live project from this
   sandbox (see the file's own header comment).
3. **Get the Postgres public connection string**: Postgres service -> Connect
   tab -> "Public Network" (distinct from the private `DATABASE_URL` the
   backend service uses internally, which stays on Railway's private
   network). Store it as the `STAGING_DATABASE_URL` secret on a `staging`
   GitHub Environment in this repo.
4. **Mint a Railway project token** scoped to the `staging` environment
   (Project Settings -> Tokens) and store it as the `RAILWAY_TOKEN` GitHub
   Environment secret; store the backend service's name (`backend`, if left
   as-is) as `RAILWAY_SERVICE`.
5. **Set the real secrets** Railway holds for the backend service —
   `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` as real random values (never the
   `local-dev-only-*` placeholders in `backend/.env.example`), plus the AI/
   S3/email provider credentials once those features are meant to work in
   that environment (see `backend/.env.example` for the full list, each with
   a comment on where it comes from) — via `railway variables set` or the
   dashboard, not `.railway/railway.ts` (that file declares `preserve()` for
   these precisely so it never overwrites them with a blank value).
6. **Enable Postgres PITR**: Postgres service -> Backups tab -> Enable PITR.
   Off by default; see the backup/restore runbook below for what it buys and
   how to use it. Volume backups (daily/weekly/monthly snapshots) are on by
   default and need no setup.
7. **Repeat for production** once staging has proven itself — a second
   Railway environment (`railway environment new production`), its own
   Postgres, its own GitHub Environment + secrets, and a second
   `migrate-production`/`deploy-production` pair of jobs mirroring the
   staging ones in `deploy.yml`, gated behind a manual approval (a GitHub
   Environment protection rule) rather than firing automatically on every
   tag the way staging does.

## Backup and restore runbook (Railway Postgres)

Railway's managed Postgres gives three independent layers — know which one
answers which kind of "we need the data back" situation:

- **Volume backups** — automatic snapshots of the whole database volume:
  daily (kept 6 days), weekly (kept 1 month), monthly (kept 3 months). No
  setup needed, on by default. Restore from the Postgres service's Backups
  tab — one click restores **the same service** to a snapshot, with staged
  changes shown for review before they're applied. This is the first place
  to look for "someone dropped a table an hour ago."
- **Point-in-time recovery (PITR)** — continuous WAL archiving, restorable
  to any timestamp within roughly the last 4 weeks (not just a backup's
  snapshot moment). Must be enabled once (step 6 above) before it starts
  accumulating history — it cannot recover to a time before it was turned
  on. A PITR restore provisions a **new sibling** Postgres service at the
  chosen timestamp rather than mutating the original, which stays up and
  serving traffic the whole time — cut over by pointing the backend
  service's `DATABASE_URL` at the new sibling once it's verified, then
  decommission the old one. This is the tool for "we need last Tuesday
  3:14pm specifically" or for testing a suspect migration's blast radius
  without touching production.
- **Logical dumps (`pg_dump`)** — a manual, portable export outside
  Railway's own storage entirely, restorable with `pg_restore` anywhere
  Postgres runs, including a laptop. Not automatic; run one before any
  deliberately risky operation (a destructive migration, a bulk data
  correction) as a belt-and-suspenders copy independent of the provider,
  and periodically as an offsite copy so a Railway project-level mistake
  (accidental deletion) doesn't take every copy of the data with it.

**A backup that has never been restored is unverified.** Periodically
practice an actual restore into a scratch Railway service (or a local
Postgres via `pg_restore` from a logical dump) rather than assuming the
automatic layers work — this is a cheap drill compared to discovering a gap
during a real incident.

## Rollback and environment variables

**Rollback strategy**: because migrations run as a separate pipeline step
before the new deploy takes traffic (never inside the container), rolling
back a bad *application* deploy is redeploying the previous known-good
commit/tag via `railway up` (or restoring the `ghcr.io` image locally as a
reference for what that build contained). Rolling back a bad *migration* is
harder — Prisma has no built-in `migrate down`, so schema changes should be
written additively/backward-compatible where practical (add a nullable
column and backfill, rather than a destructive rename, for example) so the
previous deploy keeps working against the new schema until a proper
follow-up migration lands. A destructive migration should have a
written-out manual rollback plan in its PR description before it merges,
and — per the runbook above — is exactly the case for taking a manual
`pg_dump` immediately beforehand.

**Pre-deploy uniqueness check** (V22 §14 finding): two migrations add a
`CREATE UNIQUE INDEX` to a table that could already hold rows —
`words_normalizedWord_key` and `quest_cards_userId_source_sourceEventId_key`.
Neither loses data, but on a real production database that already has
duplicate values in those columns, `prisma migrate deploy` will hard-fail
partway through the deploy rather than silently succeed. Before the very
first production migration run (or any run that includes these two if
they haven't shipped yet), check for duplicates first and resolve them
before deploying:

```sql
SELECT "normalizedWord", COUNT(*) FROM words GROUP BY 1 HAVING COUNT(*) > 1;
SELECT "userId", "source", "sourceEventId", COUNT(*) FROM quest_cards
  GROUP BY 1, 2, 3 HAVING COUNT(*) > 1;
```

Both should return zero rows against a database that only ever went
through this application's own write paths (both are enforced at the
application level today) — a non-empty result means something wrote
around that logic and needs investigation before the index can apply.

## Monitoring and error tracking

Error tracking is `MonitoringService` (`backend/src/common/monitoring.service.ts`),
wired into `AllExceptionsFilter` — every unhandled exception across every
route passes through it exactly once. It always logs locally first
(structured, via Nest's own `Logger`), then additionally forwards to
Sentry **only when `SENTRY_DSN` is set**. There's no separate "on/off"
flag: presence of `SENTRY_DSN` is the switch.

- **Unconfigured (no `SENTRY_DSN`)** — the default for local dev and CI.
  Every exception still gets a structured local log line (message, stack,
  and any extra context as JSON) via Nest's Logger, so nothing is silently
  swallowed; it just never leaves the process. This is intentional — dev
  and CI runs should never need a real Sentry project.
- **Configured (`SENTRY_DSN` set)** — `MonitoringService.init()` runs once
  from `main.ts`'s `bootstrap()`, before the app accepts traffic, calling
  `Sentry.init({ dsn, environment })`. `environment` is `AppConfigService.env`
  (e.g. `production`, `staging`), so events land tagged correctly in
  Sentry's own environment filter. `tracesSampleRate` is left at its
  default of 0 — this is error tracking only, not performance tracing, so
  it adds no request-latency overhead.
- **During an incident**: filter the Sentry project's Issues view by
  `environment:production` (or whichever environment is affected). Each
  issue carries the request context passed as `captureException`'s
  `context` argument at the call site, plus the full stack trace. A
  Sentry-reported error should always have a matching structured log line
  in Railway's own log viewer for the same timestamp/message — cross-
  reference the two if the Sentry context alone isn't enough to reproduce.
  `MonitoringService.captureException` never throws, even if the Sentry
  SDK itself fails (e.g. transient network issue reaching Sentry's
  ingest endpoint) — a monitoring outage can never become the reason a
  request fails differently than it otherwise would have, but it does
  mean Sentry availability isn't guaranteed to be complete; the local
  structured logs remain the source of truth.
- **Setting it up for a new environment**: create a Sentry project, copy
  its DSN into that Railway service's `SENTRY_DSN` variable, and redeploy
  — `isConfigured()` (`AppConfigService.isMonitoringConfigured`) flips to
  true automatically on next boot, no code change needed. No DSN means no
  Sentry project is required to run this app anywhere, beta included.

**Environment variable checklist** for a new environment — copy
`backend/.env.example` and fill in every value on the Railway service (or
via `.railway/railway.ts`'s `preserve()`d entries plus `railway variables
set`). `DATABASE_URL`, the two `JWT_*_SECRET` values, and the two
`JWT_*_EXPIRES_IN` duration strings are validated eagerly in `main.ts`'s
`bootstrap()` before the server starts accepting requests — a missing
secret or malformed duration fails deployment immediately, not at the
first login/refresh. Everything else (AI/S3/email credentials,
`SENTRY_DSN`) is optional with a graceful degradation — each one's own
`isConfigured()` gate (`AppConfigService`) just returns false and the
owning service falls back to a no-op or local logging, so a missing one
fails later, at the first request that needs it, not at startup.
`REDIS_URL` is read into `AppConfig` but nothing in the codebase
currently consumes it — no Redis service needs provisioning on Railway
unless that changes.

**`DATABASE_URL` connection pool sizing** (V22 §5/§15 stress testing
finding): without an explicit `connection_limit` query parameter,
Prisma sizes its pool from the container's CPU count
(`num_physical_cpus * 2 + 1`) — on a small Railway instance (1-2 vCPU)
that can be as low as 3-5 connections. Boss Battle's answer-submission
path opens one interactive transaction per request (its duplicate-
submission CAS claim has to be atomic with the whole reward sequence,
so it can't be a pre-transaction check the way finalization's claim
is), so a burst of concurrent players answering at once can exhaust an
undersized pool and start failing with "transaction already closed"
instead of the fast, correct rejection a losing racer should get.
Set `connection_limit` explicitly for every real deployment — see the
comment above `DATABASE_URL` in `backend/.env.example` for sizing
guidance — and raise `pool_timeout` alongside it if `connection_limit`
is pushed well above what's typically free. `submitAnswer`'s own
transaction also widens `maxWait`/`timeout` to 10s so a temporary
burst degrades to "slower" rather than outright failing, but that is
not a substitute for sizing the pool correctly.
