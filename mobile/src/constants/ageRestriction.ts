import type { LegalDocSection } from '@/components/LegalDocScreen';
import { MINIMUM_AGE_YEARS } from '@/utils/age';

/**
 * Age Restriction content shown in-app (Settings > About > Age
 * Restriction). A focused excerpt of what's already covered in the
 * Privacy Policy's "Who can use WordQuest" section and Terms of
 * Service's "Eligibility" section — this screen exists so the age
 * policy has its own findable place rather than requiring a player to
 * read the full Privacy Policy to learn it. MINIMUM_AGE_YEARS comes
 * from utils/age.ts, the same client-side mirror of the backend's
 * COPPA gate that RegistrationScreen checks against, so this text can
 * never drift out of sync with the actual enforced age.
 */
export const AGE_RESTRICTION_LAST_UPDATED = 'September 24, 2026';

export const AGE_RESTRICTION_CONTACT_EMAIL = 'bartholomewiwuoha@gmail.com';

export const AGE_RESTRICTION_INTRO = `WordQuest requires every player to be at least ${MINIMUM_AGE_YEARS} years old. This page explains why, and how it's enforced.`;

export const AGE_RESTRICTION_SECTIONS: LegalDocSection[] = [
  {
    heading: `Minimum age: ${MINIMUM_AGE_YEARS}`,
    body: `You must be at least ${MINIMUM_AGE_YEARS} years old to create or hold a WordQuest account. This applies everywhere WordQuest is used, regardless of country.`,
  },
  {
    heading: 'Why',
    body: `This limit exists to comply with the U.S. Children's Online Privacy Protection Act (COPPA), which restricts collecting personal information from children under 13 without verified parental consent. Rather than build and maintain a parental-consent flow, WordQuest simply doesn't offer accounts to anyone under ${MINIMUM_AGE_YEARS}.`,
  },
  {
    heading: 'How it’s enforced',
    body: [
      'Registration asks for your date of birth and calculates your age from it',
      "The server rejects account creation if you're under the minimum age — this is enforced on our backend, not just the app's screen, so it can't be bypassed by skipping a client-side check",
      "Date of birth is used only for this check; see the Privacy Policy for what else we do and don't do with it",
    ],
  },
  {
    heading: 'If an underage account is found',
    body: `If we learn that an account belongs to someone under ${MINIMUM_AGE_YEARS}, we delete that account and the data associated with it. If you believe a child under ${MINIMUM_AGE_YEARS} has created a WordQuest account, email us and we'll investigate and remove it.`,
  },
  {
    heading: 'Contact',
    body: `Questions about this policy: ${AGE_RESTRICTION_CONTACT_EMAIL}`,
  },
];
