import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import {
  guessHangmanLetter,
  requestHangmanHint,
  startHangman,
  type HangmanChallenge,
  type HangmanWordCompletion,
} from '@/services/hangman';
import { ApiError } from '@/services/apiClient';
import { isPlayLimitError } from '@/services/arcadePlays';
import { useArcadePlaysStore } from '@/state/arcadePlaysStore';
import { ArcadeLimitReached } from '@/components/ArcadeLimitReached';
import { trackEvent } from '@/services/analyticsClient';
import type { AliExpressionCue } from '@/services/aliExpression';
import { AliBubble } from '@/components/AliBubble';
import { AliDeferredRecap } from '@/components/AliDeferredRecap';
import { AliStreakPopout } from '@/components/AliStreakPopout';
import { ArcadeHeroResults } from '@/components/ArcadeHeroResults';
import { BackButton } from '@/components/BackButton';
import { HangmanFigure } from '@/components/HangmanFigure';
import { ProtoGameHeader } from '@/features/proto/ProtoGameHeader';
import { VersusBar } from '@/components/VersusBar';
import { VersusResultCard } from '@/components/VersusResultCard';

type Props = NativeStackScreenProps<RootStackParamList, 'Hangman'>;

type Phase = 'loading' | 'active' | 'busy' | 'wordDone' | 'complete' | 'error';

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/**
 * Hangman: guess the hidden word one letter at a time. Every wrong letter
 * adds a body part to the man; the sixth hangs him and the word is lost,
 * while finding every letter saves him. A run is a handful of words. The
 * server decides whether a letter is in the word (the word never reaches
 * this screen), so all this screen does is send a letter and draw what
 * comes back.
 */
export function HangmanScreen({ navigation, route }: Props) {
  const versusMatchId = route.params?.versusMatchId;
  // Set when this play is part of a Group Play round.
  const groupId = route.params?.groupId;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['hangman', 'arcade']);
  const { t: tp } = useTranslation('proto');
  const accessToken = useAuthStore((s) => s.accessToken);

  const [phase, setPhase] = useState<Phase>('loading');
  // Set when the server refuses the start because today's plays are used up.
  const [limitHit, setLimitHit] = useState(false);
  const [challenge, setChallenge] = useState<HangmanChallenge | null>(null);
  const [completion, setCompletion] = useState<HangmanWordCompletion | null>(null);
  const [showMeaning, setShowMeaning] = useState(false);
  const [showSynonyms, setShowSynonyms] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [aliBubble, setAliBubble] = useState<{
    id: number;
    message: string;
    expression: AliExpressionCue;
  } | null>(null);
  const aliBubbleCounter = useRef(0);
  const completedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (!completedRef.current) trackEvent('ARCADE_SESSION_ABANDONED', { game: 'HANGMAN' });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setPhase('loading');
    try {
      const view = await startHangman(accessToken, versusMatchId, groupId);
      useArcadePlaysStore.getState().applyNotice(view.playLimit);
      trackEvent('ARCADE_SESSION_STARTED', { game: 'HANGMAN' });
      completedRef.current = false;
      setChallenge(view);
      setCompletion(null);
      setShowMeaning(false);
      setShowSynonyms(false);
      setInlineError(null);
      setPhase('active');
    } catch (err) {
      if (isPlayLimitError(err)) {
        useArcadePlaysStore.getState().markLocked('HANGMAN');
        setLimitHit(true);
      }
      setPhase('error');
    }
  }, [accessToken, versusMatchId, groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGuess = useCallback(
    async (letter: string) => {
      if (!accessToken || !challenge || phase !== 'active') return;
      if (challenge.guessedLetters.includes(letter)) return;
      setPhase('busy');
      setInlineError(null);
      try {
        const result = await guessHangmanLetter(accessToken, challenge.sessionId, letter);
        trackEvent('ARCADE_ANSWER_SUBMITTED', {
          game: 'HANGMAN',
          isCorrect: result.isHit,
          wordFinished: result.completion != null,
        });
        setChallenge(result.view);
        if (result.completion) {
          setCompletion(result.completion);
          if (result.completion.aliQuickReaction && result.completion.aliQuickExpression) {
            aliBubbleCounter.current += 1;
            setAliBubble({
              id: aliBubbleCounter.current,
              message: result.completion.aliQuickReaction,
              expression: result.completion.aliQuickExpression,
            });
          }
          setPhase('wordDone');
        } else {
          setPhase('active');
        }
      } catch (err) {
        trackEvent('GAMEPLAY_ERROR', {
          game: 'HANGMAN',
          step: 'guess',
          status: err instanceof ApiError ? err.status : undefined,
        });
        if (err instanceof ApiError && err.status === 409) {
          // Another request for this move got there first: re-sync from the server.
          await load();
          return;
        }
        setInlineError(t('guessFailed'));
        setPhase('active');
      }
    },
    [accessToken, challenge, phase, load, t],
  );

  const handleHint = async () => {
    if (!accessToken || !challenge || challenge.hintsRemaining <= 0 || phase !== 'active') return;
    setPhase('busy');
    setInlineError(null);
    try {
      const result = await requestHangmanHint(accessToken, challenge.sessionId);
      setChallenge(result.view);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await load();
        return;
      }
      setInlineError(t('hintFailed'));
    }
    setPhase('active');
  };

  const handleContinue = () => {
    if (!completion) return;
    if (completion.sessionComplete || !completion.nextChallenge) {
      completedRef.current = true;
      trackEvent('ARCADE_SESSION_COMPLETED', { game: 'HANGMAN' });
      // A head-to-head play counts toward the daily cap only once finished.
      useArcadePlaysStore.getState().applyNotice(completion.playLimit);
      setPhase('complete');
      return;
    }
    setChallenge(completion.nextChallenge);
    setCompletion(null);
    setShowMeaning(false);
    setShowSynonyms(false);
    setPhase('active');
  };

  // Physical keyboard (desktop web): a letter key guesses, Enter continues.
  const guessRef = useRef(handleGuess);
  guessRef.current = handleGuess;
  const continueRef = useRef(handleContinue);
  continueRef.current = handleContinue;
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) void guessRef.current(e.key.toLowerCase());
      else if (e.key === 'Enter') continueRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (phase === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  if (phase === 'error' && limitHit) {
    return <ArcadeLimitReached game="HANGMAN" onBack={() => navigation.goBack()} />;
  }

  if (phase === 'error') {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{t('genericError')}</Text>
        <Pressable
          style={styles.button}
          onPress={() => void load()}
          accessibilityRole="button"
          accessibilityLabel={t('retry')}
        >
          <Text style={styles.buttonText}>{t('retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'complete' && completion) {
    return (
      <ScrollView style={styles.flexFill} contentContainerStyle={styles.centeredScrollContent}>
        <ArcadeHeroResults
          colors={colors}
          title={t('sessionCompleteTitle')}
          subtitle={t('sessionSavedSummary', {
            saved: completion.correctCount,
            total: completion.wordsTotal,
          })}
          correctCount={completion.correctCount}
          totalCount={completion.wordsTotal}
          stats={[
            { icon: 'flash', text: t('sessionXpEarned', { xp: completion.totalXpAwarded }) },
            {
              icon: 'flame',
              text: t('sessionLongestStreak', { streak: completion.longestStreak }),
            },
          ]}
          primaryLabel={
            groupId
              ? t('arcade:group.play.backToGroup')
              : versusMatchId
                ? t('arcade:versus.result.rematch')
                : t('playAgain')
          }
          onPrimary={
            groupId
              ? () => navigation.replace('ArcadeGroup', { groupId })
              : versusMatchId
                ? () => navigation.replace('ArcadeVersus', { game: 'HANGMAN' })
                : load
          }
          secondaryLabel={t('arcade:backToPlay')}
          onSecondary={() => navigation.goBack()}
        />
        {versusMatchId ? <VersusResultCard matchId={versusMatchId} /> : null}
        {groupId ? <Text style={styles.groupNote}>{t('arcade:group.play.complete')}</Text> : null}
        <AliDeferredRecap
          reactions={completion.deferredAliReactions ?? []}
          colors={colors}
          style={styles.deferredRecap}
        />
      </ScrollView>
    );
  }

  if (!challenge) return null;

  const finished = phase === 'wordDone' && completion != null;
  const figureStatus = !finished ? 'playing' : completion.outcome === 'WON' ? 'won' : 'lost';
  const guessed = new Set(challenge.guessedLetters);
  const wrong = new Set(challenge.wrongLetters);
  const wordDisplay = (finished ? completion.correctAnswer : challenge.pattern)
    .toUpperCase()
    .split('');
  const livesLeft = challenge.maxWrong - challenge.wrongCount;

  return (
    <View style={styles.flexFill}>
      {aliBubble && (
        <AliBubble
          key={aliBubble.id}
          message={aliBubble.message}
          expression={aliBubble.expression}
          onDismiss={() => setAliBubble(null)}
        />
      )}
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.column}>
          <BackButton onPress={() => navigation.goBack()} />
          <ProtoGameHeader line={tp('gameHangman')} />
          {versusMatchId ? <VersusBar matchId={versusMatchId} /> : null}

          <View style={styles.headerRow}>
            <Text style={styles.progressLabel}>
              {t('progressLabel', {
                current: challenge.wordIndex + 1,
                total: challenge.wordsTotal,
              })}
            </Text>
            <AliStreakPopout
              pillStyle={styles.streakPill}
              textStyle={styles.streakPillText}
              label={`${t('streakLabel')} ${challenge.currentStreak}`}
              reaction={completion?.streakReaction ?? null}
              colors={colors}
            />
          </View>

          <View style={styles.stage}>
            <HangmanFigure
              colors={colors}
              wrongCount={challenge.wrongCount}
              status={figureStatus}
              size={190}
            />
            <View style={styles.stageSide}>
              <Text style={styles.livesLabel}>{t('mistakesLabel')}</Text>
              <Text
                style={[styles.livesValue, livesLeft <= 2 && { color: colors.danger }]}
                accessibilityLabel={t('mistakesAccessibility', {
                  used: challenge.wrongCount,
                  max: challenge.maxWrong,
                })}
              >
                {challenge.wrongCount} / {challenge.maxWrong}
              </Text>
              {challenge.wrongLetters.length > 0 && (
                <Text style={styles.wrongLetters}>
                  {challenge.wrongLetters.map((l) => l.toUpperCase()).join(' ')}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.wordRow} accessibilityLabel={t('wordPatternLabel')}>
            {wordDisplay.map((ch, i) => (
              <View
                key={i}
                style={[
                  styles.slot,
                  ch === '-' || ch === ' ' || ch === "'" ? styles.slotPlain : null,
                ]}
              >
                <Text
                  style={[
                    styles.slotText,
                    finished && completion.outcome === 'LOST' && challenge.pattern[i] === '_'
                      ? { color: colors.danger }
                      : null,
                  ]}
                >
                  {ch === '_' ? '' : ch}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.definitionText}>
            {t('hintFormat', { definition: challenge.definition })}
          </Text>
          {!finished && (
            <>
              <Pressable
                style={styles.synonymsButton}
                onPress={() => setShowSynonyms((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={t('synonymsButton')}
              >
                <Text style={styles.synonymsButtonText}>{t('synonymsButton')}</Text>
              </Pressable>
              {showSynonyms && challenge.synonyms.length > 0 && (
                <Text style={styles.synonymsText}>
                  {t('synonymsListLabel', { list: challenge.synonyms.join(', ') })}
                </Text>
              )}
            </>
          )}

          {!finished && (
            <>
              <View style={styles.keyboard}>
                {KEY_ROWS.map((row) => (
                  <View key={row} style={styles.keyRow}>
                    {row.split('').map((letter) => {
                      const used = guessed.has(letter);
                      const miss = wrong.has(letter);
                      return (
                        <Pressable
                          key={letter}
                          style={[
                            styles.key,
                            used &&
                              !miss && {
                                backgroundColor: colors.success,
                                borderColor: colors.success,
                              },
                            miss && {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                              opacity: 0.45,
                            },
                          ]}
                          onPress={() => void handleGuess(letter)}
                          disabled={used || phase !== 'active'}
                          accessibilityRole="button"
                          accessibilityLabel={letter.toUpperCase()}
                          accessibilityState={{ disabled: used || phase !== 'active' }}
                        >
                          <Text
                            style={[styles.keyText, used && !miss && { color: colors.background }]}
                          >
                            {letter.toUpperCase()}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>

              {inlineError && <Text style={styles.error}>{inlineError}</Text>}

              <Pressable
                style={[
                  styles.hintButton,
                  (challenge.hintsRemaining <= 0 || phase !== 'active') && styles.buttonDisabled,
                ]}
                onPress={() => void handleHint()}
                disabled={challenge.hintsRemaining <= 0 || phase !== 'active'}
                accessibilityRole="button"
                accessibilityLabel={t('hintButton')}
              >
                <Text style={styles.hintButtonText}>
                  {challenge.hintsRemaining > 0
                    ? `${t('hintButton')} (${t('hintsRemainingLabel', { count: challenge.hintsRemaining })})`
                    : t('noHintsRemaining')}
                </Text>
              </Pressable>
            </>
          )}

          {finished && (
            <View style={styles.feedbackBar}>
              <Text
                style={[
                  styles.feedbackText,
                  { color: completion.outcome === 'WON' ? colors.success : colors.danger },
                ]}
              >
                {completion.outcome === 'WON'
                  ? t('savedFeedback', { xp: completion.xpAwarded })
                  : t('hangedFeedback')}
              </Text>
              {completion.outcome === 'LOST' && (
                <Text style={styles.revealText}>
                  {t('revealPrefix')}{' '}
                  <Text style={styles.revealWord}>{completion.correctAnswer}</Text>
                </Text>
              )}
              <Pressable
                style={styles.meaningButton}
                onPress={() => setShowMeaning((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={t('meaningButton')}
              >
                <Text style={styles.meaningButtonText}>{t('meaningButton')}</Text>
              </Pressable>
              {showMeaning && (
                <View style={styles.meaningCard}>
                  <Text style={styles.meaningPartOfSpeech}>{completion.meaning.partOfSpeech}</Text>
                  <Text style={styles.meaningDefinition}>{completion.meaning.definition}</Text>
                  {completion.meaning.synonyms.length > 0 && (
                    <Text style={styles.meaningSynonyms}>
                      {t('synonymsListLabel', { list: completion.meaning.synonyms.join(', ') })}
                    </Text>
                  )}
                </View>
              )}
              <Pressable
                style={styles.button}
                onPress={handleContinue}
                accessibilityRole="button"
                accessibilityLabel={t('continue')}
              >
                <Text style={styles.buttonText}>{t('continue')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    groupNote: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    flexFill: { flex: 1, backgroundColor: colors.background },
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      paddingTop: topInset + spacing.md,
      alignItems: 'center',
    },
    // One centred column that stays comfortable from a phone to a wide desktop window.
    column: { width: '100%', maxWidth: 560, gap: spacing.lg },
    centered: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.md,
    },
    centeredScrollContent: {
      flexGrow: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.md,
    },
    deferredRecap: { maxWidth: 360 },
    error: { color: colors.danger, fontSize: typography.scale.md, textAlign: 'center' },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    progressLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    streakPill: {
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderWidth: 1,
      borderColor: colors.glyph,
    },
    streakPillText: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
    stage: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    stageSide: { alignItems: 'center', gap: spacing.xs, minWidth: 90 },
    livesLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    livesValue: { color: colors.ink, fontSize: typography.scale.xl, fontWeight: '800' },
    wrongLetters: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      letterSpacing: 2,
      textAlign: 'center',
    },
    wordRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    slot: {
      minWidth: 30,
      height: 44,
      borderBottomWidth: 3,
      borderBottomColor: colors.glyph,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: 2,
    },
    slotPlain: { borderBottomColor: 'transparent', minWidth: 18 },
    slotText: { color: colors.ink, fontSize: typography.scale.xl, fontWeight: '800' },
    definitionText: {
      color: colors.glyph,
      fontSize: typography.scale.sm,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    synonymsButton: {
      alignSelf: 'center',
      borderRadius: radius.pill,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.glyph,
    },
    synonymsButtonText: { color: colors.glyph, fontSize: typography.scale.xs, fontWeight: '700' },
    synonymsText: { color: colors.inkMuted, fontSize: typography.scale.xs, textAlign: 'center' },
    keyboard: { gap: spacing.sm, alignItems: 'center' },
    keyRow: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
    key: {
      width: 32,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.arcaneSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    button: {
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    hintButton: {
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.glyph,
    },
    hintButtonText: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
    feedbackBar: { gap: spacing.sm },
    feedbackText: { fontSize: typography.scale.md, fontWeight: '700', textAlign: 'center' },
    revealText: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    revealWord: { color: colors.ink, fontWeight: '700' },
    meaningButton: {
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    meaningButtonText: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    meaningCard: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
    },
    meaningPartOfSpeech: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    meaningDefinition: { color: colors.ink, fontSize: typography.scale.sm },
    meaningSynonyms: { color: colors.inkMuted, fontSize: typography.scale.xs },
  });
}
