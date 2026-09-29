import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';

export interface DobPickerProps {
  /** Native Date object, UTC midnight — null means "nothing picked yet". */
  value: Date | null;
  onChange: (date: Date) => void;
  placeholder: string;
  doneLabel: string;
  accessibilityLabel: string;
  colors: ThemeColors;
  /** Unused natively -- only the web variant's browser-native popover
   * needs a light/dark hint. Declared here purely so both platform
   * files share one prop shape and RegistrationScreen's call site
   * typechecks against either. */
  mode: 'light' | 'dark';
  minimumDate: Date;
  maximumDate: Date;
}

/**
 * Native (iOS/Android) date-of-birth picker — a tappable field that
 * opens the OS's own calendar UI, replacing the old three-box MM/DD/YYYY
 * free-text row (Barth: "let the date of birth section have the ability
 * to pull up the calendar so you just pick everything directly").
 *
 * `@react-native-community/datetimepicker` has no web implementation at
 * all (its generic JS fallback literally renders null + a console
 * warning — confirmed by reading the package source, not assumed), so
 * this file is native-only. `DobPicker.web.tsx` is the real web
 * implementation, backed by a plain `<input type="date">` (the
 * browser's own native calendar widget) — Metro picks whichever file
 * matches the target platform automatically, so RegistrationScreen just
 * imports `DobPicker` and never has to branch on Platform.OS itself.
 */
export function DobPicker({
  value,
  onChange,
  placeholder,
  doneLabel,
  accessibilityLabel,
  colors,
  minimumDate,
  maximumDate,
}: DobPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const styles = createStyles(colors);

  const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    // Android's picker is a one-shot modal dialog -- it always needs
    // closing here. iOS's inline calendar stays open until the
    // "Done" button below is pressed, so a player can glance at
    // neighboring dates before committing.
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) onChange(selectedDate);
  };

  return (
    <View>
      <Pressable
        style={styles.field}
        onPress={() => setShowPicker(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? formatDob(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={colors.inkMuted} />
      </Pressable>

      {showPicker && (
        <DateTimePicker
          value={value ?? defaultAnchorDate(maximumDate)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={handleChange}
          style={styles.inlinePicker}
        />
      )}

      {Platform.OS === 'ios' && showPicker && (
        <Pressable
          style={styles.doneButton}
          onPress={() => setShowPicker(false)}
          accessibilityRole="button"
          accessibilityLabel={doneLabel}
        >
          <Text style={styles.doneButtonText}>{doneLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Opens the calendar on a plausible birth year (18 years back) rather than today's date, which would sit right on the age-gate boundary. */
function defaultAnchorDate(maximumDate: Date): Date {
  const anchor = new Date(maximumDate);
  anchor.setUTCFullYear(anchor.getUTCFullYear() - 18);
  return anchor;
}

function formatDob(date: Date): string {
  return date.toLocaleDateString();
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    placeholderText: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
    },
    valueText: {
      color: colors.ink,
      fontSize: typography.scale.md,
    },
    inlinePicker: {
      alignSelf: 'stretch',
    },
    doneButton: {
      alignSelf: 'flex-end',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    doneButtonText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.sm,
      fontWeight: '700',
    },
  });
}
