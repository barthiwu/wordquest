# WordQuest Mobile

Expo + React Native + TypeScript. See `../docs/BUILD_HANDOFF.md` for the full
product/technical context.

## Local development

```bash
cp .env.example .env
npm install
npx expo start
```

Requires the backend running locally (`../backend`) for the Home screen's
connectivity check to succeed — see its README.

## Layout

```
src/
├── app/
│   ├── navigation/       # RootNavigator — one stack entry per screen
│   ├── providers/        # AppProviders — react-query, safe-area, (later) auth
│   └── config/           # env.ts — the only place that reads runtime config
├── features/             # one folder per Screen-Bible feature area
├── services/             # apiClient.ts + typed calls — the only network boundary
├── constants/theme.ts    # design-system foundation tokens
└── types/
```

Placeholder icon/splash assets in `assets/` are generated marks, not final
brand assets — swap them out during the World phase.

## Screens implemented so far

Splash → Welcome → Home (connectivity check only). Everything past that
(Registration, Onboarding, Clan Selection, Daily Quest, ...) lands with the
Identity and Learning phases per the build order.
