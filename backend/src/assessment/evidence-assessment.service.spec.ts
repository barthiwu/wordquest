import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EvidenceAssessmentService } from './evidence-assessment.service';
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

describe('EvidenceAssessmentService', () => {
  let service: EvidenceAssessmentService;
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
      providers: [EvidenceAssessmentService, { provide: AppConfigService, useValue: configMock }],
    }).compile();
    service = moduleRef.get(EvidenceAssessmentService);
  });

  describe('isConfigured', () => {
    it('reflects the config service', () => {
      configured = true;
      expect(service.isConfigured()).toBe(true);
      configured = false;
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('assess', () => {
    it('throws when neither textEvidence nor photoBytes is given', async () => {
      await expect(service.assess({ targetWord: 'resilient', definition: 'x' })).rejects.toThrow(
        'requires either textEvidence or photoBytes',
      );
      expect(createMock).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException when unconfigured, without calling the SDK', async () => {
      configured = false;
      await expect(
        service.assess({ targetWord: 'resilient', definition: 'x', textEvidence: 'a sentence' }),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('sends a text-only content block for text evidence', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({ approved: true, reasoning: 'Used correctly.', extractedText: 'a sentence' }),
      );

      await service.assess({
        targetWord: 'resilient',
        definition: 'x',
        textEvidence: 'a sentence',
      });

      const call = createMock.mock.calls[0][0];
      expect(call.messages[0].content).toHaveLength(1);
      expect(call.messages[0].content[0].type).toBe('text');
      expect(call.messages[0].content[0].text).toContain('resilient');
    });

    it('prepends an image content block for photo evidence', async () => {
      createMock.mockResolvedValueOnce(textResponse({ approved: true, reasoning: 'Clear sign.' }));

      await service.assess({
        targetWord: 'resilient',
        definition: 'x',
        photoBytes: Buffer.from('fake-image-bytes'),
        photoContentType: 'image/jpeg',
      });

      const call = createMock.mock.calls[0][0];
      expect(call.messages[0].content).toHaveLength(2);
      expect(call.messages[0].content[0]).toEqual({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: Buffer.from('fake-image-bytes').toString('base64'),
        },
      });
      expect(call.messages[0].content[1].type).toBe('text');
    });

    it('parses an approved response', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({
          approved: true,
          reasoning: 'Great context.',
          extractedText: 'seen on a poster',
        }),
      );

      const result = await service.assess({
        targetWord: 'resilient',
        definition: 'x',
        textEvidence: 'y',
      });

      expect(result).toEqual({
        approved: true,
        reasoning: 'Great context.',
        extractedText: 'seen on a poster',
      });
    });

    it('parses a rejected response', async () => {
      createMock.mockResolvedValueOnce(
        textResponse({ approved: false, reasoning: 'Word is not present.' }),
      );

      const result = await service.assess({
        targetWord: 'resilient',
        definition: 'x',
        textEvidence: 'unrelated',
      });

      expect(result.approved).toBe(false);
      expect(result.extractedText).toBeUndefined();
    });

    it('throws a clear error when the model response is not valid JSON', async () => {
      createMock.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json at all' }] });

      await expect(
        service.assess({ targetWord: 'resilient', definition: 'x', textEvidence: 'y' }),
      ).rejects.toThrow('unparseable output');
    });

    it('throws a clear error when required fields are missing from an otherwise-valid JSON response', async () => {
      createMock.mockResolvedValueOnce(textResponse({ reasoning: 'no approved field' }));

      await expect(
        service.assess({ targetWord: 'resilient', definition: 'x', textEvidence: 'y' }),
      ).rejects.toThrow('missing required fields');
    });

    it('throws when the response has no text block at all', async () => {
      createMock.mockResolvedValueOnce({ content: [] });

      await expect(
        service.assess({ targetWord: 'resilient', definition: 'x', textEvidence: 'y' }),
      ).rejects.toThrow('no text response');
    });

    it('reuses the same client instance across calls (constructed once)', async () => {
      const Anthropic = jest.requireMock('@anthropic-ai/sdk');
      createMock.mockResolvedValue(textResponse({ approved: true, reasoning: 'ok' }));

      await service.assess({ targetWord: 'a', definition: 'x', textEvidence: 'y' });
      await service.assess({ targetWord: 'b', definition: 'x', textEvidence: 'y' });

      expect(Anthropic).toHaveBeenCalledTimes(1);
    });
  });
});
