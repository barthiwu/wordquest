import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

/**
 * Spec v2 §19: GET /api/v1/words/:id — a word looked up on its own,
 * decoupled from any quest. Deliberately excludes normalizedWord (the
 * answer-comparison key) from the response — that field exists for the
 * server's own use, not to hand back to a client that could otherwise
 * just read the answer off this endpoint.
 *
 * GET /api/v1/words/search isn't in the spec's list explicitly, but
 * Word in the Wild's mobile flow needs some way to let a player pick
 * which word they're submitting evidence for — added here since it's
 * the same "look up a word" concern this controller already owns.
 * Registered before the :id route: NestJS matches routes in file order,
 * and a search after :id would never be reached — "search" would just
 * get captured as an :id value instead.
 *
 * V23 product feedback: this search must only surface words the
 * requesting player has actually answered in a Quest — Word in the
 * Wild evidence is supposed to prove real-world use of a word the
 * player has met, not any word in the whole 500-word vocabulary they
 * could type from the dictionary. Scoped to a LETTER_OMISSION
 * ChallengeAttempt (the Guess-stage answer, and — per ChallengeType's
 * own doc comment — the only challenge type with a real
 * generator/evaluator today) existing for (userId, wordId). This is
 * discovery only; word-in-the-wild.service.ts's createMission enforces
 * the same rule server-side regardless of what this endpoint returns.
 */
@Controller('words')
@UseGuards(JwtAuthGuard)
export class WordsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('search')
  async search(
    @CurrentUserId() userId: string,
    @Query('q') query = '',
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Math.max(Number(limit) || 20, 1), 50);

    const words = await this.prisma.word.findMany({
      where: {
        isActive: true,
        ...(query.trim() ? { word: { contains: query.trim(), mode: 'insensitive' } } : {}),
        challengeAttempts: { some: { userId, challengeType: 'LETTER_OMISSION' } },
      },
      take,
      orderBy: { word: 'asc' },
      select: { id: true, word: true, definition: true, partOfSpeech: true, baseDifficulty: true },
    });

    return words;
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const word = await this.prisma.word.findUnique({ where: { id } });
    if (!word || !word.isActive) {
      throw new NotFoundException('Word not found');
    }

    return {
      id: word.id,
      word: word.word,
      definition: word.definition,
      partOfSpeech: word.partOfSpeech,
      exampleSentence: word.exampleSentence,
      baseDifficulty: word.baseDifficulty,
      cefrLevel: word.cefrLevel,
      category: word.category,
      difficultyScore: word.difficultyScore,
      frequencyLevel: word.frequencyLevel,
      usageNotes: word.usageNotes,
      synonyms: word.synonyms,
      antonyms: word.antonyms,
      relatedWords: word.relatedWords,
      wordFamily: word.wordFamily,
      pronunciation: word.pronunciation,
      phoneticRepresentation: word.phoneticRepresentation,
      audioUrl: word.audioUrl,
    };
  }
}
