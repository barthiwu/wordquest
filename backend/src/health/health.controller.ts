import { Controller, Get } from '@nestjs/common';
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

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'wordquest-backend',
      database,
      uptimeMs: process.uptime() * 1000,
      checkedInMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }
}
