import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from './config.service';

describe('AppConfigService — corsOrigin', () => {
  async function makeService(values: Record<string, unknown>): Promise<AppConfigService> {
    const configMock = {
      get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [AppConfigService, { provide: ConfigService, useValue: configMock }],
    }).compile();
    return moduleRef.get(AppConfigService);
  }

  it('allows the wildcard default outside production', async () => {
    const service = await makeService({ env: 'development' });
    expect(service.corsOrigin).toBe('*');
  });

  it('allows a specific origin in production', async () => {
    const service = await makeService({
      env: 'production',
      corsOrigin: 'https://app.wordquest.example',
    });
    expect(service.corsOrigin).toBe('https://app.wordquest.example');
  });

  it('refuses to boot with a wildcard CORS policy in production (V21 §12)', async () => {
    const service = await makeService({ env: 'production' }); // corsOrigin unset -> defaults to '*'
    expect(() => service.corsOrigin).toThrow(/wildcard/i);
  });
});
