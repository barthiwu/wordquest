/**
 * Single source of truth for env-derived config. Nothing outside this
 * folder should read `process.env` directly (BUILD_HANDOFF §12, §46).
 *
 * Gameplay-tunable numbers (XP curves, Glyph rewards, CEFR thresholds,
 * battle capacity, etc.) are deliberately NOT here — those live in a
 * dedicated, versioned rules config once the Progression/Game modules
 * land, so design changes don't require touching deploy-time env vars.
 */
export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },

  storage: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },

  ai: {
    apiKey: process.env.AI_PROVIDER_API_KEY,
    model: process.env.AI_PROVIDER_MODEL ?? 'claude-sonnet-5',
  },
  email: {
    // Provider left open — Resend's simple HTTP API is the default
    // EmailService talks to (see its doc comment), but nothing else in
    // this codebase assumes that specific provider; a different one
    // just means swapping EmailService's own send() implementation.
    apiKey: process.env.EMAIL_API_KEY,
    fromAddress: process.env.EMAIL_FROM_ADDRESS,
  },
  app: {
    // Base URL the verification/reset links in emails point at — the
    // MOBILE APP's deep link or web fallback, not this API server.
    baseUrl: process.env.APP_BASE_URL ?? 'https://app.wordquest.example',
  },
  monitoring: {
    // Error tracking (V20 Beta Release Checklist §13 "Production:
    // ... Monitoring, Error tracking"). Unconfigured until SENTRY_DSN
    // is set — same isConfigured() gate as email/storage/AI above, so
    // local dev and CI never need a real Sentry project.
    sentryDsn: process.env.SENTRY_DSN,
  },
});
