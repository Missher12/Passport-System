import type { AdapterMode } from '../../types/domain';
import type { ApiClient } from './contracts';
import { MockApiAdapter } from '../adapters/mockAdapter';
import { ProductionApiAdapter } from '../adapters/productionAdapter';

const mockInstance = new MockApiAdapter();
let prodInstance: ProductionApiAdapter | null = null;
let activeMode: AdapterMode = 'mock';

export function getApiClient(): ApiClient {
  if (activeMode === 'production') {
    if (!prodInstance) {
      prodInstance = new ProductionApiAdapter(
        (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL) ||
          '/api/v1',
      );
    }
    return prodInstance;
  }
  return mockInstance;
}

export function setApiAdapterMode(mode: AdapterMode, apiBaseUrl?: string): ApiClient {
  activeMode = mode;
  if (mode === 'production') {
    prodInstance = new ProductionApiAdapter(apiBaseUrl || '/api/v1');
  }
  return getApiClient();
}

export function getApiAdapterMode(): AdapterMode {
  return activeMode;
}

export function getMockAdapterInstance(): MockApiAdapter {
  return mockInstance;
}
