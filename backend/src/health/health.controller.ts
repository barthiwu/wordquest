import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * GET /api/v1/health — liveness + DB connectivity check.
 * First endpoint of the WordQuest API (BUILD_HANDOFF §49).
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const startedAt = Date.now();
    let database: 'up' | 'down' = 'up';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    const body = {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'wordquest-backend',
      database,
      uptimeMs: process.uptime() * 1000,
      checkedInMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
    // 503 when the database is unreachable, so a deploy's health check
    // fails a build that can't reach it instead of passing it.
    if (database === 'down') throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }
}
