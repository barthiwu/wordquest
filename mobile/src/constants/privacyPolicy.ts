/**
 * Privacy policy content shown in-app (Settings > Privacy Policy, and
 * linked from Registration). Kept in sync by hand with
 * docs/PRIVACY_POLICY.md at the repo root — that file is the
 * canonical/legal copy; this is the same content structured for
 * PrivacyPolicyScreen's rendering (plain data, no markdown parser
 * dependency needed for a document this size).
 */
export const PRIVACY_POLICY_LAST_UPDATED = 'September 21, 2026';

export const PRIVACY_POLICY_CONTACT_EMAIL = 'bartholomewiwuoha@gmail.com';

export interface PrivacyPolicySection {
  heading: string;
  /** A paragraph, or a list of bullet lines. */
  body: string | string[];
}

export const PRIVACY_POLICY_INTRO =
  "WordQuest is a language-learning app. This policy explains what information WordQuest collects, why, and what choices you have about it. It's written in plain language rather than dense legal text — if anything here isn't clear, email us and we'll clarify or fix it.\n\nWordQuest is currently developed and operated by an independent developer, not a registered company. For all privacy questions, requests, or concerns, contact " +
  PRIVACY_POLICY_CONTACT_EMAIL +
  '.';

export const PRIVACY_POLICY_SECTIONS: PrivacyPolicySection[] = [
  {
    heading: 'Who can use WordQuest',
    body:
      "You must be at least 13 years old to create a WordQuest account. This is enforced at signup — we ask for your date of birth and reject registration if you're under 13, to comply with the U.S. Children's Online Privacy Protection Act (COPPA). WordQuest does not knowingly collect information from anyone under 13. If we learn that an account belongs to someone under 13, we will delete that account and its data. If you believe a child under 13 has created a WordQuest account, email us and we'll investigate and remove it.",
  },
  {
    heading: 'Account information you provide directly',
    body: [
      'Email address and password (your password is never stored in plain text)',
      'Display name',
      'Date of birth (used only to verify you meet the minimum age)',
      'Country (optional — shows your flag and powers country/continent leaderboards)',
      "Native language and the language you're learning",
    ],
  },
  {
    heading: 'Information generated as you use the app',
    body: [
      'Gameplay and learning progress: quiz answers, mastery scores, XP, streaks, achievements, Boss Battle results',
      'Word in the Wild submissions: text or photos you submit as evidence of using a word in the real world',
      'Clan membership, if you join one',
      'Device timezone (used to figure out your "day" for streaks and daily quests — never your precise location)',
      'Push notification token, if you enable notifications',
      'Basic security/audit logs (login attempts, password resets)',
    ],
  },
  {
    heading: 'Information we do not collect',
    body: "WordQuest does not access your contacts, precise GPS location, or other apps on your device. We don't buy or sell personal information, and we don't use your data for third-party advertising.",
  },
  {
    heading: 'How we use your information',
    body: [
      'To run the app: authenticate you, save your progress, calculate mastery/XP/streaks, and show leaderboards',
      'To evaluate Word in the Wild submissions and writing exercises using AI',
      'To send account-related email (verification, password reset) and, if enabled, push notifications',
      'To keep the app secure (detecting suspicious logins, rate-limiting abuse)',
      'To understand how the app is used in aggregate, so we can improve it',
    ],
  },
  {
    heading: 'Analytics',
    body: "WordQuest logs basic usage events (e.g. account created, quest completed) to our own backend and database — not to a third-party analytics company. This data is used only to understand aggregate usage and improve the app; it's never sold or shared with advertisers.",
  },
  {
    heading: 'Third parties we work with',
    body: [
      'Anthropic (Claude API) — evaluates Word in the Wild evidence and writing exercises',
      'Resend — sends transactional email (verification, password reset)',
      'Expo — delivers push notifications, if enabled',
      'Cloudflare R2 / S3-compatible storage — stores Word in the Wild photo uploads',
      'Railway — hosts our backend and database',
      'Sentry (only where enabled) — receives error/crash reports, never your password or full submission content',
    ],
  },
  {
    heading: 'Data retention',
    body: "We keep your account data for as long as your account is active. Deleting your account (Settings) deactivates it immediately; email us if you want your data permanently and completely erased rather than soft-deleted.",
  },
  {
    heading: 'Your choices and rights',
    body: [
      'Access or export your data — email us',
      "Correct your data — most fields are editable in Settings; email us for the rest",
      'Delete your account — Settings > Delete Account, or email us for full erasure',
      'Delete a Word in the Wild submission — from within the app',
      "California residents (CCPA) — right to know, delete, and opt out of 'sale' (WordQuest doesn't sell personal information)",
      "Push notifications — disable any time in Settings or your device's notification settings",
    ],
  },
  {
    heading: 'Security',
    body: 'Passwords are hashed, never stored in plain text. Sessions use short-lived access tokens with longer-lived refresh tokens, and accounts lock temporarily after repeated failed logins.',
  },
  {
    heading: 'Changes to this policy',
    body: 'If we make material changes, we\'ll update the "Last updated" date and, where the change is significant, let you know in the app.',
  },
];
