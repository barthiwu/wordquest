import { BadRequestException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';

describe('FeedbackService', () => {
  const prismaMock = {
    feedback: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  };
  const analyticsMock = { track: jest.fn() };
  let service: FeedbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeedbackService(prismaMock as any, analyticsMock as any);
  });

  describe('submit', () => {
    it('creates a feedback row with the given fields', async () => {
      prismaMock.feedback.create.mockResolvedValue({ id: 'f1' });

      await service.submit('u1', {
        type: 'PROMPT',
        category: 'WORD_DUEL',
        rating: 4,
        screen: 'WordDuel',
        context: { reasons: ['not_enough_time'] },
      });

      expect(prismaMock.feedback.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          type: 'PROMPT',
          category: 'WORD_DUEL',
          rating: 4,
          message: undefined,
          screen: 'WordDuel',
          context: { reasons: ['not_enough_time'] },
        },
      });
    });

    it('defaults context to an empty object when none is given', async () => {
      prismaMock.feedback.create.mockResolvedValue({ id: 'f1' });

      await service.submit('u1', {
        type: 'FREEFORM',
        category: 'BUG',
        message: 'crashes on login',
      });

      expect(prismaMock.feedback.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ context: {} }) }),
      );
    });

    it('throws BadRequestException when neither a rating nor a message is given', async () => {
      await expect(service.submit('u1', { type: 'PROMPT', category: 'GAMEPLAY' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prismaMock.feedback.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the message is only whitespace and there is no rating', async () => {
      await expect(
        service.submit('u1', { type: 'FREEFORM', category: 'BUG', message: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a message-only FREEFORM submission with no rating', async () => {
      prismaMock.feedback.create.mockResolvedValue({ id: 'f1' });

      await expect(
        service.submit('u1', { type: 'FREEFORM', category: 'UI', message: 'buttons too small' }),
      ).resolves.toEqual({ id: 'f1' });
    });

    it('tracks FEEDBACK_PROMPT_ANSWERED for a PROMPT submission', async () => {
      prismaMock.feedback.create.mockResolvedValue({ id: 'f1' });

      await service.submit('u1', {
        type: 'PROMPT',
        category: 'WORD_DUEL',
        rating: 2,
        screen: 'WordDuel',
      });

      expect(analyticsMock.track).toHaveBeenCalledWith(
        'u1',
        'FEEDBACK_PROMPT_ANSWERED',
        { category: 'WORD_DUEL', rating: 2 },
        { screen: 'WordDuel' },
      );
    });

    it('does NOT track an analytics event for a FREEFORM submission', async () => {
      prismaMock.feedback.create.mockResolvedValue({ id: 'f1' });

      await service.submit('u1', { type: 'FREEFORM', category: 'BUG', message: 'oops' });

      expect(analyticsMock.track).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('filters by status and category, newest first, capped at 200', async () => {
      prismaMock.feedback.findMany.mockResolvedValue([]);

      await service.list({ status: 'NEW', category: 'WORD_DUEL' });

      expect(prismaMock.feedback.findMany).toHaveBeenCalledWith({
        where: { status: 'NEW', category: 'WORD_DUEL' },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    });
  });

  describe('updateStatus', () => {
    it('updates the row status', async () => {
      prismaMock.feedback.update.mockResolvedValue({ id: 'f1', status: 'REVIEWED' });

      const result = await service.updateStatus('f1', 'REVIEWED');

      expect(prismaMock.feedback.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { status: 'REVIEWED' },
      });
      expect(result).toEqual({ id: 'f1', status: 'REVIEWED' });
    });
  });
});
