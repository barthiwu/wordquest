# Over-the-air updates (EAS Update)

Before this was added, an installed WordQuest never changed until the player
installed a new build. With `expo-updates` a JavaScript-only change (screens,
copy, styles, game logic, translations) can be sent to installed apps with one
command. The app checks for an update on launch, downloads it in the
background, and runs it the next time it is opened.

## What can and cannot go over the air

Over the air (no rebuild): anything under `mobile/src`, translation files,
images imported by the JS, and fixes to JS logic.

Needs a new store build: a new or upgraded native package, any change to
`app.json` that affects native code (permissions, plugins, `infoPlist`, icons,
splash, bundle id), the Expo SDK, or `ios/` / `android/` settings.

## The rule that keeps this safe

`runtimeVersion` uses the `appVersion` policy, so it is the `version` field in
`mobile/app.json`. An update is only delivered to builds with the same
runtime version. **Whenever you make a native change, bump `version` in
`app.json` (e.g. 0.2.0 -> 0.3.0) and make a new store build.** If you ship a JS
update that expects native code an installed build does not have, the app can
crash on launch. Bumping `version` stops that, because older builds simply do
not receive the update.

## Channels

Each build profile in `mobile/eas.json` is tied to a channel of the same name
(`development`, `preview`, `production`). An update published to a channel only
reaches builds made from that profile.

## One-time step (needed once per platform)

Apps built before this change do not contain the update code. Make one new
build per platform and install it; from then on, updates arrive over the air:

    cd mobile
    npm install                       # installs expo-updates
    npm run build:preview             # Android test build (APK)
    npx eas build --platform ios --profile production

## Publishing an update

    cd mobile
    npm run update:preview            # reaches preview builds
    npm run update:production         # reaches store builds (same version)

`eas update` asks for a short message describing the change. Check it with
`npx eas update:list`; roll back by republishing the previous version of the
code (or `npx eas update:republish`).

## Notes

- Updates are checked at launch; a player sees the new version the second time
  they open the app.
- Updates are not available on the web build (GitHub Pages), which is
  redeployed instead.
- Backend changes are unaffected; they deploy through Railway as before.
