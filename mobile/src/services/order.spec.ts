import { getMyOrder, getMyOrderHistory, getOrderCatalog, selectOrder } from './order';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('order service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests the public Order catalog', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await getOrderCatalog('tok');
    expect(apiRequest).toHaveBeenCalledWith('/order/catalog', { accessToken: 'tok' });
  });

  it("requests the player's current Order", async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getMyOrder('tok');
    expect(apiRequest).toHaveBeenCalledWith('/order/me', { accessToken: 'tok' });
  });

  it("requests the player's Order history", async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await getMyOrderHistory('tok');
    expect(apiRequest).toHaveBeenCalledWith('/order/me/history', { accessToken: 'tok' });
  });

  it('selects an Order', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await selectOrder('tok', 'SCRIBES');
    expect(apiRequest).toHaveBeenCalledWith('/order/me', {
      method: 'POST',
      body: { order: 'SCRIBES' },
      accessToken: 'tok',
    });
  });
});
