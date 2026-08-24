import { getWordById, searchWords } from './words';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('getWordById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches a word by id', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getWordById('tok', 'w1');
    expect(apiRequest).toHaveBeenCalledWith('/words/w1', { accessToken: 'tok' });
  });
});

describe('searchWords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds the query string with q and a limit', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);

    await searchWords('tok', 'resil');

    expect(apiRequest).toHaveBeenCalledWith('/words/search?q=resil&limit=20', {
      accessToken: 'tok',
    });
  });

  it('returns whatever the API resolves with', async () => {
    const results = [
      {
        id: 'w1',
        word: 'resilient',
        definition: 'x',
        partOfSpeech: 'adjective',
        baseDifficulty: 'INTERMEDIATE',
      },
    ];
    (apiRequest as jest.Mock).mockResolvedValueOnce(results);

    const result = await searchWords('tok', 'resil');

    expect(result).toEqual(results);
  });
});
