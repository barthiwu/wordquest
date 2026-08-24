import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/node';
import { MonitoringService } from './monitoring.service';
import { AppConfigService } from '../config/config.service';

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
}));

describe('MonitoringService', () => {
  let service: MonitoringService;
  let configured: boolean;

  const configMock = {
    get isMonitoringConfigured() {
      return configured;
    },
    sentryDsn: 'https://test@sentry.example/1',
    env: 'test',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    configured = true;
    const moduleRef = await Test.createTestingModule({
      providers: [MonitoringService, { provide: AppConfigService, useValue: configMock }],
    }).compile();
    service = moduleRef.get(MonitoringService);
  });

  describe('isConfigured', () => {
    it('reflects the config service', () => {
      configured = true;
      expect(service.isConfigured()).toBe(true);
      configured = false;
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('init', () => {
    it('initializes Sentry with the configured DSN and environment when configured', () => {
      service.init();
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ dsn: 'https://test@sentry.example/1', environment: 'test' }),
      );
    });

    it('does nothing when unconfigured', () => {
      configured = false;
      service.init();
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('is idempotent — a second call does not re-initialize', () => {
      service.init();
      service.init();
      expect(Sentry.init).toHaveBeenCalledTimes(1);
    });
  });

  describe('captureException', () => {
    it('forwards to Sentry when configured', () => {
      const error = new Error('boom');
      service.captureException(error, { path: '/api/v1/quests' });
      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ extra: { path: '/api/v1/quests' } }),
      );
    });

    it('does not call Sentry when unconfigured, but never throws', () => {
      configured = false;
      expect(() => service.captureException(new Error('boom'))).not.toThrow();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('wraps a non-Error thrown value before reporting', () => {
      expect(() => service.captureException('a raw string error')).not.toThrow();
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'a raw string error' }),
        undefined,
      );
    });

    it('never throws even when the Sentry SDK itself throws', () => {
      (Sentry.captureException as jest.Mock).mockImplementationOnce(() => {
        throw new Error('sentry is down');
      });
      expect(() => service.captureException(new Error('boom'))).not.toThrow();
    });
  });
});
