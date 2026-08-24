import { Test } from '@nestjs/testing';
import { EmailService } from './email.service';
import { AppConfigService } from '../config/config.service';

describe('EmailService', () => {
  let service: EmailService;
  let configured: boolean;

  const configMock = {
    get isEmailConfigured() {
      return configured;
    },
    emailApiKey: 'test-key',
    emailFromAddress: 'noreply@wordquest.example',
    appBaseUrl: 'https://app.wordquest.example',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    configured = true;
    global.fetch = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [EmailService, { provide: AppConfigService, useValue: configMock }],
    }).compile();
    service = moduleRef.get(EmailService);
  });

  describe('isConfigured', () => {
    it('reflects the config service', () => {
      configured = true;
      expect(service.isConfigured()).toBe(true);
      configured = false;
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('sendVerificationEmail', () => {
    it('logs instead of sending when unconfigured, without calling fetch', async () => {
      configured = false;
      await service.sendVerificationEmail('user@example.com', 'tok123');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('includes the token in the verification link', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      await service.sendVerificationEmail('user@example.com', 'tok123');

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.to).toBe('user@example.com');
      expect(body.html).toContain('token=tok123');
      expect(body.html).toContain('verify-email');
    });

    it('URL-encodes the token', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      await service.sendVerificationEmail('user@example.com', 'tok/with+special=chars');

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.html).toContain(encodeURIComponent('tok/with+special=chars'));
    });

    it('throws a clear error when the provider responds with a non-ok status', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('bad key'),
      });
      await expect(service.sendVerificationEmail('user@example.com', 'tok123')).rejects.toThrow(
        'Email send failed (401)',
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('includes the token in the reset link', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      await service.sendPasswordResetEmail('user@example.com', 'reset456');

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.html).toContain('token=reset456');
      expect(body.html).toContain('reset-password');
    });

    it('logs instead of sending when unconfigured', async () => {
      configured = false;
      await service.sendPasswordResetEmail('user@example.com', 'reset456');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
