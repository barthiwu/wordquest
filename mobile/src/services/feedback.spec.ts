import { submitFeedback } from './feedback';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('feedback service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POSTs the feedback input as the request body', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({ id: 'f1' });

    const input = {
      type: 'FREEFORM' as const,
      category: 'BUG' as const,
      message: 'crashes on login',
    };
    const result = await submitFeedback('tok', input);

    expect(apiRequest).toHaveBeenCalledWith('/feedback', {
      method: 'POST',
      accessToken: 'tok',
      body: input,
    });
    expect(result).toEqual({ id: 'f1' });
  });
});
