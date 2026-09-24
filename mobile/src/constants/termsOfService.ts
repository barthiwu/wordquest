import type { LegalDocSection } from '@/components/LegalDocScreen';

/**
 * Terms of Service content shown in-app (Settings > About > Terms of
 * Service). Kept in sync by hand with docs/TERMS_OF_SERVICE.md at the
 * repo root, the same pairing as privacyPolicy.ts / PRIVACY_POLICY.md.
 */
export const TERMS_OF_SERVICE_LAST_UPDATED = 'September 24, 2026';

export const TERMS_OF_SERVICE_CONTACT_EMAIL = 'bartholomewiwuoha@gmail.com';

export const TERMS_OF_SERVICE_INTRO =
  'These Terms of Service govern your use of WordQuest, a language-learning app. By creating an account or using WordQuest, you agree to these terms. WordQuest is currently developed and operated by an independent developer, not a registered company — questions or concerns go to ' +
  TERMS_OF_SERVICE_CONTACT_EMAIL +
  '.';

export const TERMS_OF_SERVICE_SECTIONS: LegalDocSection[] = [
  {
    heading: 'Eligibility',
    body: 'You must be at least 13 years old to create a WordQuest account, as described in Age Restriction and the Privacy Policy. By registering, you confirm the date of birth you provide is accurate.',
  },
  {
    heading: 'Your account',
    body: [
      "You're responsible for keeping your password confidential and for activity that happens under your account",
      'Tell us right away if you suspect unauthorized access — email support (below)',
      'One account per person; accounts are not transferable',
    ],
  },
  {
    heading: 'Acceptable use',
    body: [
      "Don't harass, bully, or impersonate other players",
      "Don't submit false or misleading Word in the Wild evidence",
      "Don't attempt to cheat progression, leaderboards, or Boss Battles (exploiting bugs, automation/bots, multiple accounts to inflate rank)",
      "Don't upload content you don't have the right to share, or content that's illegal, hateful, or sexually explicit",
      'Reported content and accounts are reviewed through our moderation process, and violations can lead to content removal, warnings, or account suspension/termination',
    ],
  },
  {
    heading: 'Your content',
    body: "You keep ownership of what you submit (Word in the Wild photos/text, writing exercises). By submitting it, you give WordQuest the limited right to store it, display it back to you, and send it to our evaluation provider (Anthropic's Claude API — see Privacy Policy) so it can be assessed. We don't sell your content or use it to train third-party models beyond what's needed for that evaluation.",
  },
  {
    heading: 'WordQuest’s content',
    body: "The app itself — its design, code, lessons, quest content, and the WordQuest/ALI names and marks — belongs to WordQuest and is protected by copyright and other intellectual property law. You're granted a personal, non-transferable license to use the app for your own language learning; you may not copy, redistribute, or build a competing product from it.",
  },
  {
    heading: 'Glyphs and virtual items',
    body: 'Glyphs are an in-app currency earned through gameplay. WordQuest does not currently sell Glyphs or any item for real money. Glyphs have no cash value, cannot be exchanged for real currency, and may be adjusted or reset if needed to keep the game fair (e.g. to correct an exploit). If real-money purchases are introduced later, these terms will be updated first.',
  },
  {
    heading: 'Disclaimers',
    body: "WordQuest is provided “as is.” We work to keep it accurate and available, but we don't guarantee the app will be uninterrupted, error-free, or that AI-evaluated feedback (Word in the Wild, writing exercises) will always be perfectly accurate — it's a learning aid, not a certified language assessment.",
  },
  {
    heading: 'Limitation of liability',
    body: "To the fullest extent permitted by law, WordQuest and its developer aren't liable for indirect, incidental, or consequential damages arising from your use of the app. Nothing here limits liability where the law doesn't allow it to be limited.",
  },
  {
    heading: 'Suspension and termination',
    body: 'We may suspend or terminate an account that violates these terms, including after a moderation report. You can delete your own account at any time from Settings → About → Delete Account, as described in the Privacy Policy.',
  },
  {
    heading: 'Changes to these terms',
    body: 'If we make material changes, we’ll update the "Last updated" date above and, where the change is significant, let you know in the app.',
  },
  {
    heading: 'Contact',
    body: `Questions about these terms: ${TERMS_OF_SERVICE_CONTACT_EMAIL}`,
  },
];
