import { getMyQuestCards, getMyShowcase, getQuestCard, setMyShowcase } from './questCards';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('questCards service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches the player's card gallery", async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await getMyQuestCards('tok');
    expect(apiRequest).toHaveBeenCalledWith('/quest-cards/me', { accessToken: 'tok' });
  });

  it('fetches a single card by id', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getQuestCard('tok', 'c1');
    expect(apiRequest).toHaveBeenCalledWith('/quest-cards/me/c1', { accessToken: 'tok' });
  });

  it("fetches the player's current showcase", async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await getMyShowcase('tok');
    expect(apiRequest).toHaveBeenCalledWith('/quest-cards/me/showcase', { accessToken: 'tok' });
  });

  it('replaces the showcase with the given ordered card ids', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await setMyShowcase('tok', ['c1', 'c2']);
    expect(apiRequest).toHaveBeenCalledWith('/quest-cards/me/showcase', {
      method: 'PATCH',
      accessToken: 'tok',
      body: { cardIds: ['c1', 'c2'] },
    });
  });
});
