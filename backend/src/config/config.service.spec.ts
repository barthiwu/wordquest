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

  it('splits a comma-separated CORS_ORIGIN into a trimmed array of origins', async () => {
    const service = await makeService({
      env: 'production',
      corsOrigin: 'https://barthiwu.github.io, https://wordquest.app',
    });
    expect(service.corsOrigin).toEqual(['https://barthiwu.github.io', 'https://wordquest.app']);
  });
});

describe('AppConfigService — secretWarnings', () => {
  async function makeService(values: Record<string, unknown>): Promise<AppConfigService> {
    const configMock = {
      get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [AppConfigService, { provide: ConfigService, useValue: configMock }],
    }).compile();
    return moduleRef.get(AppConfigService);
  }

  const strong = 'a'.repeat(40);
  const strong2 = 'b'.repeat(40);

  it('says nothing outside production', async () => {
    const s = await makeService({ env: 'development', 'auth.accessSecret': 'x', 'auth.refreshSecret': 'x' });
    expect(s.secretWarnings()).toEqual([]);
  });

  it('is clean for two strong, distinct secrets and a dedicated 2FA key', async () => {
    const s = await makeService({
      env: 'production',
      'auth.accessSecret': strong,
      'auth.refreshSecret': strong2,
      'twoFactor.encryptionKey': 'ab'.repeat(32),
    });
    expect(s.secretWarnings()).toEqual([]);
  });

  it('flags short, identical and fallback-derived secrets in production', async () => {
    const s = await makeService({ env: 'production', 'auth.accessSecret': 'short', 'auth.refreshSecret': 'short' });
    const warnings = s.secretWarnings().join('\n');
    expect(warnings).toMatch(/JWT_ACCESS_SECRET is shorter/);
    expect(warnings).toMatch(/identical/);
    expect(warnings).toMatch(/TWO_FACTOR_ENCRYPTION_KEY/);
  });
});
