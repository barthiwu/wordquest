import { getShopCatalog, getShopPurchaseHistory, purchaseShopItem } from './shop';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('shop service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the catalog', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await getShopCatalog('tok');
    expect(apiRequest).toHaveBeenCalledWith('/shop/catalog', { accessToken: 'tok' });
  });

  it('fetches purchase history', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await getShopPurchaseHistory('tok');
    expect(apiRequest).toHaveBeenCalledWith('/shop/purchases', { accessToken: 'tok' });
  });

  it('purchases an item by id', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await purchaseShopItem('tok', 'i1');
    expect(apiRequest).toHaveBeenCalledWith('/shop/purchases', {
      method: 'POST',
      accessToken: 'tok',
      body: { itemId: 'i1' },
    });
  });
});
