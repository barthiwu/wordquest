import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

/**
 * Sends transactional email — verification and password-reset links.
 * No provider is committed to at the schema/flow level; the default
 * send() implementation below talks to Resend's simple HTTP API as a
 * concrete choice, but swapping providers only means changing send()
 * — nothing else in the auth flow depends on which one is used.
 *
 * Same isConfigured() gate as Storage/AI elsewhere in this codebase:
 * when unconfigured, sends are logged rather than attempted. This is
 * deliberate — it means the token generation, validation, expiry, and
 * account-status side of email verification / password reset can be
 * built, tested, and used end-to-end independently of an email
 * provider actually being wired up. The fallback log line (see send()
 * below) intentionally logs only the subject and recipient, NEVER the
 * token or the verify/reset URL — V21 §12's "remove development
 * tokens, debug exposure" applies here too, so this stays true even in
 * an unconfigured/dev environment. A tester without a real email
 * provider configured exercises the flow via the raw token AuthService
 * hands the CALLER of resend-verification/request-password-reset in
 * tests (see auth.e2e-spec.ts's mocked EmailService), not via logs.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return this.config.isEmailConfigured;
  }

  /**
   * Both links below use the app's own custom URL scheme
   * (`wordquest://...`, matching the mobile app.json `scheme` and the
   * same scheme Notification.deepLink already uses for push taps —
   * Correction & Completion Spec §6 "mobile deep link handling") rather
   * than a web URL: WordQuest has no web companion for a
   * `https://app.wordquest.example/...` link to land on, and most
   * mobile mail clients (Gmail, Apple Mail) open a custom-scheme link
   * exactly like any other. A real Universal Link / App Link (a
   * `https://` URL that opens the app via a domain-verified
   * association file, with a graceful web fallback when the app isn't
   * installed) is the natural upgrade once WordQuest has a real domain
   * to verify against — appBaseUrl stays available in config for that.
   */
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const verifyUrl = `wordquest://verify-email?token=${encodeURIComponent(token)}`;
    await this.send(
      to,
      'Verify your WordQuest email',
      `<p>Verify your email: <a href="${verifyUrl}">${verifyUrl}</a></p><p>Open this link on the device with WordQuest installed.</p>`,
    );
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `wordquest://reset-password?token=${encodeURIComponent(token)}`;
    await this.send(
      to,
      'Reset your WordQuest password',
      `<p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p><p>Open this link on the device with WordQuest installed. If you didn't request this, you can ignore this email.</p>`,
    );
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(`Email not configured — would have sent "${subject}" to ${to}`);
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.emailApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.config.emailFromAddress, to, subject, html }),
    });

    if (!response.ok) {
      throw new Error(`Email send failed (${response.status}): ${await response.text()}`);
    }
  }
}
