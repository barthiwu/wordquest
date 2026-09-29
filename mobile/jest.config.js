module.exports = {
  preset: 'jest-expo',
  // Official mock (https://react-native-async-storage.github.io/async-
  // storage/docs/advanced/jest) — without it, any module that imports
  // @react-native-async-storage/async-storage at module load time
  // (every AsyncStorage-backed store: tipsStore, languageStore,
  // themeStore, analyticsQueueStore, ...) throws "NativeModule:
  // AsyncStorage is null" the instant Jest requires it, since there's
  // no native module to link in a Jest environment. Those stores had
  // no test coverage before now, so this gap was latent rather than a
  // regression — analyticsQueueStore.spec.ts is what surfaced it.
  // moduleNameMapper (not setupFiles) — this package needs to be
  // swapped for every `require`, not just pre-loaded once.
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
};
