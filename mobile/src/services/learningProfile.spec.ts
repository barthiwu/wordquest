import {
  getMyLearningProfile,
  acceptRecommendedDifficulty,
  rejectRecommendedDifficulty,
} from './learningProfile';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('learningProfile service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the profile', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getMyLearningProfile('tok');
    expect(apiRequest).toHaveBeenCalledWith('/learning-profile/me', { accessToken: 'tok' });
  });

  it('accepts the recommended difficulty', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await acceptRecommendedDifficulty('tok');
    expect(apiRequest).toHaveBeenCalledWith('/learning-profile/me/accept-difficulty', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('rejects the recommended difficulty', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await rejectRecommendedDifficulty('tok');
    expect(apiRequest).toHaveBeenCalledWith('/learning-profile/me/reject-difficulty', {
      method: 'POST',
      accessToken: 'tok',
    });
  });
});
