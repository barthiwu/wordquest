import { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type DimensionValue } from 'react-native';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';

export interface RevealedLetter {
  position: number;
  letter: string;
}

export interface LetterBoxInputProps {
  /** The player's typed characters ONLY, in order, over the editable
   * (non-revealed) positions -- not one entry per box. When `revealed`
   * is empty (the common case: Word Duel, Complete It) this is simply
   * the full typed answer, exactly as before. */
  value: string;
  onChangeText: (text: string) => void;
  /** How many boxes to render -- the target word's letter count (5
   * letters, 5 boxes, and so on). */
  length: number;
  colors: ThemeColors;
  onSubmitEditing?: () => void;
  editable?: boolean;
  autoFocus?: boolean;
  accessibilityLabel?: string;
  /** Hint-revealed letters, pre-filled and locked into their boxes.
   * These positions are excluded from typing -- `value` covers only
   * the remaining, still-editable positions. Defaults to none. */
  revealed?: RevealedLetter[];
}

/**
 * Renders the player's typed answer as one box per letter instead of a
 * single freeform text field -- Barth, Sept 2026: "make the answer box
 * be in singular box of the letters too. 5 letters be 5 boxes, and so
 * on." Shared across ScrambleQuest, Complete It, and Word Duel's
 * active-play screens (the three arcade games with a typed-answer
 * input), same reason CountdownRing is shared -- one visual language,
 * one place to tune it.
 *
 * A single real TextInput does the actual text entry (so paste,
 * autocapitalize/autocorrect settings, IME composition, and the
 * platform's own keyboard all keep working exactly as before) but is
 * rendered invisible and stretched over the box row; the boxes
 * themselves are a pure readout of `value` (plus any `revealed`
 * letters), non-interactive. This is the standard RN "PIN/OTP input"
 * pattern -- far more robust than coordinating focus across `length`
 * separate TextInputs.
 *
 * Box size flexes with `length` (via flexBasis, clamped between
 * minBoxSize/maxBoxSize) rather than a fixed pixel width, so a 3-letter
 * Complete It word and an 8+ letter one both fit the same screen width
 * without the row overflowing or wrapping.
 */
export function LetterBoxInput({
  value,
  onChangeText,
  length,
  colors,
  onSubmitEditing,
  editable = true,
  autoFocus = false,
  accessibilityLabel,
  revealed = [],
}: LetterBoxInputProps) {
  const inputRef = useRef<TextInput>(null);

  const revealedMap = new Map(revealed.map((r) => [r.position, r.letter.toUpperCase()]));
  const editablePositions = Array.from({ length }, (_, i) => i).filter((i) => !revealedMap.has(i));

  const letters = Array.from({ length }, (_, i) => {
    const revealedLetter = revealedMap.get(i);
    if (revealedLetter) return revealedLetter;
    const editableIndex = editablePositions.indexOf(i);
    return value[editableIndex]?.toUpperCase() ?? '';
  });

  const activeEditableIndex = Math.min(value.length, Math.max(editablePositions.length - 1, 0));
  const activeIndex = editablePositions[activeEditableIndex];

  // RN's DimensionValue only accepts a `${number}%` template-literal type
  // for percentage strings, not a plain runtime-computed `string` -- this
  // value genuinely is always a percentage, so the cast is safe.
  const boxBasis = `${100 / Math.max(length, 1)}%` as DimensionValue;

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessibilityRole="none"
      style={styles.wrapper}
    >
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={(text) =>
          onChangeText(text.replace(/[^a-zA-Z]/g, '').slice(0, editablePositions.length))
        }
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        editable={editable}
        maxLength={editablePositions.length}
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={accessibilityLabel}
        caretHidden
      />
      <View style={styles.boxRow} pointerEvents="none">
        {letters.map((letter, i) => {
          const isRevealed = revealedMap.has(i);
          return (
            <View key={i} style={[styles.boxOuter, { flexBasis: boxBasis }]}>
              <View
                style={[
                  styles.box,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  letter ? { borderColor: colors.arcaneSoft } : null,
                  isRevealed
                    ? { backgroundColor: colors.surfaceRaised, borderColor: colors.glyph }
                    : null,
                  i === activeIndex && editable && !isRevealed
                    ? {
                        borderColor: colors.glyph,
                        shadowColor: colors.glyph,
                        shadowOpacity: 0.55,
                        shadowRadius: 6,
                        shadowOffset: { width: 0, height: 0 },
                        elevation: 3,
                      }
                    : null,
                ]}
              >
                <Text style={[styles.letter, { color: isRevealed ? colors.glyph : colors.ink }]}>
                  {letter}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  boxRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
    justifyContent: 'center',
  },
  boxOuter: { paddingHorizontal: spacing.xs / 2, maxWidth: 52, minWidth: 30 },
  box: {
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontSize: typography.scale.lg,
    fontWeight: '700',
  },
});
