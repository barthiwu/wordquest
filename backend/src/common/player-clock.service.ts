import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { playerLocalDate, playerLocalHour } from './timezone';

/**
 * The one place a controller/service asks "what time is it for this
 * player right now" (Player Timezone System, V1 Remaining Systems Spec
 * §15). Replaces every DTO field that used to accept a client-submitted
 * localDate/localHour (StartQuestDto, SubmitMasterChallengeDto's query
 * param) — the server derives both from the user's stored IANA timezone
 * + its own UTC clock, never from anything the client claims.
 */
@Injectable()
export class PlayerClockService {
  constructor(private readonly prisma: PrismaService) {}

  async now(
    userId: string,
  ): Promise<{ localDate: string; localHour: number; timezone: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const now = new Date();
    return {
      localDate: playerLocalDate(user?.timezone ?? null, now),
      localHour: playerLocalHour(user?.timezone ?? null, now),
      timezone: user?.timezone ?? null,
    };
  }
}
