import { PropsWithChildren, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLanguageStore } from '@/state/languageStore';
import { useTipsStore } from '@/state/tipsStore';
import { useThemeStore } from '@/state/themeStore';
import { useAnalyticsQueueStore } from '@/state/analyticsQueueStore';
import { flushAnalyticsQueue } from '@/services/analyticsClient';
import { DEFAULT_LANGUAGE_CODE } from '@/constants/languages';
import i18n, { initI18n } from '@/i18n';

// Boots i18next once, at module load, with the default language --
// synchronous and side-effect-free from the component's point of view,
// so children can render immediately (same non-blocking philosophy as
// themeStore's hydrate: never gate first paint on an AsyncStorage read).
// The effect below switches to the player's actual stored language, if
// different, once languageStore finishes hydrating.
initI18n(DEFAULT_LANGUAGE_CODE);

/**
 * Composition root for cross-cutting providers. Add auth/session context
 * here once the Auth module lands — deliberately minimal for now.
 *
 * Also where the player's stored language preference is applied to
 * i18next once languageStore hydrates (Sept 2026 UI-translation
 * rollout). No native RTL setup here anymore -- WordQuest's UI layout
 * intentionally never mirrors (see src/i18n/rtlText.ts) -- so this is
 * just an i18next language sync, nothing native-reload-sensitive.
 */
export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  const hydrateLanguage = useLanguageStore((s) => s.hydrate);
  const languageCode = useLanguageStore((s) => s.code);
  const languageHydrated = useLanguageStore((s) => s.isHydrated);
  const hydrateTips = useTipsStore((s) => s.hydrate);
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const hydrateAnalyticsQueue = useAnalyticsQueueStore((s) => s.hydrate);

  useEffect(() => {
    hydrateLanguage();
  }, [hydrateLanguage]);

  // FirstTimeTip's "seen" set (Sept 2026 mechanics-explainer follow-up) --
  // same fire-and-forget hydration as language above, never gating first
  // paint on it.
  useEffect(() => {
    hydrateTips();
  }, [hydrateTips]);

  // themeStore's light/dark preference (Sept 2026 bugfix: this hydrate
  // was defined from the start but never actually invoked anywhere, so
  // a returning player's chosen theme mode never survived an app
  // restart -- always fell back to the 'dark' default state until they
  // toggled again). Same fire-and-forget, non-blocking pattern as the
  // hydrations above.
  useEffect(() => {
    hydrateTheme();
  }, [hydrateTheme]);

  // Telemetry spec §24-25: rehydrate the local analytics queue (events
  // that never made it out before the app was last closed) and drain it
  // once — then keep draining on every foreground, since that's exactly
  // the moment a device that was offline is most likely to have
  // regained connectivity.
  useEffect(() => {
    hydrateAnalyticsQueue().then(() => {
      void flushAnalyticsQueue();
    });
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void flushAnalyticsQueue();
      }
    });
    return () => subscription.remove();
  }, [hydrateAnalyticsQueue]);

  useEffect(() => {
    if (!languageHydrated) return;
    if (i18n.language !== languageCode) {
      i18n.changeLanguage(languageCode);
    }
  }, [languageHydrated, languageCode]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}
