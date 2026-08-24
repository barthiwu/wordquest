import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LearningProfileService } from './learning-profile.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LearningProfileService', () => {
  let service: LearningProfileService;

  const prismaMock = {
    learningProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
    },
    cefrAssessment: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [LearningProfileService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(LearningProfileService);
  });

  describe('getProfile', () => {
    it('returns an uncalibrated default view when no profile row exists yet', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce(null);
      const view = await service.getProfile('u1');
      expect(view).toEqual({
        calibrated: false,
        calibrationWordsCompleted: 0,
        currentDifficulty: 'BEGINNER',
        recommendedDifficulty: null,
        recommendedDifficultyAcceptedAt: null,
        initialCefrEstimate: null,
        weaknessAreas: [],
        avgGuessAccuracy: 0,
        avgSentenceScore: 0,
        avgParagraphScore: 0,
        avgResponseSpeedMs: 0,
        hintDependencyRate: 0,
        learningConsistency: 0,
      });
    });

    it('returns the existing row when one exists', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: true,
        calibrationWordsCompleted: 3,
        currentDifficulty: 'INTERMEDIATE',
        recommendedDifficulty: null,
        recommendedDifficultyAcceptedAt: null,
        initialCefrEstimate: 'B1',
        weaknessAreas: [],
        avgGuessAccuracy: 0.8,
        avgSentenceScore: 80,
        avgParagraphScore: 80,
        avgResponseSpeedMs: 5000,
        hintDependencyRate: 0.1,
        learningConsistency: 0.9,
      });
      const view = await service.getProfile('u1');
      expect(view.calibrated).toBe(true);
      expect(view.currentDifficulty).toBe('INTERMEDIATE');
    });
  });

  describe('recordWordCompletion', () => {
    it('creates a new profile row on the first word, counting toward calibration', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce(null);

      const result = await service.recordWordCompletion('u1', {
        cleanGuess: true,
        hintsUsed: 0,
        maxHints: 4,
        elapsedSeconds: 20,
        sentenceScore: 80,
        paragraphScore: 80,
      });

      expect(result.calibrationJustCompleted).toBe(false);
      expect(prismaMock.learningProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1' },
          create: expect.objectContaining({ userId: 'u1', calibrationWordsCompleted: 1 }),
          update: expect.objectContaining({ calibrationWordsCompleted: 1 }),
        }),
      );
    });

    it('does not report calibration complete on the 2nd word', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: false,
        calibrationWordsCompleted: 1,
        avgGuessAccuracy: 0.6,
        avgSentenceScore: 60,
        avgParagraphScore: 60,
        avgResponseSpeedMs: 8000,
        hintDependencyRate: 0.1,
        learningConsistency: 0.7,
      });

      const result = await service.recordWordCompletion('u1', {
        cleanGuess: true,
        hintsUsed: 0,
        maxHints: 4,
        elapsedSeconds: 10,
        sentenceScore: 70,
        paragraphScore: 70,
      });

      expect(result.calibrationJustCompleted).toBe(false);
      expect(prismaMock.learningProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ calibrationWordsCompleted: 2 }),
        }),
      );
    });

    it('completes calibration on the 3rd word and computes a recommendation', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: false,
        calibrationWordsCompleted: 2,
        avgGuessAccuracy: 0.9,
        avgSentenceScore: 90,
        avgParagraphScore: 90,
        avgResponseSpeedMs: 5000,
        hintDependencyRate: 0.05,
        learningConsistency: 0.9,
      });

      const result = await service.recordWordCompletion('u1', {
        cleanGuess: true,
        hintsUsed: 0,
        maxHints: 4,
        elapsedSeconds: 5,
        sentenceScore: 90,
        paragraphScore: 90,
      });

      expect(result.calibrationJustCompleted).toBe(true);
      expect(prismaMock.learningProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            calibrationWordsCompleted: 3,
            calibrated: true,
            recommendedDifficulty: expect.any(String),
            initialCefrEstimate: expect.any(String),
            // weaknessAreas is now computed on every call, not just at
            // calibration — still present here, just no longer only
            // ever set inside the calibration-only fields.
            weaknessAreas: expect.any(Array),
          }),
        }),
      );
    });

    it('records a CALIBRATION CefrAssessment when calibration completes on this call', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: false,
        calibrationWordsCompleted: 2,
        avgGuessAccuracy: 0.9,
        avgSentenceScore: 90,
        avgParagraphScore: 90,
        avgResponseSpeedMs: 5000,
        hintDependencyRate: 0.05,
        learningConsistency: 0.9,
      });

      await service.recordWordCompletion('u1', {
        cleanGuess: true,
        hintsUsed: 0,
        maxHints: 4,
        elapsedSeconds: 5,
        sentenceScore: 90,
        paragraphScore: 90,
      });

      expect(prismaMock.cefrAssessment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'u1', source: 'CALIBRATION' }),
        }),
      );
    });

    it('does not record a CefrAssessment on a non-calibration-completing call', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: false,
        calibrationWordsCompleted: 0,
        avgGuessAccuracy: 0.5,
        avgSentenceScore: 50,
        avgParagraphScore: 50,
        avgResponseSpeedMs: 8000,
        hintDependencyRate: 0.1,
        learningConsistency: 0.5,
      });

      await service.recordWordCompletion('u1', {
        cleanGuess: true,
        hintsUsed: 0,
        maxHints: 4,
        elapsedSeconds: 5,
        sentenceScore: 60,
        paragraphScore: 60,
      });

      expect(prismaMock.cefrAssessment.create).not.toHaveBeenCalled();
    });

    it('never re-triggers calibration once already calibrated, even past 3 words', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: true,
        calibrationWordsCompleted: 3,
        avgGuessAccuracy: 0.9,
        avgSentenceScore: 90,
        avgParagraphScore: 90,
        avgResponseSpeedMs: 5000,
        hintDependencyRate: 0.05,
        learningConsistency: 0.9,
      });

      const result = await service.recordWordCompletion('u1', {
        cleanGuess: true,
        hintsUsed: 0,
        maxHints: 4,
        elapsedSeconds: 5,
        sentenceScore: 90,
        paragraphScore: 90,
      });

      expect(result.calibrationJustCompleted).toBe(false);
      expect(prismaMock.learningProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ calibrationWordsCompleted: 3 }),
        }),
      );
      // No calibration-recommendation fields re-computed — `calibrated`
      // is left untouched, not re-set (weaknessAreas DOES still update —
      // see the "keeps recomputing weaknessAreas" test below).
      const updateArg = prismaMock.learningProfile.upsert.mock.calls[0][0].update;
      expect(updateArg.calibrated).toBeUndefined();
      expect(updateArg.recommendedDifficulty).toBeUndefined();
    });

    it('recommends ADVANCED for a player strong across Guess, Sentence, and Paragraph', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: false,
        calibrationWordsCompleted: 2,
        avgGuessAccuracy: 0.95,
        avgSentenceScore: 95,
        avgParagraphScore: 95,
        avgResponseSpeedMs: 4000,
        hintDependencyRate: 0.0,
        learningConsistency: 0.9,
      });

      await service.recordWordCompletion('u1', {
        cleanGuess: true,
        hintsUsed: 0,
        maxHints: 4,
        elapsedSeconds: 5,
        sentenceScore: 95,
        paragraphScore: 95,
      });

      const updateArg = prismaMock.learningProfile.upsert.mock.calls[0][0].update;
      expect(updateArg.recommendedDifficulty).toBe('ADVANCED');
      expect(updateArg.initialCefrEstimate).toBe('B2');
    });

    it('expands calibration beyond guessing — high guess accuracy alone is not enough for ADVANCED if writing lags', async () => {
      // Correction & Completion Spec §6 "expand calibration beyond
      // guessing": a player who guesses perfectly but writes poorly
      // should NOT calibrate into ADVANCED on guess accuracy alone —
      // the old formula (guess accuracy only) would have recommended
      // ADVANCED here; blending in Sentence/Paragraph pulls it down.
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: false,
        calibrationWordsCompleted: 2,
        avgGuessAccuracy: 1.0,
        avgSentenceScore: 20,
        avgParagraphScore: 20,
        avgResponseSpeedMs: 4000,
        hintDependencyRate: 0.0,
        learningConsistency: 0.9,
      });

      await service.recordWordCompletion('u1', {
        cleanGuess: true,
        hintsUsed: 0,
        maxHints: 4,
        elapsedSeconds: 5,
        sentenceScore: 20,
        paragraphScore: 20,
      });

      const updateArg = prismaMock.learningProfile.upsert.mock.calls[0][0].update;
      expect(updateArg.recommendedDifficulty).not.toBe('ADVANCED');
    });

    it('flags context (guess), sentence construction, writing, and hint dependency weaknesses for a struggling player', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: false,
        calibrationWordsCompleted: 2,
        avgGuessAccuracy: 0.3,
        avgSentenceScore: 30,
        avgParagraphScore: 30,
        avgResponseSpeedMs: 20000,
        hintDependencyRate: 0.8,
        learningConsistency: 0.5,
      });

      await service.recordWordCompletion('u1', {
        cleanGuess: false,
        hintsUsed: 4,
        maxHints: 4,
        elapsedSeconds: 60,
        sentenceScore: 30,
        paragraphScore: 30,
      });

      const updateArg = prismaMock.learningProfile.upsert.mock.calls[0][0].update;
      expect(updateArg.recommendedDifficulty).toBe('BEGINNER');
      expect(updateArg.weaknessAreas).toEqual(
        expect.arrayContaining(['context', 'sentence construction', 'writing', 'hint dependency']),
      );
    });

    it('keeps recomputing weaknessAreas on every word, well after calibration is done', async () => {
      // Correction & Completion Spec §6 "improve weakness detection":
      // weaknessAreas is not calibration-locked — a player who was fine
      // at calibration but has since slipped on Paragraph should show
      // it, and `calibrated` being true already must not suppress this.
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: true,
        calibrationWordsCompleted: 3,
        avgGuessAccuracy: 0.9,
        avgSentenceScore: 90,
        avgParagraphScore: 65, // just above the 60 threshold — a bad new sample below should pull it under
        avgResponseSpeedMs: 4000,
        hintDependencyRate: 0.0,
        learningConsistency: 0.9,
      });

      await service.recordWordCompletion('u1', {
        cleanGuess: true,
        hintsUsed: 0,
        maxHints: 4,
        elapsedSeconds: 5,
        sentenceScore: 90,
        paragraphScore: 10,
      });

      const updateArg = prismaMock.learningProfile.upsert.mock.calls[0][0].update;
      expect(updateArg.weaknessAreas).toEqual(['writing']);
    });

    it('feeds Sentence/Paragraph scores into rolling averages, not just Guess', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: true,
        calibrationWordsCompleted: 3,
        avgGuessAccuracy: 0.9,
        avgSentenceScore: 50,
        avgParagraphScore: 50,
        avgResponseSpeedMs: 4000,
        hintDependencyRate: 0.0,
        learningConsistency: 0.9,
      });

      await service.recordWordCompletion('u1', {
        cleanGuess: true,
        hintsUsed: 0,
        maxHints: 4,
        elapsedSeconds: 5,
        sentenceScore: 100,
        paragraphScore: 100,
      });

      const updateArg = prismaMock.learningProfile.upsert.mock.calls[0][0].update;
      // EMA(50, 100, smoothing=0.25) = 50 + (100-50)*0.25 = 62.5
      expect(updateArg.avgSentenceScore).toBeCloseTo(62.5);
      expect(updateArg.avgParagraphScore).toBeCloseTo(62.5);
    });
  });

  describe('acceptRecommendedDifficulty', () => {
    it('throws when there is no pending recommendation', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({ recommendedDifficulty: null });
      await expect(service.acceptRecommendedDifficulty('u1')).rejects.toThrow(BadRequestException);
    });

    it('promotes currentDifficulty to the recommendation and stamps acceptedAt', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        recommendedDifficulty: 'ADVANCED',
      });
      prismaMock.learningProfile.update.mockResolvedValueOnce({
        calibrated: true,
        calibrationWordsCompleted: 3,
        currentDifficulty: 'ADVANCED',
        recommendedDifficulty: 'ADVANCED',
        recommendedDifficultyAcceptedAt: new Date(),
        initialCefrEstimate: 'B2',
        weaknessAreas: [],
        avgGuessAccuracy: 0.9,
        avgSentenceScore: 90,
        avgParagraphScore: 90,
        avgResponseSpeedMs: 4000,
        hintDependencyRate: 0,
        learningConsistency: 0.9,
      });

      const view = await service.acceptRecommendedDifficulty('u1');

      expect(prismaMock.learningProfile.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: {
          currentDifficulty: 'ADVANCED',
          recommendedDifficultyAcceptedAt: expect.any(Date),
        },
      });
      expect(view.currentDifficulty).toBe('ADVANCED');
    });
  });

  describe('rejectRecommendedDifficulty', () => {
    it('throws when there is no pending recommendation', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({ recommendedDifficulty: null });
      await expect(service.rejectRecommendedDifficulty('u1')).rejects.toThrow(BadRequestException);
    });

    it('clears the recommendation and leaves currentDifficulty untouched', async () => {
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        recommendedDifficulty: 'ADVANCED',
      });
      prismaMock.learningProfile.update.mockResolvedValueOnce({
        calibrated: true,
        calibrationWordsCompleted: 3,
        currentDifficulty: 'BEGINNER',
        recommendedDifficulty: null,
        recommendedDifficultyAcceptedAt: null,
        initialCefrEstimate: 'B2',
        weaknessAreas: [],
        avgGuessAccuracy: 0.9,
        avgSentenceScore: 90,
        avgParagraphScore: 90,
        avgResponseSpeedMs: 4000,
        hintDependencyRate: 0,
        learningConsistency: 0.9,
      });

      const view = await service.rejectRecommendedDifficulty('u1');

      expect(prismaMock.learningProfile.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { recommendedDifficulty: null },
      });
      expect(view.currentDifficulty).toBe('BEGINNER');
    });
  });
});
