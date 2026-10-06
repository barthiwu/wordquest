import {
  getWordDuelState,
  sendWordDuelMessage,
  joinWordDuelQueue,
  revealWordDuelClue,
  submitWordDuelAnswer,
} from './wordDuel';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('wordDuel service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('joins matchmaking (or resumes an in-progress match)', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await joinWordDuelQueue('tok');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/word-duel/join', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('polls the live state for a match', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getWordDuelState('tok', 'm1');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/word-duel/m1', { accessToken: 'tok' });
  });

  it('submits an answer for a match', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await submitWordDuelAnswer('tok', 'm1', 'train');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/word-duel/m1/answer', {
      method: 'POST',
      body: { answer: 'train' },
      accessToken: 'tok',
    });
  });

  it('reveals the next clue for a match', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await revealWordDuelClue('tok', 'm1');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/word-duel/m1/clue', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('asks for chat after a cursor when polling with one', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getWordDuelState('tok', 'm1', 12);
    expect(apiRequest).toHaveBeenCalledWith('/arcade/word-duel/m1?chatAfter=12', {
      accessToken: 'tok',
    });
  });

  it('sends a chat message', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await sendWordDuelMessage('tok', 'm1', 'Good luck!');
    expect(apiRequest).toHaveBeenCalledWith('/arcade/word-duel/m1/chat', {
      method: 'POST',
      body: { body: 'Good luck!' },
      accessToken: 'tok',
    });
  });
});
