/* eslint-disable no-console */
import autocannon from 'autocannon';

/**
 * Load testing scaffold (Sprint 5 QA checklist). Deliberately NOT wired
 * into CI — it needs a real running server (and a seeded DB) to point
 * at, which no CI job here stands up. Run it by hand against a local or
 * staging deployment:
 *
 *   npm run start:dev              # in one terminal
 *   npm run load-test              # in another
 *
 * Override the target with BASE_URL (default http://localhost:3000).
 *
 * What it exercises: a realistic mix of the app's actual hot paths
 * rather than one single endpoint — login (already-registered probe
 * user, see below), the Quest catalog read, and the Boss Battle
 * leaderboard read (the one endpoint the mobile client polls every few
 * seconds during a LIVE battle — see BossBattleLeaderboardScreen's
 * LIVE_POLL_INTERVAL_MS — making it the single most load-sensitive read
 * in the app). Each scenario reports its own req/sec and latency
 * percentiles; there's no baked-in pass/fail threshold here because
 * that depends on target infrastructure this scaffold doesn't know
 * about — read the p99 and error-rate lines and judge against whatever
 * SLA the deployment target actually needs.
 *
 * Prerequisites for the probe account (register/set up once, out of
 * band — this script logs in rather than registering fresh, since
 * hammering /auth/register would just collide with its own 5/min
 * throttle limit and test the rate limiter instead of the thing you
 * actually want measured):
 *   1. It must already be registered (any client, or `curl`).
 *   2. It must have POSTed /api/v1/boss-battle/join at least once, or
 *      the leaderboard scenario below 404s ("You have not joined a Boss
 *      Battle") instead of measuring anything useful.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const PROBE_EMAIL = process.env.LOAD_TEST_EMAIL;
const PROBE_PASSWORD = process.env.LOAD_TEST_PASSWORD;
const DURATION_SECONDS = Number(process.env.LOAD_TEST_DURATION ?? 20);
const CONNECTIONS = Number(process.env.LOAD_TEST_CONNECTIONS ?? 20);

async function login(): Promise<string> {
  if (!PROBE_EMAIL || !PROBE_PASSWORD) {
    throw new Error(
      'Set LOAD_TEST_EMAIL and LOAD_TEST_PASSWORD to an already-registered account before running the load test.',
    );
  }
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: PROBE_EMAIL, password: PROBE_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Probe login failed (${res.status}) — check LOAD_TEST_EMAIL/PASSWORD.`);
  }
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

async function runScenario(
  name: string,
  path: string,
  opts: Omit<autocannon.Options, 'url'>,
): Promise<void> {
  console.log(`\n=== ${name} ===`);
  const result = await autocannon({
    url: `${BASE_URL}${path}`,
    duration: DURATION_SECONDS,
    connections: CONNECTIONS,
    ...opts,
  });
  console.log(autocannon.printResult(result));
}

async function main() {
  console.log(`Load test target: ${BASE_URL}`);
  console.log(`Duration: ${DURATION_SECONDS}s, connections: ${CONNECTIONS}`);

  const accessToken = await login();
  const authHeaders = { authorization: `Bearer ${accessToken}` };

  await runScenario('GET /quests (catalog read)', '/api/v1/quests', {
    method: 'GET',
    headers: authHeaders,
  });

  await runScenario(
    'GET /boss-battle/leaderboard (the hottest poll path — see doc comment above)',
    '/api/v1/boss-battle/leaderboard',
    { method: 'GET', headers: authHeaders },
  );

  await runScenario(
    'POST /auth/login (credential endpoint, own tight throttle)',
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: PROBE_EMAIL, password: PROBE_PASSWORD }),
      // Login is intentionally throttled to 10/min per IP (see
      // AuthController) — a full-strength hammer here mostly measures the
      // throttle guard, not the login path itself, so this scenario runs
      // at a much lower rate to get a meaningful pre-throttle latency read.
      connections: Math.min(CONNECTIONS, 5),
    },
  );

  console.log('\nDone. There is no baked-in pass/fail threshold — judge the req/sec, latency');
  console.log('percentiles (p50/p99), and non-2xx count above against your target SLA.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
