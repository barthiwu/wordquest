import { PRIVACY_POLICY_CONTACT_EMAIL } from './privacyPolicy';
import type { LegalDocSection } from '@/components/LegalDocScreen';

/**
 * "How to delete your data" — the public page Facebook (and anyone else)
 * can be pointed at. Reachable without signing in at /data-deletion.
 */
export const DATA_DELETION_LAST_UPDATED = 'October 5, 2026';

export const DATA_DELETION_INTRO =
  'You can delete your WordQuest account and data at any time. This page explains how, including for accounts created with Google, Apple, or Facebook.';

export const DATA_DELETION_SECTIONS: LegalDocSection[] = [
  {
    heading: 'Delete your account in the app',
    body: [
      'Open WordQuest and sign in',
      'Go to Settings, then Delete account, and confirm',
      'Your account is deactivated immediately. For a period afterwards you can recover it if you change your mind; after that it no longer functions as a live account',
    ],
  },
  {
    heading: 'Ask for permanent, complete erasure',
    body: `To have all of your data permanently erased rather than soft-deleted, email ${PRIVACY_POLICY_CONTACT_EMAIL} from the address on your account, with the subject "Delete my WordQuest data". If you signed in with Facebook, include the name on your Facebook profile so we can find the account. We will confirm once it is done.`,
  },
  {
    heading: 'If you signed in with Facebook, Google, or Apple',
    body: [
      'Facebook: open Settings and privacy, then Settings, then Apps and websites, find WordQuest, and choose Remove. This stops Facebook sharing data with WordQuest; it does not by itself delete your WordQuest account, so also use one of the options above',
      'Google: open your Google Account, Security, Your connections to third-party apps and services, find WordQuest, and choose Delete all connections',
      'Apple: open Settings, your name, Sign in with Apple, find WordQuest, and choose Stop Using Apple ID',
    ],
  },
  {
    heading: 'What gets deleted',
    body: 'Your profile, progress, word mastery, quest history, friends, and any Word in the Wild photos and text you submitted.',
  },
];
