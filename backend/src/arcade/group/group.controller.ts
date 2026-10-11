import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ArcadeGroupService } from './group.service';
import { renderResultPdf } from './group-results.pdf';
import { sheetFileStem, toCsv } from './group-results.util';
import { CreateGroupDto, GroupMemberParamDto, JoinGroupDto, StartGroupDto } from './dto/group.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../../auth/guards/email-verification.guard';
import { CurrentUserId } from '../../auth/decorators/current-user.decorator';
import { AllowGuest, IsGuest } from '../../auth/decorators/allow-guest.decorator';

/**
 * POST   /api/v1/arcade/groups                      create a private group (host)
 * GET    /api/v1/arcade/groups/mine                 my groups
 * GET    /api/v1/arcade/groups/preview/:code        what the invite link shows before joining
 * POST   /api/v1/arcade/groups/join                 join by code
 * GET    /api/v1/arcade/groups/:id                  one group (members only; also the polling endpoint)
 * GET    /api/v1/arcade/groups/:id/results          host: the full result sheet (typed words, times)
 * GET    /api/v1/arcade/groups/:id/results.csv      host: the sheet as a CSV download
 * GET    /api/v1/arcade/groups/:id/results.pdf      host: the sheet as a PDF download
 * POST   /api/v1/arcade/groups/:id/start            host: start the round
 * POST   /api/v1/arcade/groups/:id/end              host: end the round / group
 * POST   /api/v1/arcade/groups/:id/leave            member: leave
 * DELETE /api/v1/arcade/groups/:id/members/:userId  host: remove a member
 *
 * Guests (see AllowGuest) may read, join and leave groups and play in them;
 * creating or running one needs an account.
 */
@Controller('arcade/groups')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
export class ArcadeGroupController {
  constructor(private readonly groups: ArcadeGroupService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUserId() userId: string, @Body() dto: CreateGroupDto) {
    return this.groups.create(userId, dto);
  }

  @AllowGuest()
  @Get('mine')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  mine(@CurrentUserId() userId: string) {
    return this.groups.listMine(userId);
  }

  // Guessing codes is the only way to find a group, so the lookup is throttled hard.
  @Get('preview/:code')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  preview(@Param('code') code: string) {
    return this.groups.preview(code);
  }

  @AllowGuest()
  @Post('join')
  @HttpCode(200)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  join(@CurrentUserId() userId: string, @IsGuest() isGuest: boolean, @Body() dto: JoinGroupDto) {
    return this.groups.join(userId, dto.code, isGuest);
  }

  @AllowGuest()
  @Get(':id')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  get(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.groups.get(userId, id);
  }

  // Host only (the service checks): other members get the same 403 as any host action.
  @Get(':id/results')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  results(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.groups.getResultSheet(userId, id);
  }

  @Get(':id/results.csv')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resultsCsv(@CurrentUserId() userId: string, @Param('id') id: string) {
    const sheet = await this.groups.getResultSheet(userId, id);
    return new StreamableFile(Buffer.from(toCsv(sheet), 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${sheetFileStem(sheet)}.csv"`,
    });
  }

  @Get(':id/results.pdf')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resultsPdf(@CurrentUserId() userId: string, @Param('id') id: string) {
    const sheet = await this.groups.getResultSheet(userId, id);
    return new StreamableFile(await renderResultPdf(sheet), {
      type: 'application/pdf',
      disposition: `attachment; filename="${sheetFileStem(sheet)}.pdf"`,
    });
  }

  @Post(':id/start')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  start(@CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: StartGroupDto) {
    return this.groups.start(userId, id, dto.windowMinutes);
  }

  @Post(':id/end')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  end(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.groups.end(userId, id);
  }

  @AllowGuest()
  @Post(':id/leave')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async leave(@CurrentUserId() userId: string, @Param('id') id: string) {
    await this.groups.leave(userId, id);
  }

  @Delete(':id/members/:userId')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  remove(@CurrentUserId() hostId: string, @Param() params: GroupMemberParamDto) {
    return this.groups.removeMember(hostId, params.id, params.userId);
  }
}
