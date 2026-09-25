import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ParagraphEvaluationService } from './paragraph-evaluation.service';
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

const validScores = { grammar: 80, vocabulary: 90, structure: 70, flow: 60, context: 100 };
const fullEvaluation = {
  scores: validScores,
  confidence: 0.9,
  estimatedProficiency: 'B1',
  whatWentWell: 'x',
  whatNeedsImprovement: 'y',
  suggestedRevision: null,
  nextAction: 'z',
};

describe('ParagraphEvaluationService', () => {
  let service: ParagraphEvaluationService;
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
      providers: [ParagraphEvaluationService, { provide: AppConfigService, useValue: configMock }],
    }).compile();
    service = moduleRef.get(ParagraphEvaluationService);
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
      await expect(service.evaluate('resilient', 'x', 'adjective', 'y'.repeat(30))).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(createMock).not.toHaveBeenCalled();
    });

    it('sends the target word, definition, part of speech, and paragraph to the model', async () => {
      createMock.mockResolvedValueOnce(textResponse(fullEvaluation));

      await service.evaluate(
        'resilient',
        'able to recover quickly',
        'adjective',
        'A long paragraph about resilience.',
      );

      const call = createMock.mock.calls[0][0];
      const prompt = call.messages[0].content;
      expect(prompt).toContain('resilient');
      expect(prompt).toContain('able to recover quickly');
      expect(prompt).toContain('adjective');
      expect(prompt).toContain('A long paragraph about resilience.');
    });

    it('instructs the model not to let target-word misuse drag down unrelated dimension scores', async () => {
      createMock.mockResolvedValueOnce(textResponse(fullEvaluation));

      await service.evaluate('resilient', 'x', 'adjective', 'y');

      const call = createMock.mock.calls[0][0];
      expect(call.system).toContain('do not let it drag down grammar, structure, or flow');
    });

    it('parses all five dimension scores', async () => {
      createMock.mockResolvedValueOnce(textResponse(fullEvaluation));
      const result = await service.evaluate('resilient', 'x', 'adjective', 'y');
      expect(result.scores).toEqual(validScores);
    });

    it('instructs the model to write feedback in the given native language', async () => {
      createMock.mockResolvedValueOnce(textResponse(fullEvaluation));
      await service.evaluate('resilient', 'x', 'adjective', 'y', 'fa');

      const call = createMock.mock.calls[0][0];
      expect(call.system).toContain('Farsi/Persian');
      expect(call.system).toContain('never translate the content being learned');
    });

    it('omits the language instruction when nativeLanguage is unset', async () => {
      createMock.mockResolvedValueOnce(textResponse(fullEvaluation));
      await service.evaluate('resilient', 'x', 'adjective', 'y');

      const call = createMock.mock.calls[0][0];
      expect(call.system).not.toContain('native/comprehension language');
    });

    it('computes xpAwarded as the sum of each dimension scaled to 350 max', async () => {
      // All scores 100 -> 5 * 350 = 1750 (the spec's max).
      createMock.mockResolvedValueOnce(
        textResponse({
          ...fullEvaluation,
          scores: { grammar: 100, vocabulary: 100, structure: 100, flow: 100, context: 100 },
        }),
      );
      const result = await service.evaluate('resilient', 'x', 'adjective', 'y');
      expect(result.xpAwarded).toBe(1750);
    });

    it('computes a partial xpAwarded correctly for mixed scores', async () => {
      // grammar 80->280, vocabulary 90->315, structure 70->245, flow 60->210, context 100->350. Sum = 1400.
      createMock.mockResolvedValueOnce(textResponse(fullEvaluation));
      const result = await service.evaluate('resilient', 'x', 'adjective', 'y');
      expect(result.xpAwarded).toBe(280 + 315 + 245 + 210 + 350);
    });

    it('returns the estimated proficiency label', async () => {
      createMock.mockResolvedValueOnce(textResponse(fullEvaluation));
      const result = await service.evaluate('resilient', 'x', 'adjective', 'y');
      expect(result.estimatedProficiency).toBe('B1');
    });

    it('clamps an out-of-range confidence into [0,1]', async () => {
      createMock.mockResolvedValueOnce(textResponse({ ...fullEvaluation, confidence: -0.5 }));
      const result = await service.evaluate('resilient', 'x', 'adjective', 'y');
      expect(result.confidence).toBe(0);
    });

    it('returns null suggestedRevision when the model omits it', async () => {
      const { suggestedRevision, ...withoutRevision } = fullEvaluation;
      createMock.mockResolvedValueOnce(textResponse(withoutRevision));
      const result = await service.evaluate('resilient', 'x', 'adjective', 'y');
      expect(result.suggestedRevision).toBeNull();
    });

    it('throws a clear error when the model response is not valid JSON', async () => {
      createMock.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] });
      await expect(service.evaluate('resilient', 'x', 'adjective', 'y')).rejects.toThrow(
        'unparseable output',
      );
    });

    it('throws a clear error when estimatedProficiency is missing', async () => {
      const { estimatedProficiency, ...withoutProficiency } = fullEvaluation;
      createMock.mockResolvedValueOnce(textResponse(withoutProficiency));
      await expect(service.evaluate('resilient', 'x', 'adjective', 'y')).rejects.toThrow(
        'missing required fields',
      );
    });

    it('throws a clear error when a dimension score is out of the 0-100 range', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({ ...fullEvaluation, scores: { ...validScores, flow: -10 } }),
      );
      await expect(service.evaluate('resilient', 'x', 'adjective', 'y')).rejects.toThrow(
        'invalid flow score',
      );
    });

    it('reuses the same client instance across calls (constructed once)', async () => {
      const Anthropic = jest.requireMock('@anthropic-ai/sdk');
      createMock.mockResolvedValue(textResponse(fullEvaluation));
      await service.evaluate('a', 'x', 'noun', 'y');
      await service.evaluate('b', 'x', 'noun', 'y');
      expect(Anthropic).toHaveBeenCalledTimes(1);
    });
  });
});
