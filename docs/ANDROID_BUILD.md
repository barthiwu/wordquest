# Android Build & Release

Companion to `docs/DEPLOYMENT.md`, which covers the backend. This covers
getting the WordQuest mobile app built for real Android devices outside of
`expo run:android`, and eventually into the Play Store.

None of this has been exercised against a live Expo/EAS or Google Play
account — this sandbox can't create either on your behalf, the same
constraint `docs/DEPLOYMENT.md` notes for Railway. What HAS been done here,
as real files in the repo rather than just instructions: `mobile/eas.json`
(build profiles), `eas-cli` added as a devDependency, `npm run build:*` /
`submit:production` scripts in `mobile/package.json`, and a Play
Store–sized app icon at `store-assets/android/play-store-icon-512.png`.
Everything below needs your own accounts and one-time setup, same shape as
the Railway section in `docs/DEPLOYMENT.md`.

## Bundle identifier: resolved, `com.wordquest.app` on both platforms

Decided 2026-09-25: `com.wordquest.app` everywhere — iOS `bundleIdentifier`
and Android `package` in `mobile/app.json` both match now, along with the
already-generated native iOS project (`mobile/ios/WordQuest/Info.plist` and
`WordQuest.xcodeproj/project.pbxproj`'s `PRODUCT_BUNDLE_IDENTIFIER`, both
updated to match rather than left to drift until a `prebuild --clean`).
This is effectively permanent once submitted to either store, so this is
now the identity both TestFlight and Play Console builds should use.

## What's already in place

- `mobile/eas.json` — three build profiles: `development` (dev-client APK,
  internal distribution), `preview` (plain APK, internal, for testing
  outside Expo Go), `production` (Android App Bundle, auto-incrementing
  `versionCode`, for the Play Store)
- `eas-cli` pinned as a devDependency, with `npm run build:dev` /
  `build:preview` / `build:production` / `submit:production` scripts in
  `mobile/package.json` resolving to it
- `store-assets/android/play-store-icon-512.png` — the 512×512 hi-res
  icon Play Console's store listing requires, generated from the existing
  app icon (`mobile/assets/icon.png`)
- The app already reads `EXPO_PUBLIC_API_URL` at build time
  (`mobile/src/app/config/env.ts`), falling back to `localhost` — so the
  `preview`/`production` profiles in `eas.json` can bake in the right
  backend URL per build once you fill in the two placeholder URLs there
  (see `docs/DEPLOYMENT.md` for standing up the Railway environments
  those URLs point at)

## One-time setup checklist

1. **Create an Expo account** (expo.dev) if you don't have one, then from
   `mobile/`: `npx eas login`.
2. **Link this project to an EAS project**: `npx eas init` — registers a
   project on expo.dev and writes `extra.eas.projectId` into
   `mobile/app.json` for you. This is also what push notifications need
   (`pushNotifications.ts` already anticipates it being unset today).
   Commit the resulting `app.json` change.
3. **Resolve the bundle identifier decision above**, if you're changing
   it, before your first build.
4. **Fill in the real backend URLs** in `mobile/eas.json`
   (`build.preview.env.EXPO_PUBLIC_API_URL`,
   `build.production.env.EXPO_PUBLIC_API_URL`) once the corresponding
   Railway environment exists.
5. **First build**: `npm run build:preview` from `mobile/` — builds an
   installable APK on Expo's cloud infrastructure, no local Android SDK
   needed. EAS will offer to generate and store an Android signing
   keystore for you on first build ("Let Expo handle it" — recommended);
   it's stored encrypted on your Expo account and reused automatically for
   every later build. `eas credentials` lets you view/rotate/export it. If
   you ever choose to manage your own keystore instead, back it up
   somewhere durable — losing it means you can never update the app again
   under the same package name.
6. **Test the preview build** on a real device (EAS gives you a download
   link/QR code) before going further.
7. **Create a Google Play Console developer account** at
   play.google.com/console — one-time $25 registration fee, identity
   verification that can take a day or two the first time, separate from
   your Expo account.
8. **Create the app listing**: app name, short/full description, category,
   contact email (bartholomewiwuoha@gmail.com), and upload
   `store-assets/android/play-store-icon-512.png` as the app icon. You'll
   also need a **feature graphic** (1024×500) and at least 2 phone
   screenshots — Play Console won't send a listing to review without
   them, and neither exists yet; they're marketing/design assets rather
   than something this checklist can generate for you.
9. **Privacy policy URL**: Play Console requires a public URL, not a
   document. `docs/PRIVACY_POLICY.md` and the in-app screen both exist,
   but neither is hosted at a URL yet — enabling GitHub Pages on this repo
   (Settings → Pages) to serve `docs/PRIVACY_POLICY.md`, or any static
   host, resolves this in a couple of minutes.
10. **Data safety form**: Play Console's questionnaire on what data the
    app collects and why — answer it straight from the "Information we
    collect" and "Third parties we work with" sections of
    `docs/PRIVACY_POLICY.md`, which already enumerates every category
    (account info, gameplay data, photos, and Anthropic/Resend/Expo/R2/
    Railway/Sentry as processors).
11. **Target audience and content**: WordQuest's own minimum age is 13,
    enforced server-side (see the age gate work) — answer Play's target
    age group as 13+ and its children's-content question as "not designed
    for children," which keeps the extra Play Families policies from
    applying.
12. **Content rating questionnaire** (standard IARC form inside Play
    Console): answer from actual app content — no violence, user
    -generated content limited to text/photo evidence submissions that
    already go through the reporting and moderation-queue flow built this
    session.
13. **Internal testing track first**: upload the production `.aab`
    (`npm run build:production`, then `npm run submit:production` or a
    manual upload) to Play Console's Internal Testing track before
    Production — lets you and a few testers install it via a private link
    while the store listing is still being finished, with review typically
    taking minutes rather than days.
14. **Submit to Production** once internal testing looks good. The
    first-ever review tends to be the slowest (hours to a few days);
    updates after that are usually faster.

## Versioning

`eas.json`'s production profile sets `autoIncrement: true` alongside
`cli.appVersionSource: "remote"` — EAS tracks and bumps the Android
`versionCode` for you on every production build, so you don't hand-edit
that per release. `mobile/app.json`'s `version` field (currently `0.1.0`,
semver) is the user-facing version string shown in the store listing and
is still yours to bump by hand when you want it to change.

## iOS, briefly

Out of scope here since Android was what was asked for, but worth noting
since it shares the same EAS project: `mobile/app.json` already has an iOS
`bundleIdentifier` set, and the `eas init` step above covers both
platforms at once. An iOS build additionally needs an active Apple
Developer Program membership ($99/year), and — like the Android keystore
— EAS can generate and manage the iOS signing credentials (certificate +
provisioning profile) for you on first `eas build --platform ios`.

## What CI does not do yet

`.github/workflows/ci.yml`'s `mobile` job only lints, typechecks, and
tests — it does not build or submit anything, deliberately: an automated
EAS build/submit step needs an `EXPO_TOKEN` (or a build-profile-scoped
robot token) GitHub secret, which doesn't exist until steps 1–2 above are
done. Once it does, a `workflow_dispatch` job calling
`eas build --non-interactive` / `eas submit --non-interactive` can be
added the same way `deploy.yml` handles the backend — not built here since
there's nothing for it to authenticate against yet.
