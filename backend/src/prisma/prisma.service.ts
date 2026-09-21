import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { withConnectionLimitFloor } from './connection-url';

/**
 * Thin wrapper around PrismaClient so it participates in Nest's DI/lifecycle.
 * PostgreSQL (via Prisma) is the permanent source of truth — see
 * BUILD_HANDOFF §9 / §41. Redis is cache/temporary state only, never this.
 *
 * Passes an explicit `datasourceUrl` (rather than relying on the
 * schema's plain `env("DATABASE_URL")`) so `withConnectionLimitFloor`
 * can raise the floor on an operator-provided URL that never set
 * `connection_limit` at all — see connection-url.ts's doc comment.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasourceUrl: withConnectionLimitFloor(process.env.DATABASE_URL ?? ''),
      log: ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL via Prisma');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
