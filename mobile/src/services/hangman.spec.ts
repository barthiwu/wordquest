import {
  beginHangmanWord,
  guessHangmanLetter,
  requestHangmanHint,
  startHangman,
  timeoutHangmanWord,
} from './hangman';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('hangman service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiRequest as jest.Mock).mockResolvedValue({});
  });

  it('starts (or resumes) a session', async () => {
    await startHangman('tok');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/hangman/start', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('sends only the letter for a guess', async () => {
    await guessHangmanLetter('tok', 's1', 'e');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/hangman/s1/guess', {
      method: 'POST',
      body: { letter: 'e', deferNext: true },
      accessToken: 'tok',
    });
  });

  it('requests a hint for a session', async () => {
    await requestHangmanHint('tok', 's1');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/hangman/s1/hint', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('asks for deferral on a timeout too, and begins the held-back word on Continue', async () => {
    await timeoutHangmanWord('tok', 's1');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/hangman/s1/timeout', {
      method: 'POST',
      body: { deferNext: true },
      accessToken: 'tok',
    });
    await beginHangmanWord('tok', 's1');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/hangman/s1/begin', {
      method: 'POST',
      accessToken: 'tok',
    });
  });
});
