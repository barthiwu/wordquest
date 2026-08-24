import { apiRequest } from './apiClient';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  database: 'up' | 'down';
  timestamp: string;
}

export function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health');
}
