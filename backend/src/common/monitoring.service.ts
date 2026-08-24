import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { AppConfigService } from '../config/config.service';

/**
 * Error tracking (V20 Beta Release Checklist §13: "Production: ...
 * Monitoring, Error tracking"). Same isConfigured() gate as
 * EmailService/ObjectStorageService/AliService elsewhere in this
 * codebase: unconfigured (no SENTRY_DSN) falls back to structured local
 * logging via Nest's own Logger, so local dev and CI never need a real
 * Sentry project, and nothing about request handling depends on Sentry
 * actually being reachable.
 *
 * init() is called once from main.ts's bootstrap(), before the app
 * starts handling requests. AllExceptionsFilter (src/common/filters)
 * is this service's only caller during normal operation — every
 * unhandled exception across every route passes through here exactly
 * once, so there's a single place error volume/rate could be reasoned
 * about later, not one per controller.
 */
@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private initialized = false;

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return this.config.isMonitoringConfigured;
  }

  /** Idempotent — safe to call more than once (e.g. once from bootstrap(), once defensively from a test setup). A no-op when unconfigured. */
  init(): void {
    if (!this.isConfigured() || this.initialized) return;
    Sentry.init({
      dsn: this.config.sentryDsn,
      environment: this.config.env,
      // Errors only — this is a stability/error-tracking integration,
      // not a performance-tracing one; tracesSampleRate stays at its
      // default (0) so this never adds request-latency overhead.
    });
    this.initialized = true;
  }

  /**
   * Reports an exception. Always logs locally first (structured, via
   * Nest's Logger — searchable in any log aggregator regardless of
   * Sentry) and additionally forwards to Sentry when configured. Never
   * throws — a monitoring failure must never become the reason a
   * request fails differently than it otherwise would have.
   */
  captureException(error: unknown, context?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.logger.error(err.message, err.stack, context ? JSON.stringify(context) : undefined);

    if (!this.isConfigured()) return;
    try {
      Sentry.captureException(err, context ? { extra: context } : undefined);
    } catch {
      // Never let a monitoring-provider failure surface as anything
      // other than the local log line already written above.
    }
  }
}
