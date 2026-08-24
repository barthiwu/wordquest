import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MasterChallengeEvaluationService } from './master-challenge-evaluation.service';
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

const validScores = { wordUsage: 100, coherence: 80, grammar: 90, vocabulary: 70, context: 60 };
const fullEvaluation = {
  scores: validScores,
  allWordsUsedCorrectly: true,
  whatWentWell: 'x',
  whatNeedsImprovement: 'y',
  nextAction: 'z',
};

const threeWords = [
  { word: 'resilient', definition: 'able to recover quickly' },
  { word: 'gratitude', definition: 'a feeling of thankfulness' },
  { word: 'perspective', definition: 'a way of viewing things' },
];

describe('MasterChallengeEvaluationService', () => {
  let service: MasterChallengeEvaluationService;
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
      providers: [
        MasterChallengeEvaluationService,
        { provide: AppConfigService, useValue: configMock },
      ],
    }).compile();
    service = moduleRef.get(MasterChallengeEvaluationService);
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
      await expect(service.evaluate(threeWords, 'y')).rejects.toThrow(ServiceUnavailableException);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('sends all three words and their definitions to the model', async () => {
      createMock.mockResolvedValueOnce(textResponse(fullEvaluation));

      await service.evaluate(threeWords, 'A paragraph using all three words.');

      const call = createMock.mock.calls[0][0];
      const prompt = call.messages[0].content;
      expect(prompt).toContain('resilient');
      expect(prompt).toContain('gratitude');
      expect(prompt).toContain('perspective');
      expect(prompt).toContain('A paragraph using all three words.');
    });

    it('parses all five dimension scores', async () => {
      createMock.mockResolvedValueOnce(textResponse(fullEvaluation));
      const result = await service.evaluate(threeWords, 'y');
      expect(result.scores).toEqual(validScores);
    });

    it('computes xpAwarded as the sum of each dimension scaled to 50 max', async () => {
      // All scores 100 -> 5 * 50 = 250 (the spec's max).
      createMock.mockResolvedValueOnce(
        textResponse({
          ...fullEvaluation,
          scores: { wordUsage: 100, coherence: 100, grammar: 100, vocabulary: 100, context: 100 },
        }),
      );
      const result = await service.evaluate(threeWords, 'y');
      expect(result.xpAwarded).toBe(250);
    });

    it('computes a partial xpAwarded correctly for mixed scores', async () => {
      // wordUsage 100->50, coherence 80->40, grammar 90->45, vocabulary 70->35, context 60->30. Sum = 200.
      createMock.mockResolvedValueOnce(textResponse(fullEvaluation));
      const result = await service.evaluate(threeWords, 'y');
      expect(result.xpAwarded).toBe(50 + 40 + 45 + 35 + 30);
    });

    it('reports allWordsUsedCorrectly independently from the dimension scores', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({ ...fullEvaluation, allWordsUsedCorrectly: false }),
      );
      const result = await service.evaluate(threeWords, 'y');
      expect(result.allWordsUsedCorrectly).toBe(false);
    });

    it('throws a clear error when the model response is not valid JSON', async () => {
      createMock.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] });
      await expect(service.evaluate(threeWords, 'y')).rejects.toThrow('unparseable output');
    });

    it('throws a clear error when allWordsUsedCorrectly is missing', async () => {
      const { allWordsUsedCorrectly, ...withoutFlag } = fullEvaluation;
      createMock.mockResolvedValueOnce(textResponse(withoutFlag));
      await expect(service.evaluate(threeWords, 'y')).rejects.toThrow('missing required fields');
    });

    it('throws a clear error when a dimension score is out of the 0-100 range', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({ ...fullEvaluation, scores: { ...validScores, grammar: 200 } }),
      );
      await expect(service.evaluate(threeWords, 'y')).rejects.toThrow('invalid grammar score');
    });

    it('reuses the same client instance across calls (constructed once)', async () => {
      const Anthropic = jest.requireMock('@anthropic-ai/sdk');
      createMock.mockResolvedValue(textResponse(fullEvaluation));
      await service.evaluate(threeWords, 'a');
      await service.evaluate(threeWords, 'b');
      expect(Anthropic).toHaveBeenCalledTimes(1);
    });
  });
});
