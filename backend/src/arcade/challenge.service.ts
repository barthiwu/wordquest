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
   *
   * `filter`, when given, is a per-game content-quality gate applied
   * AFTER adaptive selection (pickWordsForQuest has no concept of
   * "quality" — it ranks by mastery/spacing/CEFR, not sentence
   * content). Complete It uses this to reject words whose corpus
   * example sentence is too weak to build a fair fill-in-the-blank
   * from (2026-09: Barth reported Complete It sessions where "none of
   * the sentences was easy to fill up" — traced to a chunk of
   * vocabulary-production.csv's rows pairing a word with a WordNet-
   * style terse fragment). Without a filter this behaves exactly as
   * before: one pickWordsForQuest call for exactly `count`, no retries.
   *
   * With a filter, a single batch of exactly `count` candidates would
   * often come back short after filtering (a meaningful fraction of
   * the corpus fails Complete It's quality gate — see
   * complete-it.util.ts), so this over-fetches and tops up: each retry
   * asks pickWordsForQuest for more candidates, excluding every word
   * already seen (accepted OR rejected) so nothing repeats within one
   * pick, until either `count` accepted challenges are collected or
   * the eligible pool runs out (pickWordsForQuest returns fewer ids
   * than asked for). Global exposure is recorded ONLY for the accepted
   * challenges — a word a player never actually saw (rejected by the
   * quality filter) must not count against its exposure fairness.
   */
  async pickChallenges(
    userId: string,
    count: number,
    excludeWordIds: string[] = [],
    // Forwarded straight to WordsService.pickWordsForQuest -- each Arcade
    // game passes its own config's MIN_WORD_LENGTH (see
    // arcade/config/arcade.config.ts); undefined means no floor.
    minLength?: number,
    filter?: (challenge: ArcadeChallenge) => boolean,
  ): Promise<ArcadeChallenge[]> {
    const accepted: ArcadeChallenge[] = [];
    const seen = new Set(excludeWordIds);
    // Bounded retries: a filter that rejects most of the corpus must
    // still terminate once the eligible pool is exhausted, rather than
    // spinning forever trying to fill the last slot or two.
    const MAX_ATTEMPTS = 6;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && accepted.length < count; attempt++) {
      const remaining = count - accepted.length;
      // First attempt asks for exactly what's needed (matches the old,
      // no-filter behavior exactly when filter is undefined, since
      // every candidate is then accepted and the loop exits after one
      // pass). Later attempts over-fetch, since a filter that rejects,
      // say, half the pool means "ask for exactly what's missing"
      // would take roughly twice as many round trips to fill the gap.
      const batchSize = attempt === 1 ? remaining : Math.min(remaining * 3, 60);

      const wordIds = await this.wordsService.pickWordsForQuest(
        userId,
        batchSize,
        Array.from(seen),
        minLength,
      );
      if (wordIds.length === 0) break; // eligible pool exhausted

      const words = await this.prisma.word.findMany({ where: { id: { in: wordIds } } });
      const byId = new Map(words.map((w) => [w.id, w]));

      // Preserve pickWordsForQuest's own ordering (its adaptive-selection
      // ranking is meaningful) rather than whatever order findMany
      // happens to return.
      const ordered = wordIds
        .map((id) => byId.get(id))
        .filter((w): w is NonNullable<typeof w> => w != null);

      for (const word of ordered) {
        seen.add(word.id);
        const challenge: ArcadeChallenge = { word, difficulty: word.baseDifficulty };
        if (!filter || filter(challenge)) {
          accepted.push(challenge);
          if (accepted.length >= count) break;
        }
      }

      // pickWordsForQuest came back short of what we asked for -- the
      // eligible pool is smaller than batchSize, so another attempt
      // would just see the same (now-excluded) words again.
      if (wordIds.length < batchSize) break;
    }

    // Same global-exposure bookkeeping Daily Quest performs when it
    // serves words (spec: reuse existing infrastructure) — keeps the
    // corpus-wide fairness ratio correct regardless of which game
    // served the word. Only the words actually handed back to the
    // caller count; anything the quality filter rejected was never
    // shown to the player.
    if (accepted.length > 0) {
      await this.wordsService.recordGlobalExposure(accepted.map((c) => c.word.id));
    }

    return accepted;
  }
}
