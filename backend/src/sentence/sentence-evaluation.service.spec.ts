import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SentenceEvaluationService } from './sentence-evaluation.service';
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

const validScores = { grammar: 80, vocabulary: 90, context: 70, naturalness: 60, clarity: 100 };

describe('SentenceEvaluationService', () => {
  let service: SentenceEvaluationService;
  let configured: boolean;

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
      providers: [SentenceEvaluationService, { provide: AppConfigService, useValue: configMock }],
    }).compile();
    service = moduleRef.get(SentenceEvaluationService);
  });

  describe('isConfigured', () => {
    it('reflects the config service', () => {
      configured = true;
      expect(service.isConfigured()).toBe(true);
      configured = false;
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('evaluate', () => {
    it('throws ServiceUnavailableException when unconfigured, without calling the SDK', async () => {
      configured = false;
      await expect(
        service.evaluate('resilient', 'able to recover', 'adjective', 'She is resilient.'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('sends the target word, definition, part of speech, and sentence to the model', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({
          scores: validScores,
          confidence: 0.9,
          whatWentWell: 'x',
          whatNeedsImprovement: 'y',
          betterVersion: null,
          nextAction: 'z',
        }),
      );

      await service.evaluate(
        'resilient',
        'able to recover quickly',
        'adjective',
        'She is resilient.',
      );

      const call = createMock.mock.calls[0][0];
      const prompt = call.messages[0].content;
      expect(prompt).toContain('resilient');
      expect(prompt).toContain('able to recover quickly');
      expect(prompt).toContain('adjective');
      expect(prompt).toContain('She is resilient.');
    });

    it("never sends the word's reference example sentence — spec forbids penalizing an unusual but valid sentence for differing from it", async () => {
      createMock.mockResolvedValueOnce(
        textResponse({
          scores: validScores,
          confidence: 0.9,
          whatWentWell: 'x',
          whatNeedsImprovement: 'y',
          betterVersion: null,
          nextAction: 'z',
        }),
      );

      await service.evaluate(
        'resilient',
        'able to recover quickly',
        'adjective',
        'She is resilient.',
      );

      const call = createMock.mock.calls[0][0];
      expect(call.system).toContain('must NOT be scored down');
    });

    it('parses all five dimension scores', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({
          scores: validScores,
          confidence: 0.9,
          whatWentWell: 'x',
          whatNeedsImprovement: 'y',
          betterVersion: null,
          nextAction: 'z',
        }),
      );

      const result = await service.evaluate('resilient', 'x', 'adjective', 'She is resilient.');

      expect(result.scores).toEqual(validScores);
    });

    it('computes xpAwarded as the sum of each dimension scaled to 250 max', async () => {
      // All scores 100 -> 5 * 250 = 1250 (the spec's max).
      createMock.mockResolvedValueOnce(
        textResponse({
          scores: { grammar: 100, vocabulary: 100, context: 100, naturalness: 100, clarity: 100 },
          confidence: 1,
          whatWentWell: 'x',
          whatNeedsImprovement: 'y',
          betterVersion: null,
          nextAction: 'z',
        }),
      );

      const result = await service.evaluate('resilient', 'x', 'adjective', 'y');

      expect(result.xpAwarded).toBe(1250);
    });

    it('computes a partial xpAwarded correctly for mixed scores', async () => {
      // grammar 80 -> 200, vocabulary 90 -> 225, context 70 -> 175, naturalness 60 -> 150, clarity 100 -> 250. Sum = 1000.
      createMock.mockResolvedValueOnce(
        textResponse({
          scores: validScores,
          confidence: 0.9,
          whatWentWell: 'x',
          whatNeedsImprovement: 'y',
          betterVersion: null,
          nextAction: 'z',
        }),
      );

      const result = await service.evaluate('resilient', 'x', 'adjective', 'y');

      expect(result.xpAwarded).toBe(200 + 225 + 175 + 150 + 250);
    });

    it('clamps an out-of-range confidence into [0,1] rather than trusting the model blindly', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({
          scores: validScores,
          confidence: 1.5,
          whatWentWell: 'x',
          whatNeedsImprovement: 'y',
          betterVersion: null,
          nextAction: 'z',
        }),
      );

      const result = await service.evaluate('resilient', 'x', 'adjective', 'y');

      expect(result.confidence).toBe(1);
    });

    it('defaults confidence to 0.5 when the model omits it', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({
          scores: validScores,
          whatWentWell: 'x',
          whatNeedsImprovement: 'y',
          betterVersion: null,
          nextAction: 'z',
        }),
      );

      const result = await service.evaluate('resilient', 'x', 'adjective', 'y');

      expect(result.confidence).toBe(0.5);
    });

    it('returns null betterVersion when the model omits it', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({
          scores: validScores,
          confidence: 0.9,
          whatWentWell: 'x',
          whatNeedsImprovement: 'y',
          nextAction: 'z',
        }),
      );

      const result = await service.evaluate('resilient', 'x', 'adjective', 'y');

      expect(result.betterVersion).toBeNull();
    });

    it('throws a clear error when the model response is not valid JSON', async () => {
      createMock.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] });
      await expect(service.evaluate('resilient', 'x', 'adjective', 'y')).rejects.toThrow(
        'unparseable output',
      );
    });

    it('throws a clear error when a required feedback field is missing', async () => {
      createMock.mockResolvedValueOnce(textResponse({ scores: validScores, confidence: 0.9 }));
      await expect(service.evaluate('resilient', 'x', 'adjective', 'y')).rejects.toThrow(
        'missing required fields',
      );
    });

    it('throws a clear error when a dimension score is out of the 0-100 range', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({
          scores: { ...validScores, grammar: 150 },
          confidence: 0.9,
          whatWentWell: 'x',
          whatNeedsImprovement: 'y',
          betterVersion: null,
          nextAction: 'z',
        }),
      );
      await expect(service.evaluate('resilient', 'x', 'adjective', 'y')).rejects.toThrow(
        'invalid grammar score',
      );
    });

    it('throws a clear error when a dimension score is missing entirely', async () => {
      const { clarity, ...incompleteScores } = validScores;
      createMock.mockResolvedValueOnce(
        textResponse({
          scores: incompleteScores,
          confidence: 0.9,
          whatWentWell: 'x',
          whatNeedsImprovement: 'y',
          betterVersion: null,
          nextAction: 'z',
        }),
      );
      await expect(service.evaluate('resilient', 'x', 'adjective', 'y')).rejects.toThrow(
        'invalid clarity score',
      );
    });

    it('reuses the same client instance across calls (constructed once)', async () => {
      const Anthropic = jest.requireMock('@anthropic-ai/sdk');
      createMock.mockResolvedValue(
        textResponse({
          scores: validScores,
          confidence: 0.9,
          whatWentWell: 'x',
          whatNeedsImprovement: 'y',
          betterVersion: null,
          nextAction: 'z',
        }),
      );

      await service.evaluate('a', 'x', 'noun', 'y');
      await service.evaluate('b', 'x', 'noun', 'y');

      expect(Anthropic).toHaveBeenCalledTimes(1);
    });
  });
});
