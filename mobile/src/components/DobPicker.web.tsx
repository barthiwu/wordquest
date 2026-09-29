import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';

export interface DobPickerProps {
  /** Native Date object, UTC midnight — null means "nothing picked yet". */
  value: Date | null;
  onChange: (date: Date) => void;
  /** Unused on web -- a native <input type="date"> shows the browser/OS's
   * own calendar placeholder, never this string. Kept so the prop shape
   * matches the native DobPicker exactly and RegistrationScreen never
   * has to know which file actually got bundled. */
  placeholder: string;
  /** Unused on web -- there's no separate "Done" step, the browser's own
   * date-picker popover closes itself on selection. Same reasoning. */
  doneLabel: string;
  accessibilityLabel: string;
  colors: ThemeColors;
  /** Drives the native browser date-picker popover's own light/dark styling. */
  mode: 'light' | 'dark';
  minimumDate: Date;
  maximumDate: Date;
}

function toInputValue(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromInputValue(raw: string): Date | null {
  if (!raw) return null;
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Web date-of-birth picker. `@react-native-community/datetimepicker`
 * has no web implementation (see the native DobPicker.tsx's doc comment
 * for how that was confirmed), so this is a plain `<input type="date">`
 * instead -- the browser's own native calendar widget, styled to sit
 * inside the same field chrome as every other input on this screen.
 * Metro/Expo picks this file over DobPicker.tsx automatically when
 * bundling for web; RegistrationScreen just imports `DobPicker` either
 * way and never branches on Platform.OS itself.
 */
export function DobPicker({
  value,
  onChange,
  accessibilityLabel,
  colors,
  mode,
  minimumDate,
  maximumDate,
}: DobPickerProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.field}>
      <input
        type="date"
        aria-label={accessibilityLabel}
        value={value ? toInputValue(value) : ''}
        min={toInputValue(minimumDate)}
        max={toInputValue(maximumDate)}
        onChange={(event) => {
          const parsed = fromInputValue(event.target.value);
          if (parsed) onChange(parsed);
        }}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: colors.ink,
          fontSize: typography.scale.md,
          fontFamily: 'inherit',
          colorScheme: mode,
        }}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    field: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
  });
}
