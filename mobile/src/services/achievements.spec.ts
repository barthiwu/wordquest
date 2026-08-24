import { getAchievementCatalog, getMyAchievements } from './achievements';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('achievements service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests the public achievement catalog', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await getAchievementCatalog('tok');
    expect(apiRequest).toHaveBeenCalledWith('/achievements/catalog', { accessToken: 'tok' });
  });

  it("requests the player's own unlocks", async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await getMyAchievements('tok');
    expect(apiRequest).toHaveBeenCalledWith('/achievements/me', { accessToken: 'tok' });
  });
});
