import { requestScrambleHint, startScrambleQuest, submitScrambleAnswer } from './scrambleQuest';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('scrambleQuest service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts (or resumes) a session', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await startScrambleQuest('tok');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/scramble-quest/start', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('requests a hint for a session', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await requestScrambleHint('tok', 's1');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/scramble-quest/s1/hint', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('submits an answer for a session', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await submitScrambleAnswer('tok', 's1', 'train');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/scramble-quest/s1/answer', {
      method: 'POST',
      body: { answer: 'train' },
      accessToken: 'tok',
    });
  });
});
