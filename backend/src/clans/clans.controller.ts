import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * GET /api/v1/clans — public, unauthenticated. Clan Selection (Identity
 * phase, build order §47 item 10) needs this list before a player has an
 * account yet, so it deliberately sits outside JwtAuthGuard.
 */
@Controller('clans')
export class ClansController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.clan.findMany({
      select: { id: true, name: true, description: true, lore: true, bannerAsset: true },
      orderBy: { name: 'asc' },
    });
  }
}
