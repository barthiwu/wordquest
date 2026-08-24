import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ms, { type StringValue } from 'ms';

/**
 * Typed facade over Nest's ConfigService so the rest of the app never
 * does `config.get('some.stringly.typed.path')` with no safety net.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get env(): string {
    return this.config.get<string>('env', 'development');
  }

  get isProduction(): boolean {
    return this.env === 'production';
  }

  get port(): number {
    return this.config.get<number>('port', 3000);
  }

  get corsOrigin(): string {
    const value = this.config.get<string>('corsOrigin', '*');
    // V21 Beta Release Candidate Spec §12 "Authentication Production
    // Review": a production deploy that forgets to set CORS_ORIGIN must
    // fail loudly at startup, not silently boot with
    // Access-Control-Allow-Origin: * AND credentials: true (see
    // main.ts's enableCors) — that combination lets any origin make
    // authenticated requests carrying the player's auth headers.
    // Non-production environments keep the permissive default so local
    // dev/CI never need a real origin configured.
    if (this.isProduction && value === '*') {
      throw new Error(
        'CORS_ORIGIN must be set to a specific origin in production — refusing to boot with a wildcard CORS policy.',
      );
    }
    return value;
  }

  get databaseUrl(): string {
    const url = this.config.get<string>('database.url');
    if (!url) throw new Error('DATABASE_URL is not set');
    return url;
  }

  get redisUrl(): string {
    return this.config.get<string>('redis.url', 'redis://localhost:6379');
  }

  get jwtAccessSecret(): string {
    const secret = this.config.get<string>('auth.accessSecret');
    if (!secret) throw new Error('JWT_ACCESS_SECRET is not set');
    return secret;
  }

  get jwtAccessExpiresIn(): StringValue {
    return this.parseDuration('auth.accessExpiresIn', '15m');
  }

  get jwtRefreshSecret(): string {
    const secret = this.config.get<string>('auth.refreshSecret');
    if (!secret) throw new Error('JWT_REFRESH_SECRET is not set');
    return secret;
  }

  get jwtRefreshExpiresIn(): StringValue {
    return this.parseDuration('auth.refreshExpiresIn', '30d');
  }

  /**
   * Word in the Wild's photo evidence needs an S3-compatible bucket
   * (Cloudflare R2 today — same API surface as AWS S3, so no code
   * difference if that ever changes). Unconfigured until these four env
   * vars are set on a real machine; nothing in this app requires them at
   * startup, only the photo-evidence path checks `isStorageConfigured`
   * before touching any of them.
   */
  get isStorageConfigured(): boolean {
    return Boolean(
      this.config.get('storage.endpoint') &&
      this.config.get('storage.bucket') &&
      this.config.get('storage.accessKeyId') &&
      this.config.get('storage.secretAccessKey'),
    );
  }

  get storageEndpoint(): string {
    const v = this.config.get<string>('storage.endpoint');
    if (!v) throw new Error('S3_ENDPOINT is not set');
    return v;
  }

  get storageRegion(): string {
    // R2 doesn't use real AWS regions — "auto" is its documented value.
    // Override via S3_REGION for a provider that does (e.g. real AWS S3).
    return this.config.get<string>('storage.region', 'auto');
  }

  get storageBucket(): string {
    const v = this.config.get<string>('storage.bucket');
    if (!v) throw new Error('S3_BUCKET is not set');
    return v;
  }

  get storageAccessKeyId(): string {
    const v = this.config.get<string>('storage.accessKeyId');
    if (!v) throw new Error('S3_ACCESS_KEY_ID is not set');
    return v;
  }

  get storageSecretAccessKey(): string {
    const v = this.config.get<string>('storage.secretAccessKey');
    if (!v) throw new Error('S3_SECRET_ACCESS_KEY is not set');
    return v;
  }

  /**
   * Word in the Wild's evidence assessment (text and photo) needs an
   * Anthropic API key. Same "checked only where used" pattern as storage.
   */
  get isAiConfigured(): boolean {
    return Boolean(this.config.get('ai.apiKey'));
  }

  get aiApiKey(): string {
    const v = this.config.get<string>('ai.apiKey');
    if (!v) throw new Error('AI_PROVIDER_API_KEY is not set');
    return v;
  }

  get aiModel(): string {
    return this.config.get<string>('ai.model', 'claude-sonnet-5');
  }

  get isEmailConfigured(): boolean {
    return Boolean(this.config.get('email.apiKey') && this.config.get('email.fromAddress'));
  }

  get emailApiKey(): string {
    const v = this.config.get<string>('email.apiKey');
    if (!v) throw new Error('EMAIL_API_KEY is not set');
    return v;
  }

  get emailFromAddress(): string {
    const v = this.config.get<string>('email.fromAddress');
    if (!v) throw new Error('EMAIL_FROM_ADDRESS is not set');
    return v;
  }

  get appBaseUrl(): string {
    return this.config.get<string>('app.baseUrl', 'https://app.wordquest.example');
  }

  /**
   * Error tracking (V20 Beta Release Checklist §13). Same "checked only
   * where used" pattern as storage/AI/email above — MonitoringService
   * falls back to structured local logging when this is false, rather
   * than the app refusing to start without a Sentry project configured.
   */
  get isMonitoringConfigured(): boolean {
    return Boolean(this.config.get('monitoring.sentryDsn'));
  }

  get sentryDsn(): string {
    const v = this.config.get<string>('monitoring.sentryDsn');
    if (!v) throw new Error('SENTRY_DSN is not set');
    return v;
  }

  /**
   * JwtSignOptions.expiresIn (via jsonwebtoken/ms) is typed as
   * `number | ms.StringValue`, not a plain string — a duration like
   * "15m" or "30d". Validating here, once, means a malformed
   * JWT_ACCESS_EXPIRES_IN/JWT_REFRESH_EXPIRES_IN env var fails fast at
   * startup with a clear error (see main.ts's bootstrap(), which reads
   * jwtAccessExpiresIn/jwtRefreshExpiresIn before app.listen()), instead
   * of failing inside jsonwebtoken on the first login attempt.
   */
  private parseDuration(path: string, fallback: StringValue): StringValue {
    const value = this.config.get<string>(path, fallback);
    if (ms(value as StringValue) === undefined) {
      throw new Error(
        `Invalid duration string for ${path}: "${value}" (expected e.g. "15m", "30d")`,
      );
    }
    return value as StringValue;
  }
}
