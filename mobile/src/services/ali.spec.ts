import { explainMistake, getMyAliMessages } from './ali';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('ali service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches the player's own ALI messages with no limit by default", async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await getMyAliMessages('tok');
    expect(apiRequest).toHaveBeenCalledWith('/ali/me', { accessToken: 'tok' });
  });

  it('appends a limit query param when given', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await getMyAliMessages('tok', 5);
    expect(apiRequest).toHaveBeenCalledWith('/ali/me?limit=5', { accessToken: 'tok' });
  });

  it('requests a mistake explanation with the full context', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await explainMistake('tok', {
      word: 'ubiquitous',
      playerAnswer: 'ubiqitous',
      correctAnswer: 'ubiquitous',
      stage: 'GUESS',
    });
    expect(apiRequest).toHaveBeenCalledWith('/ali/explain-mistake', {
      method: 'POST',
      accessToken: 'tok',
      body: {
        word: 'ubiquitous',
        playerAnswer: 'ubiqitous',
        correctAnswer: 'ubiquitous',
        stage: 'GUESS',
      },
    });
  });
});
