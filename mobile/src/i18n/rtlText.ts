import { LANGUAGES } from '@/constants/languages';

/**
 * WordQuest's RTL languages (Arabic, Farsi) get right-to-left SCRIPT
 * rendering for their own wording, but the app's UI LAYOUT stays
 * left-to-right for every language, by product decision (Sept 2026) --
 * icon positions, row direction, navigation chrome, and everything else
 * driven by flexDirection never mirrors, regardless of the selected
 * language. This is a deliberate departure from the platform-default
 * "RTL language -> mirror the whole UI" behavior. This file replaces
 * the previous rtl.ts, which drove I18nManager.forceRTL -- that's gone
 * entirely now, along with the native-reload requirement it needed
 * (reloadAppForDirectionChange/expo-updates): every language switch,
 * including crossing into/out of Arabic or Farsi, now applies
 * instantly on i18next's own re-render, exactly like any other
 * language change. There is no more "restart needed" prompt.
 *
 * What still needs RTL-aware handling, then, is narrower: the TEXT
 * itself. Arabic/Farsi script already displays in correct
 * character/glyph order automatically -- React Native's Text applies
 * the Unicode Bidirectional Algorithm regardless of layout direction.
 * What doesn't happen automatically is paragraph-level alignment/flow,
 * which defaults to left-aligned inside an LTR container. Use
 * rtlTextStyle() below on a Text node rendering a longer chunk of
 * translated copy (a multi-line subtitle, a body paragraph) so it
 * reads right-aligned the way an Arabic/Farsi reader expects, while the
 * row/button/icon it sits inside keeps its LTR position:
 *
 *   <Text style={[styles.subtitle, rtlTextStyle(languageCode)]}>...
 *
 * Short chrome (a button label, a single-line title) can usually skip
 * this -- the Unicode bidi algorithm alone reads fine for short runs,
 * and matching alignment to the surrounding LTR chrome often looks more
 * consistent for e.g. a centered title. Applying this to every Text
 * node across all 45+ screens is a mechanical follow-up pass, not done
 * everywhere yet as of this revision -- flagged in the rollout doc
 * rather than silently left incomplete.
 */
export function isRtlLanguageCode(code: string): boolean {
  return LANGUAGES.find((l) => l.code === code)?.isRtl ?? false;
}

type RtlTextStyle = { writingDirection: 'rtl'; textAlign: 'right' };

/**
 * Style props for a Text node that should read right-to-left when the
 * given language's script is RTL. Returns an empty object (safe to
 * spread, changes nothing) for every LTR language.
 */
export function rtlTextStyle(code: string): RtlTextStyle | Record<string, never> {
  if (!isRtlLanguageCode(code)) return {};
  return { writingDirection: 'rtl', textAlign: 'right' };
}
