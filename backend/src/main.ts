import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { MonitoringService } from './common/monitoring.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const config = app.get(AppConfigService);

  // Error tracking (V20 Beta Release Checklist §13) — a no-op when
  // SENTRY_DSN isn't set, same as every other isConfigured()-gated
  // integration in this codebase. Initialized before app.listen() so
  // it's ready before the first request can hit AllExceptionsFilter.
  app.get(MonitoringService).init();

  // Session security (V20 Beta Release Checklist §12): a missing
  // JWT_ACCESS_SECRET/JWT_REFRESH_SECRET, or a malformed
  // JWT_ACCESS_EXPIRES_IN/JWT_REFRESH_EXPIRES_IN, must fail deployment
  // at startup, not silently boot a server that only breaks the first
  // time a real user tries to log in or refresh. Every getter here
  // already throws on a missing/invalid value — reading them here just
  // moves that failure earlier. databaseUrl gets the same treatment for
  // the same reason. corsOrigin (V21 §12) throws on its own if it's
  // still the wildcard default in production — included here so a
  // wide-open CORS misconfiguration fails at the exact same startup
  // gate as every other production secret, not just wherever
  // enableCors happens to be called below.
  const requiredAtStartup = [
    config.databaseUrl,
    config.jwtAccessSecret,
    config.jwtRefreshSecret,
    config.jwtAccessExpiresIn,
    config.jwtRefreshExpiresIn,
    config.corsOrigin,
  ];
  if (requiredAtStartup.some((v) => !v)) {
    throw new Error('Required startup configuration is missing.'); // unreachable — the getters above throw first
  }

  app.use(helmet());
  app.enableCors({ origin: config.corsOrigin, credentials: true });

  // All routes are versioned: /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Reject unknown fields / coerce DTO types at the edge — the backend
  // never trusts client-shaped payloads for progression-affecting routes.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Bind explicitly to 0.0.0.0 — Node's default (no host argument) can
  // resolve to an IPv6-only or loopback-only socket depending on the
  // container's network stack, which keeps the process alive and
  // reachable from inside the container (console commands, cron jobs)
  // while Railway's edge proxy gets nothing back from the outside —
  // exactly the "Application failed to respond" symptom this fixes.
  await app.listen(config.port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`WordQuest API listening on 0.0.0.0:${config.port}/api/v1`);
}

bootstrap();
