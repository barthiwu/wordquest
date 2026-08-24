import { getMe, getWordMastery, updateMe } from './users';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('users service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the authenticated player', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getMe('tok');
    expect(apiRequest).toHaveBeenCalledWith('/users/me', { accessToken: 'tok' });
  });

  it('updates the authenticated player', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await updateMe('tok', { countryCode: 'NG' });
    expect(apiRequest).toHaveBeenCalledWith('/users/me', {
      method: 'PATCH',
      body: { countryCode: 'NG' },
      accessToken: 'tok',
    });
  });

  it("fetches the player's mastery detail for one word", async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getWordMastery('tok', 'w1');
    expect(apiRequest).toHaveBeenCalledWith('/users/me/words/w1/mastery', { accessToken: 'tok' });
  });
});
