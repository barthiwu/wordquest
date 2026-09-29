import { FeedbackController } from './feedback.controller';

describe('FeedbackController', () => {
  let controller: FeedbackController;

  const feedbackMock = { submit: jest.fn(), list: jest.fn(), updateStatus: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FeedbackController(feedbackMock as any);
  });

  it('submit delegates to the service with the DTO', () => {
    const dto = { type: 'PROMPT' as const, category: 'WORD_DUEL' as const, rating: 3 };
    controller.submit('u1', dto);
    expect(feedbackMock.submit).toHaveBeenCalledWith('u1', dto);
  });

  it('list delegates optional status/category query params through', () => {
    controller.list('NEW' as any, 'BUG' as any);
    expect(feedbackMock.list).toHaveBeenCalledWith({ status: 'NEW', category: 'BUG' });
  });

  it('list works with no filters at all', () => {
    controller.list(undefined, undefined);
    expect(feedbackMock.list).toHaveBeenCalledWith({ status: undefined, category: undefined });
  });

  it('review delegates to updateStatus', () => {
    controller.review('f1', { status: 'RESOLVED' as any });
    expect(feedbackMock.updateStatus).toHaveBeenCalledWith('f1', 'RESOLVED');
  });
});
