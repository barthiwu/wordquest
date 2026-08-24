import { Test } from '@nestjs/testing';
import { WordsService } from './words.service';
import { PrismaService } from '../prisma/prisma.service';

function candidate(id: string) {
  return { id, cefrLevel: null, category: null, difficultyScore: null, baseDifficulty: 'BEGINNER' };
}

describe('WordsService', () => {
  let service: WordsService;

  const prismaMock = {
    mastery: {
      findMany: jest.fn(),
    },
    word: {
      findMany: jest.fn(),
    },
    learningProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    userProgression: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.learningProfile.findUnique.mockResolvedValue(null);
    prismaMock.userProgression.findUnique.mockResolvedValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [WordsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(WordsService);
  });

  describe('pickWordsForQuest', () => {
    it('excludes words the user has already mastered', async () => {
      prismaMock.mastery.findMany.mockResolvedValueOnce([
        {
          wordId: 'w1',
          currentLevel: 'MASTERED',
          lastReviewedAt: null,
          nextReviewDueAt: null,
          word: { category: null },
        },
      ]);
      prismaMock.word.findMany.mockResolvedValueOnce([candidate('w2'), candidate('w3')]);

      const result = await service.pickWordsForQuest('u1', 2);

      expect(prismaMock.mastery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' } }),
      );
      expect(prismaMock.word.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { notIn: ['w1'] }, isActive: true } }),
      );
      expect(result.sort()).toEqual(['w2', 'w3']);
    });

    it('falls back to the full active word pool when everything is already mastered, rather than returning an empty quest', async () => {
      prismaMock.mastery.findMany.mockResolvedValueOnce([
        {
          wordId: 'w1',
          currentLevel: 'MASTERED',
          lastReviewedAt: null,
          nextReviewDueAt: null,
          word: { category: null },
        },
        {
          wordId: 'w2',
          currentLevel: 'MASTERED',
          lastReviewedAt: null,
          nextReviewDueAt: null,
          word: { category: null },
        },
      ]);
      // Nothing left once mastered words are excluded.
      prismaMock.word.findMany.mockResolvedValueOnce([]);
      // Second call: the unfiltered (still isActive-only) fallback pool.
      prismaMock.word.findMany.mockResolvedValueOnce([candidate('w1'), candidate('w2')]);

      const result = await service.pickWordsForQuest('u1', 2);

      expect(prismaMock.word.findMany).toHaveBeenCalledTimes(2);
      expect(prismaMock.word.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: { isActive: true } }),
      );
      expect(result).toHaveLength(2);
    });

    it('never returns more words than requested, even with a larger pool', async () => {
      prismaMock.mastery.findMany.mockResolvedValueOnce([]);
      prismaMock.word.findMany.mockResolvedValueOnce([
        candidate('w1'),
        candidate('w2'),
        candidate('w3'),
        candidate('w4'),
        candidate('w5'),
      ]);

      const result = await service.pickWordsForQuest('u1', 3);

      expect(result).toHaveLength(3);
      expect(new Set(result).size).toBe(3);
      result.forEach((id) => expect(['w1', 'w2', 'w3', 'w4', 'w5']).toContain(id));
    });

    it('returns the whole pool without ranking/sampling when the pool is not larger than what was requested', async () => {
      prismaMock.mastery.findMany.mockResolvedValueOnce([]);
      prismaMock.word.findMany.mockResolvedValueOnce([candidate('w1'), candidate('w2')]);

      const result = await service.pickWordsForQuest('u1', 5);

      expect(result.sort()).toEqual(['w1', 'w2']);
      // No need to consult the player's profile when there's nothing to rank.
      expect(prismaMock.learningProfile.findUnique).not.toHaveBeenCalled();
    });

    it('consults the player profile and mastery history to rank a larger pool', async () => {
      prismaMock.mastery.findMany.mockResolvedValueOnce([
        {
          wordId: 'w1',
          currentLevel: 'STRONG',
          lastReviewedAt: new Date(),
          nextReviewDueAt: new Date(Date.now() + 999_999_999),
          word: { category: 'Nature' },
        },
      ]);
      prismaMock.word.findMany.mockResolvedValueOnce([
        candidate('w1'),
        candidate('w2'),
        candidate('w3'),
        candidate('w4'),
        candidate('w5'),
      ]);
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        currentDifficulty: 'INTERMEDIATE',
      });
      prismaMock.userProgression.findUnique.mockResolvedValueOnce({ estimatedCefrLevel: 'B1' });

      const result = await service.pickWordsForQuest('u1', 2);

      expect(prismaMock.learningProfile.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' } }),
      );
      expect(result).toHaveLength(2);
    });

    it('favors words in a category the player has a high incorrect rate in (V20 Beta Release Checklist §3: category performance)', async () => {
      // Two words the player has never touched, in two different
      // categories the player HAS touched via other words: 'Grammar'
      // where they're struggling (8/10 wrong) and 'Nature' where they're
      // doing well (1/10 wrong). The never-touched candidate in the
      // struggling category should rank first.
      prismaMock.mastery.findMany.mockResolvedValueOnce([
        {
          wordId: 'grammar-seen',
          currentLevel: 'RECOGNIZING',
          lastReviewedAt: null,
          nextReviewDueAt: null,
          timesPresented: 10,
          timesCorrect: 2,
          timesIncorrect: 8,
          word: { category: 'Grammar' },
        },
        {
          wordId: 'nature-seen',
          currentLevel: 'RECOGNIZING',
          lastReviewedAt: null,
          nextReviewDueAt: null,
          timesPresented: 10,
          timesCorrect: 9,
          timesIncorrect: 1,
          word: { category: 'Nature' },
        },
      ]);
      prismaMock.word.findMany.mockResolvedValueOnce([
        {
          id: 'grammar-new',
          cefrLevel: null,
          category: 'Grammar',
          difficultyScore: null,
          baseDifficulty: 'BEGINNER',
        },
        {
          id: 'nature-new',
          cefrLevel: null,
          category: 'Nature',
          difficultyScore: null,
          baseDifficulty: 'BEGINNER',
        },
        candidate('filler1'),
        candidate('filler2'),
        candidate('filler3'),
        candidate('filler4'),
      ]);

      // Make sampling deterministic — take the ranked list's top slice in
      // order instead of shuffling — so this test asserts the actual
      // ranking, not a random draw from it.
      jest.spyOn(service as any, 'sample').mockImplementation((items: unknown) => {
        const arr = items as { id: string }[];
        return arr.slice(0, 1);
      });

      const result = await service.pickWordsForQuest('u1', 1);

      expect(result).toEqual(['grammar-new']);
    });

    describe('excludeWordIds (V21 §3: prevent unnecessary repetition)', () => {
      it('excludes the given word IDs from the pool alongside mastered words', async () => {
        prismaMock.mastery.findMany.mockResolvedValueOnce([
          {
            wordId: 'w1',
            currentLevel: 'MASTERED',
            lastReviewedAt: null,
            nextReviewDueAt: null,
            word: { category: null },
          },
        ]);
        prismaMock.word.findMany.mockResolvedValueOnce([candidate('w3')]);

        const result = await service.pickWordsForQuest('u1', 1, ['w2']);

        expect(prismaMock.word.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: { notIn: ['w1', 'w2'] }, isActive: true } }),
        );
        expect(result).toEqual(['w3']);
      });

      it('relaxes to allowing an in-flight repeat (still excluding mastered) when honoring excludeWordIds leaves nothing', async () => {
        prismaMock.mastery.findMany.mockResolvedValueOnce([
          {
            wordId: 'w1',
            currentLevel: 'MASTERED',
            lastReviewedAt: null,
            nextReviewDueAt: null,
            word: { category: null },
          },
        ]);
        // First call: mastered + excludeWordIds combined -> nothing left.
        prismaMock.word.findMany.mockResolvedValueOnce([]);
        // Second call: mastered-only exclusion -> the in-flight word is back.
        prismaMock.word.findMany.mockResolvedValueOnce([candidate('w2')]);

        const result = await service.pickWordsForQuest('u1', 1, ['w2']);

        expect(prismaMock.word.findMany).toHaveBeenCalledTimes(2);
        expect(prismaMock.word.findMany).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ where: { id: { notIn: ['w1', 'w2'] }, isActive: true } }),
        );
        expect(prismaMock.word.findMany).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ where: { id: { notIn: ['w1'] }, isActive: true } }),
        );
        expect(result).toEqual(['w2']);
      });

      it('relaxes all the way to the full active pool when even the mastered-only exclusion leaves nothing', async () => {
        prismaMock.mastery.findMany.mockResolvedValueOnce([
          {
            wordId: 'w1',
            currentLevel: 'MASTERED',
            lastReviewedAt: null,
            nextReviewDueAt: null,
            word: { category: null },
          },
        ]);
        prismaMock.word.findMany.mockResolvedValueOnce([]); // mastered + excludeWordIds
        prismaMock.word.findMany.mockResolvedValueOnce([]); // mastered-only
        prismaMock.word.findMany.mockResolvedValueOnce([candidate('w1')]); // full active pool

        const result = await service.pickWordsForQuest('u1', 1, ['w2']);

        expect(prismaMock.word.findMany).toHaveBeenCalledTimes(3);
        expect(prismaMock.word.findMany).toHaveBeenNthCalledWith(
          3,
          expect.objectContaining({ where: { isActive: true } }),
        );
        expect(result).toEqual(['w1']);
      });

      it('does not query excludeWordIds-relaxation when excludeWordIds is empty (unchanged single-fallback behavior)', async () => {
        prismaMock.mastery.findMany.mockResolvedValueOnce([]);
        prismaMock.word.findMany.mockResolvedValueOnce([]); // nothing active at all
        prismaMock.word.findMany.mockResolvedValueOnce([candidate('w1')]); // full pool fallback

        const result = await service.pickWordsForQuest('u1', 1);

        // Only ONE fallback step (straight to the full pool), not two —
        // the middle "relax excludeWordIds only" step is skipped entirely
        // when there was no excludeWordIds to relax in the first place.
        expect(prismaMock.word.findMany).toHaveBeenCalledTimes(2);
        expect(result).toEqual(['w1']);
      });
    });
  });
});
