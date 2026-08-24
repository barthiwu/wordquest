import {
  getBattleLeaderboard,
  getUpcomingBattle,
  joinBattle,
  submitBattleAnswer,
} from './bossBattle';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('bossBattle service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests the upcoming/current battle', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getUpcomingBattle('tok');
    expect(apiRequest).toHaveBeenCalledWith('/boss-battle/upcoming', { accessToken: 'tok' });
  });

  it('joins the current battle', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await joinBattle('tok');
    expect(apiRequest).toHaveBeenCalledWith('/boss-battle/join', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('submits an answer with a generated idempotency key when none is given', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await submitBattleAnswer('tok', 'greeting');
    expect(apiRequest).toHaveBeenCalledWith('/boss-battle/answer', {
      method: 'POST',
      body: { answer: 'greeting' },
      accessToken: 'tok',
      headers: { 'Idempotency-Key': expect.any(String) },
    });
  });

  it('submits an answer with a caller-supplied idempotency key when given', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await submitBattleAnswer('tok', 'greeting', 'my-fixed-key');
    expect(apiRequest).toHaveBeenCalledWith('/boss-battle/answer', {
      method: 'POST',
      body: { answer: 'greeting' },
      accessToken: 'tok',
      headers: { 'Idempotency-Key': 'my-fixed-key' },
    });
  });

  it("requests the player's own group leaderboard", async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getBattleLeaderboard('tok');
    expect(apiRequest).toHaveBeenCalledWith('/boss-battle/leaderboard', { accessToken: 'tok' });
  });
});
