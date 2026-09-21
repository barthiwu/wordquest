import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

/**
 * Brand palette lifted from the mobile app's light theme
 * (mobile/src/constants/theme.ts) -- parchment background, ink-purple
 * text, the arcane-purple accent for the call-to-action. Kept as plain
 * hex constants here rather than importing the mobile theme file since
 * this is a separate package and email clients need literal values
 * inlined anyway (no shared build step, no CSS variables in HTML mail).
 */
const BRAND = {
  background: '#F4F1E8',
  surface: '#FFFFFF',
  ink: '#1E1B33',
  inkMuted: '#6B6580',
  arcane: '#7C3AED',
  arcaneInk: '#FFFFFF',
  glyph: '#9A6B0A',
  border: '#DDD4B8',
};

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
    const html = this.layout({
      preheader: 'Verify your email to keep your WordQuest progress safe.',
      heading: 'Verify your email',
      bodyHtml:
        '<p style="margin:0 0 24px;">Tap the button below to confirm it’s you and keep your progress safe.</p>',
      ctaLabel: 'Verify email',
      ctaUrl: verifyUrl,
      linkIntro: "If the button doesn't work, copy this link instead:",
    });
    const text = `Verify your email\n\nOpen this link on the device with WordQuest installed:\n${verifyUrl}`;
    await this.send(to, 'Verify your WordQuest email', html, text);
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `wordquest://reset-password?token=${encodeURIComponent(token)}`;
    const html = this.layout({
      preheader: 'Reset your WordQuest password.',
      heading: 'Reset your password',
      bodyHtml:
        '<p style="margin:0 0 24px;">Tap the button below to choose a new password. If you didn’t request this, you can safely ignore this email.</p>',
      ctaLabel: 'Reset password',
      ctaUrl: resetUrl,
      linkIntro: "If the button doesn't work, copy this link instead:",
    });
    const text = `Reset your password\n\nOpen this link on the device with WordQuest installed:\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`;
    await this.send(to, 'Reset your WordQuest password', html, text);
  }

  /**
   * Shared branded wrapper for every transactional email — a single
   * centered card in the mobile app's "living manuscript" palette
   * (parchment background, ink-purple text, an arcane-purple CTA
   * button), table-based for compatibility with clients (Outlook chief
   * among them) that ignore div/CSS layout, with everything styled
   * inline since <style> blocks are stripped or unreliable across mail
   * clients. Includes a hidden preheader (the preview snippet clients
   * show next to the subject line) and a visible fallback link under
   * the button for clients/screen readers that don't render it as a
   * button.
   */
  private layout(opts: {
    preheader: string;
    heading: string;
    bodyHtml: string;
    ctaLabel: string;
    ctaUrl: string;
    linkIntro: string;
  }): string {
    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${BRAND.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none;font-size:1px;color:${BRAND.background};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${opts.preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.background};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;color:${BRAND.glyph};text-transform:uppercase;">WordQuest</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${BRAND.ink};">${opts.heading}</h1>
                <div style="font-size:15px;line-height:1.6;color:${BRAND.ink};">${opts.bodyHtml}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background:${BRAND.arcane};">
                      <a href="${opts.ctaUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:${BRAND.arcaneInk};text-decoration:none;">${opts.ctaLabel}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;border-top:1px solid ${BRAND.border};">
                <div style="padding-top:20px;font-size:12px;line-height:1.6;color:${BRAND.inkMuted};">
                  <p style="margin:0 0 4px;">${opts.linkIntro}</p>
                  <a href="${opts.ctaUrl}" style="color:${BRAND.arcane};word-break:break-all;">${opts.ctaUrl}</a>
                  <p style="margin:16px 0 0;">Open this on the device with WordQuest installed.</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private async send(to: string, subject: string, html: string, text?: string): Promise<void> {
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
      body: JSON.stringify({
        from: `WordQuest <${this.config.emailFromAddress}>`,
        to,
        subject,
        html,
        ...(text ? { text } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Email send failed (${response.status}): ${await response.text()}`);
    }
  }
}
