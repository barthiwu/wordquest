import { apiRequest } from './apiClient';

export type OrderName = 'SCRIBES' | 'SEEKERS' | 'ORATORS' | 'ARTISANS';

export interface OrderCatalogEntry {
  key: OrderName;
  name: string;
  symbol: string;
  motto: string;
  philosophy: string;
}

export interface MyOrder {
  current: OrderName | null;
  selectedAt: string | null;
  changeEligibleAt: string | null;
}

export interface OrderHistoryEntry {
  order: OrderName;
  selectedAt: string;
}

/** The four fixed Orders — public info, same for every player. */
export function getOrderCatalog(accessToken: string): Promise<OrderCatalogEntry[]> {
  return apiRequest<OrderCatalogEntry[]>('/order/catalog', { accessToken });
}

/** The player's current Order and when they're next eligible to change it. */
export function getMyOrder(accessToken: string): Promise<MyOrder> {
  return apiRequest<MyOrder>('/order/me', { accessToken });
}

/** Every Order the player has ever selected, most recent first — retained as private identity history. */
export function getMyOrderHistory(accessToken: string): Promise<OrderHistoryEntry[]> {
  return apiRequest<OrderHistoryEntry[]>('/order/me/history', { accessToken });
}

/** Selects or changes Order — gated by Kingdom stage and a 30-day cooldown between changes. Zero gameplay effect: identity only. */
export function selectOrder(accessToken: string, order: OrderName): Promise<MyOrder> {
  return apiRequest<MyOrder>('/order/me', { method: 'POST', body: { order }, accessToken });
}
