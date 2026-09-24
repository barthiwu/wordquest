# WordQuest Age Restriction

**Last updated:** September 24, 2026

WordQuest requires every player to be at least **13 years old**. This page explains why, and how it's enforced. It's a focused excerpt of what's already covered in the Privacy Policy's "Who can use WordQuest" section and the Terms of Service's "Eligibility" section.

## Minimum age: 13

You must be at least 13 years old to create or hold a WordQuest account. This applies everywhere WordQuest is used, regardless of country.

## Why

This limit exists to comply with the U.S. Children's Online Privacy Protection Act (COPPA), which restricts collecting personal information from children under 13 without verified parental consent. Rather than build and maintain a parental-consent flow, WordQuest simply doesn't offer accounts to anyone under 13.

## How it's enforced

- Registration asks for your date of birth and calculates your age from it.
- The server rejects account creation if you're under the minimum age (`AuthService.register`, backed by `backend/src/common/age.ts`'s `gameplayRules.auth.minimumAgeYears`) — this is enforced on the backend, not just the app's screen, so it can't be bypassed by skipping a client-side check.
- Date of birth is used only for this check; see the Privacy Policy for what else we do and don't do with it.

## If an underage account is found

If we learn that an account belongs to someone under 13, we delete that account and the data associated with it. If you believe a child under 13 has created a WordQuest account, email us and we'll investigate and remove it.

## Contact

Questions about this policy: **bartholomewiwuoha@gmail.com**

---

*The in-app copy for this document (Settings → About → Age Restriction) pulls its minimum-age figure directly from `mobile/src/utils/age.ts`'s `MINIMUM_AGE_YEARS`, so the two can't silently drift apart. If that constant ever changes, update this file's wording to match.*
