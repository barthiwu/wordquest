// WordQuest backend — Railway Infrastructure as Code (V19 Stabilization
// Pass §14: production database and deployment).
//
// This is the INTENDED target configuration, not a config Railway has
// necessarily already converged to. Apply it with:
//   railway config plan     # safe, read-only diff against the live project
//   railway config apply    # applies the plan after confirmation
// `railway config plan` is what to run first after any edit here — it
// shows exactly what would change before anything touches the real
// staging/production environments.
//
// Honesty note (same spirit as backend/Dockerfile's own "Validation
// note"): Railway's Infrastructure-as-Code system (`.railway/railway.ts`)
// is a newer, still-evolving surface as of when this was authored
// (Aug 2026) — this file was written against Railway's own IaC
// reference docs, not exercised against a live Railway project from
// this sandbox (no network route out to railway.com's API here). Run
// `railway config plan` and read the diff carefully before the first
// `apply`, and prefer it over hand-editing service settings in the
// dashboard afterward so this file stays the source of truth.
//
// One-time setup this file does NOT do for you (see docs/DEPLOYMENT.md):
//   - Creating the Railway project itself and connecting this repo's
//     GitHub source to the "backend" service (`railway config pull`
//     after that exists will reconcile any drift from what's below).
//   - Setting the backend service's Root Directory to "backend" in the
//     dashboard on first creation. This repo is a monorepo (backend/
//     alongside mobile/), so Railway's own root-Dockerfile auto-detection
//     only finds backend/Dockerfile once the service's source root is
//     backend/ — which is also exactly what deploy.yml's `railway up`
//     step uploads (it `cd`s into backend/ first), so this one setting
//     keeps both trigger paths (a dashboard-connected GitHub push, and
//     CI's `railway up`) pointed at the same Dockerfile consistently.
//     Deliberately NOT set via a RAILWAY_DOCKERFILE_PATH env var here —
//     that path is relative to whatever the current source root already
//     is, so its correct value differs between the two trigger paths
//     above; Root Directory is the one setting both agree on.
//   - Minting the RAILWAY_TOKEN / RAILWAY_SERVICE GitHub Environment
//     secrets deploy.yml uses to call `railway up` in CI.
//   - Enabling Postgres PITR (Backups tab -> Enable PITR) — see
//     docs/DEPLOYMENT.md's backup/restore runbook; not something this
//     declarative config can turn on today per Railway's own docs.

import { defineRailway, project, service, postgres, preserve } from "railway/iac";

export default defineRailway((ctx) => {
  const prod = ctx.isEnvironment("production");

  // Managed Postgres — automatic volume backups (daily/weekly/monthly)
  // plus opt-in PITR are provider-level features, not application code;
  // see docs/DEPLOYMENT.md for enabling PITR and the restore runbook.
  const db = postgres("postgres");

  const backend = service("backend", {
    // Root Directory = "backend" is set once on the service itself (see
    // the header comment above) — NOT declared here, since this file's
    // schema for that setting isn't confirmed and the dashboard is the
    // one place both deploy trigger paths agree on unambiguously.
    healthcheck: "/api/v1/health",
    healthcheckTimeout: 30,
    // One instance is enough at beta scale; bump for production once
    // real traffic justifies it rather than guessing a number now.
    replicas: prod ? 1 : 1,
    env: {
      NODE_ENV: "production",
      DATABASE_URL: db.env.DATABASE_URL,
      // Secrets Railway already holds (set once via `railway variables
      // set`, the dashboard, or GitHub Environment secrets synced in) —
      // preserve() means this config never overwrites them with a blank
      // value, since real secrets aren't readable back out of Railway
      // into this file.
      JWT_ACCESS_SECRET: preserve(),
      JWT_REFRESH_SECRET: preserve(),
      AI_PROVIDER_API_KEY: preserve(),
      EMAIL_API_KEY: preserve(),
      S3_ACCESS_KEY_ID: preserve(),
      S3_SECRET_ACCESS_KEY: preserve(),
      // Non-secret values are safe to declare directly rather than
      // preserve() — see backend/.env.example for what each controls.
      API_PREFIX: "api/v1",
      JWT_ACCESS_EXPIRES_IN: "15m",
      JWT_REFRESH_EXPIRES_IN: "30d",
    },
  });

  return project("wordquest", {
    resources: [db, backend],
  });
});
