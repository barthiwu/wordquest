import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { QuestCardService } from './quest-card.service';
import { SetShowcaseDto } from './dto/set-showcase.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

/**
 * GET   /api/v1/quest-cards/me            — the player's full collectible gallery
 * GET   /api/v1/quest-cards/me/showcase   — just the player's current profile showcase, in order
 * PATCH /api/v1/quest-cards/me/showcase   — replace the showcase selection (V19 Stabilization Spec §8)
 * GET   /api/v1/quest-cards/me/:id        — one card's detail (also the shareable view)
 *
 * The two literal `me/showcase` routes are declared BEFORE `me/:id` —
 * Nest matches routes in declaration order, and `:id` would otherwise
 * greedily swallow `showcase` as a card id.
 */
@Controller('quest-cards')
@UseGuards(JwtAuthGuard)
export class QuestCardController {
  constructor(private readonly questCards: QuestCardService) {}

  @Get('me')
  listMine(@CurrentUserId() userId: string) {
    return this.questCards.listMyCards(userId);
  }

  @Get('me/showcase')
  getShowcase(@CurrentUserId() userId: string) {
    return this.questCards.listShowcase(userId);
  }

  @Patch('me/showcase')
  setShowcase(@CurrentUserId() userId: string, @Body() dto: SetShowcaseDto) {
    return this.questCards.setShowcase(userId, dto.cardIds);
  }

  @Get('me/:id')
  getOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.questCards.getCard(userId, id);
  }
}
