import { SkillsController } from './skills.controller';

function mastery(overrides: Partial<Record<string, number | string>> = {}) {
  return {
    currentLevel: 'RECOGNIZING',
    masteryScore: 0,
    guessScore: 0,
    sentenceScore: 0,
    paragraphScore: 0,
    ...overrides,
  };
}

describe('SkillsController', () => {
  let controller: SkillsController;

  const prismaMock = {
    mastery: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Direct instantiation, not Test.createTestingModule — this
    // controller carries @UseGuards(JwtAuthGuard), and going through
    // Nest's DI container would also try to construct JwtAuthGuard's own
    // dependency chain (JwtService, AppConfigService, ...) for no
    // reason, since the guard itself isn't under test here.
    controller = new SkillsController(prismaMock as any);
  });

  it('reports every dimension unmeasured with a zero score for a brand-new player', async () => {
    prismaMock.mastery.findMany.mockResolvedValueOnce([]);

    const result = await controller.me('u1');

    result.dimensions.forEach((d) => {
      if (d.key === 'vocabulary' || d.key === 'recall') {
        expect(d.measured).toBe(true); // these two are always "measured" (0 is a real value)
      } else {
        expect(d.measured).toBe(false);
      }
      expect(d.score).toBe(0);
    });
  });

  it('computes Context/Sentence/Writing from real Mastery skill-area scores, not a hardcoded 0', async () => {
    prismaMock.mastery.findMany.mockResolvedValueOnce([
      mastery({ guessScore: 80, sentenceScore: 60, paragraphScore: 40 }),
      mastery({ guessScore: 60, sentenceScore: 80, paragraphScore: 60 }),
    ]);

    const result = await controller.me('u1');
    const byKey = Object.fromEntries(result.dimensions.map((d) => [d.key, d]));

    expect(byKey.context).toEqual({ key: 'context', label: 'Context', score: 70, measured: true });
    expect(byKey.sentenceConstruction).toEqual(
      expect.objectContaining({ score: 70, measured: true }),
    );
    expect(byKey.writing).toEqual(expect.objectContaining({ score: 50, measured: true }));
  });

  it('averages only over words that actually have a score for that dimension', async () => {
    prismaMock.mastery.findMany.mockResolvedValueOnce([
      mastery({ paragraphScore: 90 }),
      mastery({ paragraphScore: 0 }), // never reached Paragraph on this word
    ]);

    const result = await controller.me('u1');
    const writing = result.dimensions.find((d) => d.key === 'writing')!;

    expect(writing.score).toBe(90); // averaged over the 1 measured row, not diluted by the 0
    expect(writing.measured).toBe(true);
  });

  it('has exactly five dimensions — Speaking/Pronunciation removed from V1 (Correction & Completion Spec §1)', async () => {
    prismaMock.mastery.findMany.mockResolvedValueOnce([]);

    const result = await controller.me('u1');

    expect(result.dimensions.map((d) => d.key)).toEqual([
      'vocabulary',
      'recall',
      'context',
      'sentenceConstruction',
      'writing',
    ]);
  });

  it('still computes Vocabulary and Recall exactly as before', async () => {
    prismaMock.mastery.findMany.mockResolvedValueOnce([
      mastery({ currentLevel: 'MASTERED', masteryScore: 100 }),
      mastery({ currentLevel: 'RECOGNIZING', masteryScore: 40 }),
    ]);

    const result = await controller.me('u1');
    const byKey = Object.fromEntries(result.dimensions.map((d) => [d.key, d]));

    expect(byKey.vocabulary.score).toBe(2); // 1/50 mastered -> 2%
    expect(byKey.recall.score).toBe(70); // (100 + 40) / 2
  });
});
