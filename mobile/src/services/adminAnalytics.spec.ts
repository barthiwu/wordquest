import {
  getOverviewStats,
  getWordDuelDashboardStats,
  getArcadeDashboardStats,
} from './adminAnalytics';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('adminAnalytics service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests the overview dashboard', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getOverviewStats('tok');
    expect(apiRequest).toHaveBeenCalledWith('/analytics/dashboard/overview', {
      accessToken: 'tok',
    });
  });

  it('requests the Word Duel dashboard', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getWordDuelDashboardStats('tok');
    expect(apiRequest).toHaveBeenCalledWith('/analytics/dashboard/word-duel', {
      accessToken: 'tok',
    });
  });

  it('requests the Arcade dashboard', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getArcadeDashboardStats('tok');
    expect(apiRequest).toHaveBeenCalledWith('/analytics/dashboard/arcade', {
      accessToken: 'tok',
    });
  });
});
