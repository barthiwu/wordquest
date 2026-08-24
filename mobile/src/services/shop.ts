import { apiRequest } from './apiClient';

export interface ShopItem {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  priceGlyphs: number;
  owned: boolean;
}

export interface ShopPurchase {
  id: string;
  itemId: string;
  itemKey: string;
  itemName: string;
  priceGlyphs: number;
  purchasedAt: string;
}

/** The Glyph shop (spec §9) — cosmetic ALI outfits/accessories bought with Glyphs. */
export function getShopCatalog(accessToken: string): Promise<ShopItem[]> {
  return apiRequest<ShopItem[]>('/shop/catalog', { accessToken });
}

export function getShopPurchaseHistory(accessToken: string): Promise<ShopPurchase[]> {
  return apiRequest<ShopPurchase[]>('/shop/purchases', { accessToken });
}

export function purchaseShopItem(accessToken: string, itemId: string): Promise<ShopPurchase> {
  return apiRequest<ShopPurchase>('/shop/purchases', {
    method: 'POST',
    accessToken,
    body: { itemId },
  });
}
