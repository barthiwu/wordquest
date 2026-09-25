import { NotFoundException } from '@nestjs/common';
import { PracticeService } from './practice.service';

/**
 * PracticeService previously had no unit spec at all (only reachable
 * indirectly, if at all, through e2e coverage) -- this file is
 * deliberately scoped to what this change actually touched
 * (submitSentence/submitParagraph now fetch and forward the player's
 * nativeLanguage to the evaluators, same as quests.service.ts's
 * equivalent methods) rather than backfilling full coverage for a
 * service that's out of this change's scope otherwise.
 */
describe('PracticeService', () => {
  const wordRow = { id: 'w1', word: 'resilient', definition: 'x', partOfSpeech: 'adjective', isActive: true };

  const prismaMock = {
    word: { findUnique: jest.fn().mockResolvedValue(wordRow) },
    user: { findUnique: jest.fn().mockResolvedValue({ nativeLanguage: null }) },
  };
  const masteryMock = {
    recordSkillAreaPractice: jest
      .fn()
      .mockResolvedValue({ attemptScore: 80, bestScore: 80, level: 'RECALLING', justMastered: false }),
  };
  const sentenceEvaluationMock = { evaluate: jest.fn() };
  const paragraphEvaluationMock = { evaluate: jest.fn() };

  const evaluation = {
    scores: { grammar: 80 },
    confidence: 0.9,
    whatWentWell: 'x',
    whatNeedsImprovement: 'y',
    betterVersion: null,
    nextAction: 'z',
  };

  let service: PracticeService;

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.word.findUnique.mockResolvedValue(wordRow);
    prismaMock.user.findUnique.mockResolvedValue({ nativeLanguage: null });
    masteryMock.recordSkillAreaPractice.mockResolvedValue({
      attemptScore: 80,
      bestScore: 80,
      level: 'RECALLING',
      justMastered: false,
    });
    sentenceEvaluationMock.evaluate.mockResolvedValue(evaluation);
    paragraphEvaluationMock.evaluate.mockResolvedValue(evaluation);
    service = new PracticeService(
      prismaMock as any,
      masteryMock as any,
      sentenceEvaluationMock as any,
      paragraphEvaluationMock as any,
    );
  });

  describe('submitSentence', () => {
    it('throws NotFoundException for a missing or inactive word', async () => {
      prismaMock.word.findUnique.mockResolvedValueOnce(null);
      await expect(service.submitSentence('u1', 'w1', 'She is resilient.')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("passes the player's nativeLanguage through to the evaluator", async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ nativeLanguage: 'zh' });

      await service.submitSentence('u1', 'w1', 'She is resilient.');

      expect(sentenceEvaluationMock.evaluate).toHaveBeenCalledWith(
        wordRow.word,
        wordRow.definition,
        wordRow.partOfSpeech,
        'She is resilient.',
        'zh',
      );
    });

    it('passes undefined-safe null when the player has no nativeLanguage set', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ nativeLanguage: null });

      await service.submitSentence('u1', 'w1', 'She is resilient.');

      expect(sentenceEvaluationMock.evaluate).toHaveBeenCalledWith(
        wordRow.word,
        wordRow.definition,
        wordRow.partOfSpeech,
        'She is resilient.',
        null,
      );
    });
  });

  describe('submitParagraph', () => {
    const thirtyWordParagraph = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');

    it("passes the player's nativeLanguage through to the evaluator", async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ nativeLanguage: 'pt' });

      await service.submitParagraph('u1', 'w1', thirtyWordParagraph);

      expect(paragraphEvaluationMock.evaluate).toHaveBeenCalledWith(
        wordRow.word,
        wordRow.definition,
        wordRow.partOfSpeech,
        thirtyWordParagraph,
        'pt',
      );
    });
  });
});
