import { getClanLeaderboard, getGlobalLeaderboard } from './leaderboards';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('leaderboards service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests the global leaderboard with the access token', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({ entries: [], viewer: {} });

    await getGlobalLeaderboard('tok123');

    expect(apiRequest).toHaveBeenCalledWith('/leaderboards/global', { accessToken: 'tok123' });
  });

  it('requests the clan leaderboard with the access token', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({ entries: [], viewer: {} });

    await getClanLeaderboard('tok456');

    expect(apiRequest).toHaveBeenCalledWith('/leaderboards/clan', { accessToken: 'tok456' });
  });

  it('returns whatever the API client resolves with', async () => {
    const view = {
      entries: [{ rank: 1, userId: 'u1', username: 'ada', clanName: null, level: 3, totalXp: 900 }],
      viewer: { rank: 1, userId: 'u1', username: 'ada', clanName: null, level: 3, totalXp: 900 },
    };
    (apiRequest as jest.Mock).mockResolvedValueOnce(view);

    const result = await getGlobalLeaderboard('tok');

    expect(result).toEqual(view);
  });
});
