import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WordsService } from '../vocabulary/words.service';
import { ArcadeChallenge } from './types';

/**
 * The shared Arcade challenge service (spec §8: "Create or reuse a
 * shared service that supplies validated vocabulary challenges"). Used
 * by all three games — ScrambleQuest, Complete It, and Word Duel — so
 * word selection behaves identically everywhere: same adaptive/spaced-
 * repetition logic, same global-exposure fairness tracking, same
 * mastered/recently-shown exclusion rules that Daily Quest already
 * relies on.
 *
 * Deliberately reuses WordsService.pickWordsForQuest (spec §3: "inspect
 * the repository for an existing equivalent and reuse it") rather than
 * building a second word-selection system — Arcade words are pulled
 * from the exact same 10,000-word adaptive-distribution pool Daily
 * Quest uses, keeping the whole corpus's rotation fair regardless of
 * which game surfaces a word.
 *
 * Returns ArcadeChallenge (full Word rows, including the answer) — this
 * is a SERVER-SIDE-ONLY type. Each game's controller/gateway builds its
 * own client-safe presentation from these before responding (spec §8:
 * "Do not send the full challenge object to clients when it contains
 * the answer").
 */
@Injectable()
export class ArcadeChallengeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wordsService: WordsService,
  ) {}

  /**
   * Picks `count` challenges for `userId`, in a fixed, server-decided
   * order — callers persist this order (e.g. WordDuelMatch.wordIds,
   * ArcadeGameSession's implicit answer sequence) so a given question'
   * "index" always refers to the same word for the lifetime of that
   * session/match, which the idempotency guards on ArcadeAnswer/
   * WordDuelAnswer depend on.
   */
  async pickChallenges(
    userId: string,
    count: number,
    excludeWordIds: string[] = [],
    // Forwarded straight to WordsService.pickWordsForQuest -- each Arcade
    // game passes its own config's MIN_WORD_LENGTH (see
    // arcade/config/arcade.config.ts); undefined means no floor.
    minLength?: number,
  ): Promise<ArcadeChallenge[]> {
    const wordIds = await this.wordsService.pickWordsForQuest(
      userId,
      count,
      excludeWordIds,
      minLength,
    );

    const words = await this.prisma.word.findMany({
      where: { id: { in: wordIds } },
    });
    const byId = new Map(words.map((w) => [w.id, w]));

    // Preserve pickWordsForQuest's own ordering (its adaptive-selection
    // ranking is meaningful) rather than whatever order findMany
    // happens to return.
    const ordered = wordIds
      .map((id) => byId.get(id))
      .filter((w): w is NonNullable<typeof w> => w != null);

    // Same global-exposure bookkeeping Daily Quest performs when it
    // serves words (spec: reuse existing infrastructure) — keeps the
    // corpus-wide fairness ratio correct regardless of which game
    // served the word.
    if (ordered.length > 0) {
      await this.wordsService.recordGlobalExposure(ordered.map((w) => w.id));
    }

    return ordered.map((word) => ({ word, difficulty: word.baseDifficulty }));
  }
}
