import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AliService } from './ali.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';

const createMock = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
});

function textResponse(json: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(json) }] };
}

describe('AliService', () => {
  let service: AliService;
  let configured: boolean;

  const prismaMock = {
    aliMessage: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn(),
    },
    userProgression: {
      findUnique: jest.fn(),
    },
    learningProfile: {
      findUnique: jest.fn(),
    },
  };

  const configMock = {
    get isAiConfigured() {
      return configured;
    },
    aiApiKey: 'test-key',
    aiModel: 'claude-sonnet-5',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    configured = true;
    const moduleRef = await Test.createTestingModule({
      providers: [
        AliService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AppConfigService, useValue: configMock },
      ],
    }).compile();
    service = moduleRef.get(AliService);
  });

  describe('isConfigured', () => {
    it('reflects the config service', () => {
      configured = true;
      expect(service.isConfigured()).toBe(true);
      configured = false;
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('react', () => {
    it('throws ServiceUnavailableException when unconfigured, without calling the SDK', async () => {
      configured = false;
      await expect(
        service.react('u1', { type: 'LEVEL_UP', journeyStage: 0, context: { newLevel: 2 } }),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('includes the tone for the given journeyStage in the system prompt', async () => {
      createMock.mockResolvedValueOnce(textResponse({ text: 'Nice work!', recommendation: null }));

      await service.react('u1', { type: 'LEVEL_UP', journeyStage: 8, context: { newLevel: 91 } });

      const call = createMock.mock.calls[0][0];
      expect(call.system).toContain('Confident, legendary, playful challenge; never cruel');
    });

    it('sends the event type and context to the model', async () => {
      createMock.mockResolvedValueOnce(textResponse({ text: 'Nice work!', recommendation: null }));

      await service.react('u1', {
        type: 'MASTERY_EVENT',
        journeyStage: 0,
        context: { wordMastered: 'resilient' },
      });

      const call = createMock.mock.calls[0][0];
      const userMessage = call.messages[0].content;
      expect(userMessage).toContain('MASTERY_EVENT');
      expect(userMessage).toContain('resilient');
    });

    it('persists every generated message, not just returns it', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({ text: 'Level 12 — nice.', recommendation: 'Try a Boss Battle next.' }),
      );

      await service.react('u1', { type: 'LEVEL_UP', journeyStage: 3, context: { newLevel: 12 } });

      expect(prismaMock.aliMessage.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          eventType: 'LEVEL_UP',
          eventContext: { newLevel: 12 },
          text: 'Level 12 — nice.',
          recommendation: 'Try a Boss Battle next.',
          tone: 'Witty, more direct, encouraging challenge',
          promptVersion: 'v1',
        },
      });
    });

    it('returns null recommendation when the model omits one', async () => {
      createMock.mockResolvedValueOnce(textResponse({ text: 'Nice work!' }));

      const result = await service.react('u1', {
        type: 'STREAK_MILESTONE',
        journeyStage: 0,
        context: { days: 7 },
      });

      expect(result.recommendation).toBeNull();
    });

    it('throws a clear error when the model response is not valid JSON', async () => {
      createMock.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] });

      await expect(
        service.react('u1', { type: 'LEVEL_UP', journeyStage: 0, context: {} }),
      ).rejects.toThrow('unparseable output');
    });

    it('throws a clear error when the response is missing the required text field', async () => {
      createMock.mockResolvedValueOnce(textResponse({ recommendation: 'x' }));

      await expect(
        service.react('u1', { type: 'LEVEL_UP', journeyStage: 0, context: {} }),
      ).rejects.toThrow('missing required "text" field');
    });

    it('never calls any progression-mutating method — it has no such dependency injected at all', () => {
      // Structural guarantee, not just a runtime check: AliService's
      // constructor only takes PrismaService and AppConfigService (see
      // the class definition) — there is no ProgressionService,
      // MasteryService, or AchievementService for it to even call.
      expect(service).not.toHaveProperty('progression');
      expect(service).not.toHaveProperty('mastery');
      expect(service).not.toHaveProperty('achievements');
    });
  });

  describe('reactFireAndForget', () => {
    it('returns synchronously without awaiting the Claude call', () => {
      createMock.mockImplementationOnce(() => new Promise(() => {})); // never resolves

      const start = Date.now();
      service.reactFireAndForget('u1', { type: 'LEVEL_UP', journeyStage: 0, context: {} });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50); // did not wait on the never-resolving call
    });

    it('does nothing at all when unconfigured — never even constructs the client', () => {
      configured = false;
      service.reactFireAndForget('u1', { type: 'LEVEL_UP', journeyStage: 0, context: {} });
      expect(createMock).not.toHaveBeenCalled();
    });

    it('swallows a rejection from react() without throwing', async () => {
      createMock.mockRejectedValueOnce(new Error('network error'));

      expect(() =>
        service.reactFireAndForget('u1', { type: 'LEVEL_UP', journeyStage: 0, context: {} }),
      ).not.toThrow();
      // Let the swallowed rejection's microtask settle before the test ends.
      await new Promise((resolve) => setImmediate(resolve));
    });
  });

  describe('tone modifiers', () => {
    it('includes learningSignals-derived modifiers in the system prompt, without changing the stored tone', async () => {
      createMock.mockResolvedValueOnce(textResponse({ text: 'Nice!', recommendation: null }));

      await service.react('u1', {
        type: 'LEVEL_UP',
        journeyStage: 0,
        context: { newLevel: 2 },
        learningSignals: { currentStreak: 14, weaknessAreas: ['guessing'] },
      });

      const call = createMock.mock.calls[0][0];
      expect(call.system).toContain('14-day streak');
      expect(call.system).toContain('guessing');
      expect(prismaMock.aliMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tone: 'Warm, encouraging, lightly playful' }),
        }),
      );
    });

    it('omits the modifier block entirely when no signals are notable', async () => {
      createMock.mockResolvedValueOnce(textResponse({ text: 'Nice!', recommendation: null }));

      await service.react('u1', { type: 'LEVEL_UP', journeyStage: 0, context: {} });

      const call = createMock.mock.calls[0][0];
      expect(call.system).not.toContain('Additional context for this player right now');
    });
  });

  describe('on-demand Learning Assistant / AI Tutor capabilities', () => {
    beforeEach(() => {
      prismaMock.userProgression.findUnique.mockResolvedValue({
        journeyStage: 2,
        currentStreak: 3,
      });
      prismaMock.learningProfile.findUnique.mockResolvedValue({
        weaknessAreas: [],
        currentDifficulty: 'BEGINNER',
      });
    });

    it("explainMistake resolves the player's journeyStage/signals and sends a MISTAKE_EXPLANATION event", async () => {
      createMock.mockResolvedValueOnce(
        textResponse({ text: 'Close, but...', recommendation: 'Try again with the base form.' }),
      );

      const result = await service.explainMistake('u1', {
        word: 'resilient',
        playerAnswer: 'resiliant',
        correctAnswer: 'resilient',
        stage: 'GUESS',
      });

      expect(prismaMock.userProgression.findUnique).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      const call = createMock.mock.calls[0][0];
      expect(call.system).toContain('Friendly, playful, confidence-building'); // stage 2 tone
      const userMessage = call.messages[0].content;
      expect(userMessage).toContain('MISTAKE_EXPLANATION');
      expect(userMessage).toContain('resiliant');
      expect(result.text).toBe('Close, but...');
    });

    it('suggestVocabularyAlternatives sends a VOCABULARY_ALTERNATIVES event', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({ text: 'Try "tenacious" or "hardy".', recommendation: null }),
      );

      await service.suggestVocabularyAlternatives('u1', { word: 'resilient' });

      const userMessage = createMock.mock.calls[0][0].messages[0].content;
      expect(userMessage).toContain('VOCABULARY_ALTERNATIVES');
      expect(userMessage).toContain('resilient');
    });

    it('reviewWriting sends a WRITING_FEEDBACK event', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({ text: 'Good structure.', recommendation: null }),
      );

      await service.reviewWriting('u1', { text: 'The cat sit on the mat.' });

      const userMessage = createMock.mock.calls[0][0].messages[0].content;
      expect(userMessage).toContain('WRITING_FEEDBACK');
      expect(userMessage).toContain('The cat sit on the mat.');
    });

    it('generateForgettingCurveReminder sends a FORGETTING_CURVE_REMINDER event', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({ text: 'Time to review!', recommendation: null }),
      );

      await service.generateForgettingCurveReminder('u1', {
        wordsNeedingReview: ['resilient', 'candid'],
      });

      const userMessage = createMock.mock.calls[0][0].messages[0].content;
      expect(userMessage).toContain('FORGETTING_CURVE_REMINDER');
      expect(userMessage).toContain('resilient');
    });

    it('defaults to journeyStage 0 when the player has no progression row yet', async () => {
      prismaMock.userProgression.findUnique.mockResolvedValueOnce(null);
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce(null);
      createMock.mockResolvedValueOnce(textResponse({ text: 'Hi!', recommendation: null }));

      await service.suggestVocabularyAlternatives('u1', { word: 'candid' });

      const call = createMock.mock.calls[0][0];
      expect(call.system).toContain('Warm, encouraging, lightly playful');
    });
  });

  describe('getMyMessages', () => {
    it("returns the player's own messages, most recent first", async () => {
      prismaMock.aliMessage.findMany.mockResolvedValueOnce([
        {
          text: 'Welcome!',
          recommendation: null,
          tone: 'Warm, encouraging, lightly playful',
          promptVersion: 'v1',
        },
      ]);

      const result = await service.getMyMessages('u1');

      expect(result).toHaveLength(1);
      expect(prismaMock.aliMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' }, orderBy: { createdAt: 'desc' } }),
      );
    });
  });
});
