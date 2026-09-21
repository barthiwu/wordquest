import { apiRequest } from './apiClient';
import { fileReport } from './reports';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('reports service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('files a report against the given target', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({ id: 'report-1' });

    const result = await fileReport('token-123', {
      targetType: 'USER',
      targetId: 'user-1',
      reason: 'Inappropriate name',
    });

    expect(result).toEqual({ id: 'report-1' });
    expect(apiRequest).toHaveBeenCalledWith('/reports', {
      method: 'POST',
      body: { targetType: 'USER', targetId: 'user-1', reason: 'Inappropriate name' },
      accessToken: 'token-123',
    });
  });
});
