import { startCompleteIt, submitCompleteItAnswer } from './completeIt';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('completeIt service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts (or resumes) a session', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await startCompleteIt('tok');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/complete-it/start', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('submits an answer for a session', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await submitCompleteItAnswer('tok', 's1', 'train');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/complete-it/s1/answer', {
      method: 'POST',
      body: { answer: 'train' },
      accessToken: 'tok',
    });
  });
});
