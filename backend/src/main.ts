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

  await app.listen(config.port);
  // eslint-disable-next-line no-console
  console.log(`WordQuest API listening on :${config.port}/api/v1`);
}

bootstrap();
