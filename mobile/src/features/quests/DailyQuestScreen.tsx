import { useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  acknowledgeUnderstanding,
  completeWord,
  createOptionalWildMission,
  getTodayQuestSummary,
  requestHint,
  requestLetterReveal,
  requestSynonym,
  startQuest,
  submitAnswer,
  submitParagraph,
  submitSentence,
  type ChallengeView,
  type ParagraphResult,
  type SentenceResult,
  type TodayQuestSummary,
  type TodayQuestWindowSummary,
  type UnderstandingContent,
} from '@/services/quests';
import { getMyProgression } from '@/services/progression';
import { GlyphCoin } from '@/components/GlyphIcon';
import {
  createPhotoUploadTarget,
  submitPhotoEvidence,
  submitTextEvidence,
  uploadPhotoToR2,
  type PhotoContentType,
} from '@/services/word-in-the-wild';
import { explainMistake } from '@/services/ali';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { useEvidenceModeStore, type EvidenceMode } from '@/state/evidenceModeStore';
import { FadeInUp } from '@/components/FadeInUp';
import { AliBubble } from '@/components/AliBubble';
import { AffordanceChip } from '@/components/AffordanceChip';
import { ScoreRing } from '@/components/ScoreRing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'DailyQuest'>;

/**
 * The full per-word cycle (Correction & Completion Spec §1-2):
 * Guess -> Understanding -> Sentence -> Paragraph -> Optional Wild ->
 * Word Complete. Kept as one immersive screen rather than a chain of
 * stack screens, matching RootNavigator's "this is a quiz, the tab bar
 * stays hidden" note — a player mid-word should never see a tab bar
 * flash between stages.
 *
 * Speaking and its Pronunciation-feedback stage were removed from V1
 * entirely — Paragraph now advances directly to Optional Wild.
 */
type Stage =
  | 'loading'
  | 'guess'
  | 'guessFeedback'
  | 'understanding'
  | 'sentence'
  | 'sentenceFeedback'
  | 'paragraph'
  | 'paragraphFeedback'
  | 'optionalWild'
  | 'completing'
  | 'error';

interface GuessFeedback {
  isCorrect: boolean;
  timedOut: boolean;
  correctAnswer: string;
  playerAnswer: string;
  xpAwarded: number;
  aliQuickReaction: string | null;
}

const MODE_ICONS: Record<
  EvidenceMode,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
  TEXT: { active: 'document-text', inactive: 'document-text-outline' },
  PHOTO: { active: 'camera', inactive: 'camera-outline' },
};

/**
 * Pops a filled letter box into place (scale 0.4 -> 1, slight overshoot)
 * on mount. Because the letters row swaps a blank's <TextInput> for a
 * plain filled box at the same array index once that letter is known
 * (initially filled, or just revealed), React remounts this element
 * fresh every time a letter newly resolves -- so an entrance-only
 * animation here fires exactly when it should with no extra diffing.
 */
function PoppingLetter({
  children,
  style,
  delay = 0,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
}) {
  const scale = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 14,
      delay,
    }).start();
    // One-shot entrance for this mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

/** >=90 reads as a clean success green, 75-89 as the app's own arcaneSoft accent, below that as a gentle amber nudge -- never red, this is still a strong paragraph. */
function scoreBandColor(score: number, colors: ThemeColors): string {
  if (score >= 90) return colors.success;
  if (score >= 75) return colors.arcaneSoft;
  return colors.warning;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isAlreadyCompletedMessage(message: string): boolean {
  return message.startsWith("You've already completed today's");
}

function isQuestGatingMessage(message: string): boolean {
  return isAlreadyCompletedMessage(message) || / unlocks at \d{2}:00\.$/.test(message);
}

function isWindowOpenNow(q: TodayQuestWindowSummary, nowHour: number): boolean {
  if (q.windowStartHour === null) return true;
  if (nowHour < q.windowStartHour) return false;
  if (q.windowEndHour !== null && nowHour > q.windowEndHour) return false;
  return true;
}

function nextWindowCountdown(quests: TodayQuestWindowSummary[]): string | null {
  const now = new Date();
  const upcoming = quests.find(
    (q) => !q.completed && q.windowStartHour !== null && now.getHours() < q.windowStartHour,
  );
  if (!upcoming || upcoming.windowStartHour === null) return null;
  const target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    upcoming.windowStartHour,
    0,
    0,
    0,
  );
  const ms = Math.max(0, target.getTime() - now.getTime());
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

export function DailyQuestScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const { t } = useTranslation('dailyQuest');
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { questKey } = route.params;
  const accessToken = useAuthStore((s) => s.accessToken);
  const [stage, setStage] = useState<Stage>('loading');
  const [errorMessage, setErrorMessage] = useState(t('couldNotLoadQuest'));
  const [challenge, setChallenge] = useState<ChallengeView | null>(null);
  const [gateInfo, setGateInfo] = useState<{
    todaySummary: TodayQuestSummary;
    currentStreak: number;
    masteredWordsCount: number;
  } | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [letters, setLetters] = useState<Record<number, string>>({});
  const [guessFeedback, setGuessFeedback] = useState<GuessFeedback | null>(null);
  const [understanding, setUnderstanding] = useState<UnderstandingContent | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [synonym, setSynonym] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [synonymLoading, setSynonymLoading] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);
  // undefined until the player's first tap tells us the real cap -- see
  // AffordanceChip's doc comment for why we never guess at these.
  const [hintsRemaining, setHintsRemaining] = useState<number | undefined>(undefined);
  const [synonymsRemaining, setSynonymsRemaining] = useState<number | undefined>(undefined);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [synonymsUsed, setSynonymsUsed] = useState(0);
  const [sentenceText, setSentenceText] = useState('');
  const [sentenceResult, setSentenceResult] = useState<SentenceResult | null>(null);
  const [paragraphText, setParagraphText] = useState('');
  const [paragraphResult, setParagraphResult] = useState<ParagraphResult | null>(null);
  const [wildText, setWildText] = useState('');
  const [wildPhoto, setWildPhoto] = useState<{ uri: string; contentType: PhotoContentType } | null>(
    null,
  );
  const [wildError, setWildError] = useState<string | null>(null);
  const [wildBusy, setWildBusy] = useState(false);
  // Guess/sentence/paragraph submissions all hit the AI evaluator, which
  // routinely takes several seconds (a real model call generating scored
  // feedback -- never instant, unlike the Word in the Wild flow's own
  // wildBusy guard, which already covers this pattern for that stage).
  // These three didn't have an in-flight guard: the buttons stayed enabled
  // the whole time the request was outstanding, so a slow response
  // invited a second tap, which then hit the stage-already-claimed
  // rejection because the first request was still landing.
  const [guessBusy, setGuessBusy] = useState(false);
  const [sentenceBusy, setSentenceBusy] = useState(false);
  const [paragraphBusy, setParagraphBusy] = useState(false);
  const [mistakeExplanation, setMistakeExplanation] = useState<string | null>(null);
  const [mistakeExplanationLoading, setMistakeExplanationLoading] = useState(false);
  const [aliBubble, setAliBubble] = useState<{ id: number; message: string } | null>(null);
  const aliBubbleCounter = useRef(0);
  const inputRefs = useRef<Record<number, TextInput | null>>({});

  // Text vs Photo defaults to whatever the player last used on the standalone
  // Word in the Wild flow (SubmitEvidenceScreen) — the two share
  // useEvidenceModeStore so the preference carries over either direction.
  const lastWildMode = useEvidenceModeStore((s) => s.lastMode);
  const setLastWildMode = useEvidenceModeStore((s) => s.setLastMode);
  const [wildMode, setWildModeState] = useState<EvidenceMode>(lastWildMode);
  const setWildMode = (next: EvidenceMode) => {
    setWildModeState(next);
    setLastWildMode(next);
  };

  const load = (attemptIdToResume?: string) => {
    if (!accessToken) return;
    setStage('loading');
    startQuest(accessToken, questKey)
      .then((view) => {
        setChallenge(view);
        setAttemptId(view.questAttemptId);
        // Resuming past Guess (app relaunch, or just leaving and
        // reopening the quest) has no in-session submitAnswer response
        // to source this from, since that only ever fires for a fresh
        // guess — the backend now sends the same word detail along with
        // the resumed stage so Sentence/Paragraph/Optional Wild show the
        // real word instead of falling back to "the word".
        if (view.understanding) setUnderstanding(view.understanding);
        // Resuming an in-progress attempt can land anywhere the player
        // left off, not just Guess — the backend now tells us the real
        // stage (wordStage) instead of always implying Guess, which used
        // to send a resumed player into the guess-blank UI for an
        // attempt already past that stage (every submission then failed
        // with "not currently at the Guess stage").
        switch (view.wordStage) {
          case 'SENTENCE':
            setStage('sentence');
            break;
          case 'PARAGRAPH':
            setStage('paragraph');
            break;
          case 'OPTIONAL_WILD':
            setStage('optionalWild');
            break;
          default:
            setStage('guess');
        }
      })
      .catch((err) => {
        // A BadRequestException here is usually the gating rule talking —
        // "unlocks at 16:00" / "already completed today" — worth showing
        // verbatim rather than a generic failure message.
        if (err instanceof ApiError && err.status === 400) setErrorMessage(err.message);
        setStage('error');
      });
    void attemptIdToResume;
  };

  useEffect(load, [accessToken, questKey]);

  useEffect(() => {
    if (stage !== 'error' || !accessToken || !isQuestGatingMessage(errorMessage)) return;
    let cancelled = false;
    Promise.all([getTodayQuestSummary(accessToken), getMyProgression(accessToken)])
      .then(([todaySummary, progression]) => {
        if (!cancelled) {
          setGateInfo({
            todaySummary,
            currentStreak: progression.currentStreak,
            masteredWordsCount: progression.masteredWordsCount,
          });
        }
      })
      .catch(() => {
        // Non-critical enrichment.
      });
    return () => {
      cancelled = true;
    };
  }, [stage, errorMessage, accessToken]);

  const onChangeLetter = (index: number, raw: string) => {
    const char = raw.slice(-1).toUpperCase();
    setLetters((prev) => ({ ...prev, [index]: char }));

    if (char && challenge) {
      const position = challenge.missingIndexes.indexOf(index);
      const next = challenge.missingIndexes[position + 1];
      if (next !== undefined) inputRefs.current[next]?.focus();
    }
  };

  const onBackspace = (index: number) => {
    if (!challenge || letters[index]) return; // let the default delete-this-char happen first
    const position = challenge.missingIndexes.indexOf(index);
    const prev = challenge.missingIndexes[position - 1];
    if (prev !== undefined) inputRefs.current[prev]?.focus();
  };

  const allBlanksFilled = challenge ? challenge.missingIndexes.every((i) => !!letters[i]) : false;

  const buildAnswer = (view: ChallengeView): string =>
    view.displayPattern
      .split(' ')
      .map((token, i) => (token === '_' ? (letters[i] ?? '') : token))
      .join('');

  const onSubmitGuess = async () => {
    if (!accessToken || !challenge || !attemptId || stage !== 'guess' || !allBlanksFilled) return;
    if (guessBusy) return;
    const answer = buildAnswer(challenge);
    setGuessBusy(true);
    try {
      const result = await submitAnswer(accessToken, attemptId, answer);
      setGuessFeedback({
        isCorrect: result.isCorrect,
        timedOut: result.timedOut,
        correctAnswer: result.correctAnswer,
        playerAnswer: answer,
        xpAwarded: result.xpAwarded,
        aliQuickReaction: result.aliQuickReaction,
      });
      if (result.aliQuickReaction) {
        aliBubbleCounter.current += 1;
        setAliBubble({ id: aliBubbleCounter.current, message: result.aliQuickReaction });
      }
      if (result.isCorrect && result.understanding) {
        setUnderstanding(result.understanding);
      }
      setStage('guessFeedback');
    } catch (err) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      setStage('error');
    } finally {
      setGuessBusy(false);
    }
  };

  const onRetryGuess = () => {
    if (guessFeedback?.timedOut) {
      // The old attempt was auto-abandoned server-side — starting fresh gets a new one.
      load();
      return;
    }
    setLetters({});
    setGuessFeedback(null);
    setMistakeExplanation(null);
    inputRefs.current = {};
    setStage('guess');
  };

  const onHint = async () => {
    if (!accessToken || !attemptId || hintLoading || hintsRemaining === 0) return;
    setHintLoading(true);
    try {
      const result = await requestHint(accessToken, attemptId);
      setHint(result.hint ?? t('noHintAvailable'));
      setHintsRemaining(result.hintsRemaining);
      setHintsUsed(result.hintsUsed);
    } catch {
      // Non-critical affordance — a failed hint request shouldn't interrupt the guess itself.
    } finally {
      setHintLoading(false);
    }
  };

  // V22 §6 finding: this "learning recovery" flow existed end to end on
  // the backend but had no UI trigger anywhere — on-demand only, never
  // called automatically, matching ali.service's own doc comment for
  // explainMistake ("never called reactively").
  const onExplainMistake = async () => {
    if (!accessToken || !guessFeedback || guessFeedback.isCorrect) return;
    setMistakeExplanationLoading(true);
    try {
      const result = await explainMistake(accessToken, {
        word: guessFeedback.correctAnswer,
        playerAnswer: guessFeedback.playerAnswer,
        correctAnswer: guessFeedback.correctAnswer,
        stage: 'GUESS',
      });
      setMistakeExplanation(result.text);
    } catch {
      setMistakeExplanation(t('explanationUnavailable'));
    } finally {
      setMistakeExplanationLoading(false);
    }
  };

  const onSynonym = async () => {
    if (!accessToken || !attemptId || synonymLoading || synonymsRemaining === 0) return;
    setSynonymLoading(true);
    try {
      const result = await requestSynonym(accessToken, attemptId);
      setSynonym(result.synonym ?? t('noSynonymAvailable'));
      setSynonymsRemaining(result.synonymsRemaining);
      setSynonymsUsed(result.synonymsUsed);
    } catch {
      // Non-critical affordance — same reasoning as onHint.
    } finally {
      setSynonymLoading(false);
    }
  };

  const onRevealLetter = async () => {
    if (
      !accessToken ||
      !attemptId ||
      revealLoading ||
      !challenge ||
      challenge.missingIndexes.length === 0
    )
      return;
    setRevealLoading(true);
    try {
      const result = await requestLetterReveal(accessToken, attemptId);
      setChallenge((prev) =>
        prev
          ? {
              ...prev,
              displayPattern: result.displayPattern,
              missingIndexes: result.missingIndexes,
            }
          : prev,
      );
    } catch {
      // Non-critical affordance — same reasoning as onHint.
    } finally {
      setRevealLoading(false);
    }
  };

  const onContinueToSentence = async () => {
    if (!accessToken || !attemptId) return;
    try {
      await acknowledgeUnderstanding(accessToken, attemptId);
      setStage('sentence');
    } catch (err) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      setStage('error');
    }
  };

  const onSubmitSentence = async () => {
    if (!accessToken || !attemptId || !sentenceText.trim()) return;
    if (sentenceBusy) return;
    setSentenceBusy(true);
    try {
      const result = await submitSentence(accessToken, attemptId, sentenceText.trim());
      setSentenceResult(result);
      setStage('sentenceFeedback');
    } catch (err) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      setStage('error');
    } finally {
      setSentenceBusy(false);
    }
  };

  const paragraphWordCount = paragraphText.trim().length
    ? paragraphText.trim().split(/\s+/).length
    : 0;
  const paragraphValid = paragraphWordCount >= 30 && paragraphWordCount <= 100;

  const onSubmitParagraph = async () => {
    if (!accessToken || !attemptId || !paragraphValid) return;
    if (paragraphBusy) return;
    setParagraphBusy(true);
    try {
      const result = await submitParagraph(accessToken, attemptId, paragraphText.trim());
      setParagraphResult(result);
      setStage('paragraphFeedback');
    } catch (err) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      setStage('error');
    } finally {
      setParagraphBusy(false);
    }
  };

  const pickWildPhoto = async (source: 'camera' | 'library') => {
    setWildError(null);
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setWildError(source === 'camera' ? t('cameraAccessNeeded') : t('photoLibraryAccessNeeded'));
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });

    if (result.canceled) return;
    const asset = result.assets[0];
    setWildPhoto({
      uri: asset.uri,
      contentType: asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
    });
  };

  /**
   * Optional Wild evidence can be a written description (submitTextEvidence)
   * or, since the whole point of this step is proving the word got used for
   * real, a screenshot of that real usage (the same three-step R2 upload
   * SubmitEvidenceScreen uses: presigned URL -> PUT bytes -> tell the
   * backend the key so it can assess them). Either way the mission itself
   * is created fresh here, tied to this quest attempt's word.
   */
  const finishWord = async (submitWildEvidence: boolean) => {
    if (!accessToken || !attemptId) return;
    setWildBusy(true);
    setWildError(null);
    try {
      if (submitWildEvidence && wildMode === 'PHOTO' && wildPhoto) {
        const mission = await createOptionalWildMission(accessToken, attemptId);
        const target = await createPhotoUploadTarget(
          accessToken,
          mission.id,
          wildPhoto.contentType,
        );
        await uploadPhotoToR2(target.uploadUrl, wildPhoto.uri, wildPhoto.contentType);
        await submitPhotoEvidence(accessToken, mission.id, target.key);
      } else if (submitWildEvidence && wildMode === 'TEXT' && wildText.trim()) {
        const mission = await createOptionalWildMission(accessToken, attemptId);
        await submitTextEvidence(accessToken, mission.id, wildText.trim());
      }
      const result = await completeWord(accessToken, attemptId);
      navigation.replace('QuestComplete', result);
    } catch (err) {
      setWildError(err instanceof ApiError ? err.message : t('couldNotSubmitEvidence'));
    } finally {
      setWildBusy(false);
    }
  };

  if (stage === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  if (stage === 'error' || !challenge) {
    const goHome = () =>
      navigation.canGoBack() ? navigation.goBack() : navigation.replace('Main');

    if (isQuestGatingMessage(errorMessage)) {
      const alreadyCompleted = isAlreadyCompletedMessage(errorMessage);
      const nextWindowLabel = gateInfo ? nextWindowCountdown(gateInfo.todaySummary.quests) : null;
      const nowHour = new Date().getHours();
      // The specific window this screen is about — its real xpAwarded/
      // glyphAwarded (QuestAttempt columns, not an invented same-day
      // total) are what "the initial quest completed on the screen"
      // actually earned.
      const completedWindow = gateInfo?.todaySummary.quests.find((q) => q.key === questKey) ?? null;
      const earnedXp = alreadyCompleted ? (completedWindow?.xpAwarded ?? null) : null;
      const earnedGlyphs = alreadyCompleted ? (completedWindow?.glyphAwarded ?? null) : null;

      const windowElements: JSX.Element[] = [];
      gateInfo?.todaySummary.quests.forEach((q, i) => {
        if (i > 0) {
          windowElements.push(<View key={`sep-${q.key}`} style={styles.gateWindowConnector} />);
        }
        const done = q.completed;
        const open = !done && isWindowOpenNow(q, nowHour);
        windowElements.push(
          <View key={q.key} style={styles.gateWindowCol}>
            <View
              style={[
                styles.gateWindowDot,
                done && styles.gateWindowDotDone,
                open && styles.gateWindowDotOpen,
              ]}
            >
              {done ? (
                <Ionicons name="checkmark" size={13} color={colors.background} />
              ) : (
                <Text style={[styles.gateWindowDotText, open && styles.gateWindowDotTextOpen]}>
                  {q.windowStartHour !== null ? String(q.windowStartHour).padStart(2, '0') : '·'}
                </Text>
              )}
            </View>
            <Text
              style={[styles.gateWindowLabel, done && styles.gateWindowLabelDone]}
              numberOfLines={1}
            >
              {q.title.replace(/ Quest$/, '')}
            </Text>
          </View>,
        );
      });

      return (
        <ScrollView contentContainerStyle={styles.gateContainer}>
          <FadeInUp style={styles.gateCard}>
            <View style={styles.gateIconWrap}>
              <Ionicons
                name={alreadyCompleted ? 'checkmark' : 'time-outline'}
                size={26}
                color={colors.arcaneSoft}
              />
            </View>
            <Text style={styles.gateTitle}>
              {alreadyCompleted ? t('questCompleteToday') : t('notOpenYet')}
            </Text>
            <Text style={styles.gateSubtitle}>{errorMessage}</Text>

            {windowElements.length > 0 && (
              <View style={styles.gateWindowRow}>{windowElements}</View>
            )}

            {nextWindowLabel && (
              <View style={styles.gateNextPill}>
                <Ionicons name="time-outline" size={13} color={colors.arcaneSoft} />
                <Text style={styles.gateNextPillText}>
                  {t('nextWindowIn', { time: nextWindowLabel })}
                </Text>
              </View>
            )}
          </FadeInUp>

          {gateInfo && (
            <FadeInUp delay={80} style={styles.gateStatsRow}>
              <View style={styles.gateStatTile}>
                <Ionicons name="flame" size={16} color={colors.warning} />
                <Text style={styles.gateStatValue}>{gateInfo.currentStreak}</Text>
                <Text style={styles.gateStatLabel}>{t('dayStreak')}</Text>
              </View>
              {earnedXp != null ? (
                <View style={styles.gateStatTile}>
                  <Ionicons name="sparkles" size={16} color={colors.glyph} />
                  <Text style={styles.gateStatValue}>+{earnedXp}</Text>
                  <Text style={styles.gateStatLabel}>{t('xpEarned')}</Text>
                </View>
              ) : (
                <View style={styles.gateStatTile}>
                  <Ionicons name="ribbon-outline" size={16} color={colors.glyph} />
                  <Text style={styles.gateStatValue}>{gateInfo.masteredWordsCount}</Text>
                  <Text style={styles.gateStatLabel}>{t('wordsMastered')}</Text>
                </View>
              )}
              {earnedGlyphs != null && earnedGlyphs > 0 && (
                <View style={styles.gateStatTile}>
                  <GlyphCoin size={16} />
                  <Text style={styles.gateStatValue}>{earnedGlyphs}</Text>
                  <Text style={styles.gateStatLabel}>{t('glyphsEarned')}</Text>
                </View>
              )}
            </FadeInUp>
          )}

          <Pressable style={styles.gateHomeButton} onPress={goHome}>
            <Text style={styles.buttonText}>{t('backToHome')}</Text>
          </Pressable>
          <Pressable
            style={styles.gatePracticeLink}
            onPress={() => navigation.navigate('WordMastery')}
            accessibilityRole="button"
            accessibilityLabel={t('practiceFreeWordsA11y')}
          >
            <Text style={styles.gatePracticeLinkText}>{t('practiceFreeWordsInstead')}</Text>
          </Pressable>
        </ScrollView>
      );
    }

    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{errorMessage}</Text>
        <Pressable style={styles.errorBackButton} onPress={goHome}>
          <Text style={styles.buttonText}>{t('backToHome')}</Text>
        </Pressable>
      </View>
    );
  }

  if (stage === 'guess' || stage === 'guessFeedback') {
    const tokens = challenge.displayPattern.split(' ');
    return (
      <View style={styles.flexFill}>
        {aliBubble && (
          <AliBubble
            key={aliBubble.id}
            message={aliBubble.message}
            onDismiss={() => setAliBubble(null)}
          />
        )}
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.progressLabel}>{t('progressGuess')}</Text>

          <View style={styles.clueCard}>
            <Text style={styles.partOfSpeech}>{challenge.partOfSpeech}</Text>
            <Text style={styles.definition}>{challenge.definition}</Text>
          </View>

          <View style={styles.lettersRow}>
            {tokens.map((token, i) =>
              token === '_' ? (
                <TextInput
                  key={i}
                  ref={(r) => {
                    inputRefs.current[i] = r;
                  }}
                  style={[styles.letterBox, styles.letterBoxBlank]}
                  value={letters[i] ?? ''}
                  onChangeText={(text) => onChangeLetter(i, text)}
                  onKeyPress={({ nativeEvent }) =>
                    nativeEvent.key === 'Backspace' && onBackspace(i)
                  }
                  maxLength={1}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={stage === 'guess'}
                  accessibilityLabel={t('letterLabel', { number: i + 1 })}
                />
              ) : (
                <PoppingLetter
                  key={i}
                  style={[styles.letterBox, styles.letterBoxFilled]}
                  delay={i * 25}
                >
                  <Text style={styles.letterBoxFilledText}>{token}</Text>
                </PoppingLetter>
              ),
            )}
          </View>

          {stage === 'guess' && (
            <>
              <View style={styles.affordanceRow}>
                <AffordanceChip
                  icon="bulb-outline"
                  label={t('hintLabel')}
                  exhaustedLabel={t('hintExhausted')}
                  onPress={onHint}
                  loading={hintLoading}
                  remaining={hintsRemaining}
                />
                <AffordanceChip
                  icon="swap-horizontal-outline"
                  label={t('synonymLabel')}
                  exhaustedLabel={t('synonymExhausted')}
                  onPress={onSynonym}
                  loading={synonymLoading}
                  remaining={synonymsRemaining}
                />
                <AffordanceChip
                  icon="eye-outline"
                  label={t('revealLetterLabel')}
                  exhaustedLabel={t('revealLetterExhausted')}
                  onPress={onRevealLetter}
                  loading={revealLoading}
                  remaining={challenge.missingIndexes.length}
                />
              </View>
              {hint && (
                <FadeInUp key={`hint-${hintsUsed}`} style={styles.resultCard}>
                  <View style={styles.resultCardHeader}>
                    <Ionicons name="bulb" size={13} color={colors.glyph} />
                    <Text style={styles.resultCardLabel}>{t('hintLabel')}</Text>
                  </View>
                  <Text style={styles.resultCardText}>{hint}</Text>
                </FadeInUp>
              )}
              {synonym && (
                <FadeInUp key={`synonym-${synonymsUsed}`} style={styles.resultCard}>
                  <View style={styles.resultCardHeader}>
                    <Ionicons name="swap-horizontal" size={13} color={colors.glyph} />
                    <Text style={styles.resultCardLabel}>{t('synonymLabel')}</Text>
                  </View>
                  <Text style={styles.resultCardText}>{synonym}</Text>
                </FadeInUp>
              )}

              <Pressable
                style={[styles.button, (!allBlanksFilled || guessBusy) && styles.buttonDisabled]}
                onPress={onSubmitGuess}
                disabled={!allBlanksFilled || guessBusy}
                accessibilityRole="button"
                accessibilityLabel={t('submit')}
              >
                {guessBusy ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <Text style={styles.buttonText}>{t('submit')}</Text>
                )}
              </Pressable>
            </>
          )}

          {stage === 'guessFeedback' && guessFeedback && (
            <FadeInUp style={styles.feedbackBar}>
              <View style={styles.guessResultHero}>
                <View
                  style={[
                    styles.guessResultBadge,
                    guessFeedback.isCorrect
                      ? styles.guessResultBadgeCorrect
                      : styles.guessResultBadgeMiss,
                  ]}
                >
                  <Ionicons
                    name={
                      guessFeedback.timedOut
                        ? 'time-outline'
                        : guessFeedback.isCorrect
                          ? 'checkmark'
                          : 'close'
                    }
                    size={30}
                    color={colors.background}
                  />
                </View>
                <Text
                  style={[
                    styles.feedbackText,
                    { color: guessFeedback.isCorrect ? colors.success : colors.danger },
                  ]}
                >
                  {guessFeedback.timedOut
                    ? t('timesUp')
                    : guessFeedback.isCorrect
                      ? t('correctExclaim')
                      : t('notQuite')}
                </Text>
                {guessFeedback.isCorrect && (
                  <View style={styles.xpPill}>
                    <Ionicons name="sparkles" size={12} color={colors.glyph} />
                    <Text style={styles.xpPillText}>
                      {t('xpAwarded', { xp: guessFeedback.xpAwarded })}
                    </Text>
                  </View>
                )}
              </View>

              {!guessFeedback.isCorrect && (
                <FadeInUp style={[styles.feedbackCard, styles.feedbackCardPolish]} delay={100}>
                  <View style={styles.feedbackCardHeader}>
                    <Ionicons name="locate-outline" size={15} color={colors.warning} />
                    <Text style={[styles.feedbackCardLabel, { color: colors.warning }]}>
                      {t('theWordWasLabel')}
                    </Text>
                  </View>
                  <Text style={styles.feedbackCardText}>{guessFeedback.correctAnswer}</Text>
                </FadeInUp>
              )}
              {!guessFeedback.isCorrect && !guessFeedback.timedOut && !mistakeExplanation && (
                <Pressable
                  style={styles.explainButton}
                  onPress={onExplainMistake}
                  disabled={mistakeExplanationLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('whyWasThisWrong')}
                >
                  {mistakeExplanationLoading ? (
                    <ActivityIndicator color={colors.arcaneSoft} size="small" />
                  ) : (
                    <Text style={styles.explainButtonText}>{t('whyWasThisWrong')}</Text>
                  )}
                </Pressable>
              )}
              {mistakeExplanation && (
                <FadeInUp style={[styles.feedbackCard, styles.feedbackCardBetter]}>
                  <View style={styles.feedbackCardHeader}>
                    <Ionicons name="bulb" size={15} color={colors.arcaneSoft} />
                    <Text style={[styles.feedbackCardLabel, { color: colors.arcaneSoft }]}>
                      {t('whyItWasWrong')}
                    </Text>
                  </View>
                  <Text style={styles.feedbackCardText}>{mistakeExplanation}</Text>
                </FadeInUp>
              )}
              <Pressable
                style={styles.button}
                onPress={guessFeedback.isCorrect ? () => setStage('understanding') : onRetryGuess}
                accessibilityRole="button"
                accessibilityLabel={guessFeedback.isCorrect ? t('continue') : t('tryAgain')}
              >
                <Text style={styles.buttonText}>
                  {guessFeedback.isCorrect ? t('continue') : t('tryAgain')}
                </Text>
              </Pressable>
            </FadeInUp>
          )}
        </ScrollView>
      </View>
    );
  }

  if (stage === 'understanding' && understanding) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.progressLabel}>{t('progressUnderstanding')}</Text>
        <Text style={styles.wordTitle}>{understanding.word}</Text>
        <Text style={styles.partOfSpeech}>{understanding.partOfSpeech}</Text>
        {understanding.phoneticRepresentation && (
          <Text style={styles.affordanceText}>{understanding.phoneticRepresentation}</Text>
        )}
        <Text style={styles.definition}>{understanding.definition}</Text>
        {understanding.synonyms.length > 0 && (
          <Text style={styles.affordanceText}>
            {t('synonymsListLabel', { list: understanding.synonyms.join(', ') })}
          </Text>
        )}
        <Text style={styles.exampleText}>{understanding.exampleSentence}</Text>

        <Pressable
          style={styles.button}
          onPress={onContinueToSentence}
          accessibilityRole="button"
          accessibilityLabel={t('iUnderstandContinue')}
        >
          <Text style={styles.buttonText}>{t('iUnderstandContinue')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (stage === 'sentence') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.progressLabel}>{t('progressSentence')}</Text>
        <Text style={styles.definition}>
          {t('writeSentenceInstruction', { word: understanding?.word ?? t('theWordFallback') })}
        </Text>
        <TextInput
          style={styles.textArea}
          value={sentenceText}
          onChangeText={setSentenceText}
          multiline
          placeholder={t('sentencePlaceholder')}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={t('yourSentenceLabel')}
        />
        <Pressable
          style={[styles.button, (!sentenceText.trim() || sentenceBusy) && styles.buttonDisabled]}
          onPress={onSubmitSentence}
          disabled={!sentenceText.trim() || sentenceBusy}
          accessibilityRole="button"
          accessibilityLabel={t('submit')}
        >
          {sentenceBusy ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.buttonText}>{t('submit')}</Text>
          )}
        </Pressable>
      </ScrollView>
    );
  }

  if (stage === 'sentenceFeedback' && sentenceResult) {
    const subScores = sentenceResult.scores;
    const compositeScore =
      (subScores.grammar +
        subScores.vocabulary +
        subScores.context +
        subScores.naturalness +
        subScores.clarity) /
      5;
    const subScoreEntries: { key: string; label: string; value: number }[] = [
      { key: 'grammar', label: t('common:scoreCategories.grammar'), value: subScores.grammar },
      {
        key: 'vocabulary',
        label: t('common:scoreCategories.vocabulary'),
        value: subScores.vocabulary,
      },
      { key: 'context', label: t('common:scoreCategories.context'), value: subScores.context },
      {
        key: 'naturalness',
        label: t('common:scoreCategories.naturalness'),
        value: subScores.naturalness,
      },
      { key: 'clarity', label: t('common:scoreCategories.clarity'), value: subScores.clarity },
    ];
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.paragraphHeaderRow}>
          <Text style={styles.progressLabel}>{t('progressSentence')}</Text>
          <View style={styles.xpPill}>
            <Ionicons name="sparkles" size={12} color={colors.glyph} />
            <Text style={styles.xpPillText}>
              {t('xpAwarded', { xp: sentenceResult.xpAwarded })}
            </Text>
          </View>
        </View>

        <FadeInUp style={styles.heroRingWrap}>
          <ScoreRing
            score={compositeScore}
            size={168}
            strokeWidth={14}
            color={colors.arcane}
            label={t('common:scoreCategories.composite')}
          />
        </FadeInUp>

        <FadeInUp style={styles.subScoreRow} delay={120}>
          {subScoreEntries.map((entry) => (
            <View key={entry.key} style={styles.subScoreItem}>
              <ScoreRing
                score={entry.value}
                size={56}
                strokeWidth={6}
                color={scoreBandColor(entry.value, colors)}
                valueFontSize={14}
              />
              <Text style={styles.subScoreLabel}>{entry.label}</Text>
            </View>
          ))}
        </FadeInUp>

        <FadeInUp style={[styles.feedbackCard, styles.feedbackCardWorked]} delay={220}>
          <View style={styles.feedbackCardHeader}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={[styles.feedbackCardLabel, { color: colors.success }]}>
              {t('whatWorkedLabel')}
            </Text>
          </View>
          <Text style={styles.feedbackCardText}>{sentenceResult.whatWentWell}</Text>
        </FadeInUp>

        <FadeInUp style={[styles.feedbackCard, styles.feedbackCardPolish]} delay={300}>
          <View style={styles.feedbackCardHeader}>
            <Ionicons name="locate-outline" size={15} color={colors.warning} />
            <Text style={[styles.feedbackCardLabel, { color: colors.warning }]}>
              {t('polishThisLabel')}
            </Text>
          </View>
          <Text style={styles.feedbackCardText}>{sentenceResult.whatNeedsImprovement}</Text>
        </FadeInUp>

        {sentenceResult.betterVersion && (
          <FadeInUp style={[styles.feedbackCard, styles.feedbackCardBetter]} delay={380}>
            <View style={styles.feedbackCardHeader}>
              <Ionicons name="bulb" size={15} color={colors.arcaneSoft} />
              <Text style={[styles.feedbackCardLabel, { color: colors.arcaneSoft }]}>
                {t('tryItThisWayLabel')}
              </Text>
            </View>
            <Text style={styles.feedbackCardText}>{sentenceResult.betterVersion}</Text>
          </FadeInUp>
        )}

        <Pressable
          style={styles.button}
          onPress={() => setStage('paragraph')}
          accessibilityRole="button"
          accessibilityLabel={t('continue')}
        >
          <Text style={styles.buttonText}>{t('continue')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (stage === 'paragraph') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.progressLabel}>{t('progressParagraph')}</Text>
        <Text style={styles.definition}>
          {t('paragraphInstruction', { word: understanding?.word ?? t('theWordFallback') })}
        </Text>
        <TextInput
          style={[styles.textArea, styles.textAreaTall]}
          value={paragraphText}
          onChangeText={setParagraphText}
          multiline
          placeholder={t('paragraphPlaceholder')}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={t('yourParagraphLabel')}
        />
        <Text style={styles.affordanceText}>
          {t('wordCountProgress', { count: paragraphWordCount })}
        </Text>
        <Pressable
          style={[styles.button, (!paragraphValid || paragraphBusy) && styles.buttonDisabled]}
          onPress={onSubmitParagraph}
          disabled={!paragraphValid || paragraphBusy}
          accessibilityRole="button"
          accessibilityLabel={t('submit')}
        >
          {paragraphBusy ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.buttonText}>{t('submit')}</Text>
          )}
        </Pressable>
      </ScrollView>
    );
  }

  if (stage === 'paragraphFeedback' && paragraphResult) {
    const subScores = paragraphResult.scores;
    const compositeScore =
      (subScores.grammar +
        subScores.vocabulary +
        subScores.structure +
        subScores.flow +
        subScores.context) /
      5;
    const subScoreEntries: { key: string; label: string; value: number }[] = [
      { key: 'grammar', label: t('common:scoreCategories.grammar'), value: subScores.grammar },
      {
        key: 'vocabulary',
        label: t('common:scoreCategories.vocabulary'),
        value: subScores.vocabulary,
      },
      {
        key: 'structure',
        label: t('common:scoreCategories.structure'),
        value: subScores.structure,
      },
      { key: 'flow', label: t('common:scoreCategories.flow'), value: subScores.flow },
      { key: 'context', label: t('common:scoreCategories.context'), value: subScores.context },
    ];
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.paragraphHeaderRow}>
          <Text style={styles.progressLabel}>{t('progressParagraph')}</Text>
          <View style={styles.xpPill}>
            <Ionicons name="sparkles" size={12} color={colors.glyph} />
            <Text style={styles.xpPillText}>
              {t('xpAwarded', { xp: paragraphResult.xpAwarded })}
            </Text>
          </View>
        </View>

        <FadeInUp style={styles.heroRingWrap}>
          <ScoreRing
            score={compositeScore}
            size={168}
            strokeWidth={14}
            color={colors.arcane}
            label={t('common:scoreCategories.composite')}
          />
          <View style={styles.proficiencyBadge}>
            <Text style={styles.proficiencyBadgeText}>{paragraphResult.estimatedProficiency}</Text>
          </View>
        </FadeInUp>

        <FadeInUp style={styles.subScoreRow} delay={120}>
          {subScoreEntries.map((entry) => (
            <View key={entry.key} style={styles.subScoreItem}>
              <ScoreRing
                score={entry.value}
                size={56}
                strokeWidth={6}
                color={scoreBandColor(entry.value, colors)}
                valueFontSize={14}
              />
              <Text style={styles.subScoreLabel}>{entry.label}</Text>
            </View>
          ))}
        </FadeInUp>

        <FadeInUp style={[styles.feedbackCard, styles.feedbackCardWorked]} delay={220}>
          <View style={styles.feedbackCardHeader}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={[styles.feedbackCardLabel, { color: colors.success }]}>
              {t('whatWorkedLabel')}
            </Text>
          </View>
          <Text style={styles.feedbackCardText}>{paragraphResult.whatWentWell}</Text>
        </FadeInUp>

        <FadeInUp style={[styles.feedbackCard, styles.feedbackCardPolish]} delay={300}>
          <View style={styles.feedbackCardHeader}>
            <Ionicons name="locate-outline" size={15} color={colors.warning} />
            <Text style={[styles.feedbackCardLabel, { color: colors.warning }]}>
              {t('polishThisLabel')}
            </Text>
          </View>
          <Text style={styles.feedbackCardText}>{paragraphResult.whatNeedsImprovement}</Text>
        </FadeInUp>

        <Pressable
          style={styles.button}
          onPress={() => setStage('optionalWild')}
          accessibilityRole="button"
          accessibilityLabel={t('continue')}
        >
          <Text style={styles.buttonText}>{t('continue')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (stage === 'optionalWild') {
    const wildSubmitDisabled = wildBusy || (wildMode === 'TEXT' ? !wildText.trim() : !wildPhoto);
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.progressLabel}>{t('progressOptionalWild')}</Text>
        <Text style={styles.definition}>
          {t('wildInstruction', { word: understanding?.word ?? t('thisWordFallback') })}
        </Text>

        <View style={styles.modeTabs}>
          <ModeTab
            label={t('modeTabText')}
            icon={wildMode === 'TEXT' ? MODE_ICONS.TEXT.active : MODE_ICONS.TEXT.inactive}
            active={wildMode === 'TEXT'}
            onPress={() => setWildMode('TEXT')}
            disabled={wildBusy}
            styles={styles}
            colors={colors}
          />
          <ModeTab
            label={t('modeTabPhoto')}
            icon={wildMode === 'PHOTO' ? MODE_ICONS.PHOTO.active : MODE_ICONS.PHOTO.inactive}
            active={wildMode === 'PHOTO'}
            onPress={() => setWildMode('PHOTO')}
            disabled={wildBusy}
            styles={styles}
            colors={colors}
          />
        </View>

        {wildMode === 'TEXT' && (
          <TextInput
            style={styles.textArea}
            value={wildText}
            onChangeText={setWildText}
            multiline
            placeholder={t('wildTextPlaceholder')}
            placeholderTextColor={colors.inkMuted}
            editable={!wildBusy}
            accessibilityLabel={t('yourWildLocationLabel')}
          />
        )}

        {wildMode === 'PHOTO' && (
          <View style={styles.wildPhotoSection}>
            <Text style={styles.affordanceText}>{t('wildPhotoInstruction')}</Text>

            {wildPhoto && <Image source={{ uri: wildPhoto.uri }} style={styles.wildPreview} />}

            <View style={styles.photoButtonsRow}>
              <Pressable
                style={styles.photoButton}
                onPress={() => pickWildPhoto('camera')}
                disabled={wildBusy}
                accessibilityRole="button"
                accessibilityLabel={t('takePhoto')}
              >
                <Ionicons name="camera-outline" size={16} color={colors.arcaneSoft} />
                <Text style={styles.affordanceButtonText}>{t('takePhoto')}</Text>
              </Pressable>
              <Pressable
                style={styles.photoButton}
                onPress={() => pickWildPhoto('library')}
                disabled={wildBusy}
                accessibilityRole="button"
                accessibilityLabel={t('choosePhoto')}
              >
                <Ionicons name="images-outline" size={16} color={colors.arcaneSoft} />
                <Text style={styles.affordanceButtonText}>{t('choosePhoto')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {wildError && <Text style={styles.error}>{wildError}</Text>}

        <Pressable
          style={[styles.button, wildSubmitDisabled && styles.buttonDisabled]}
          onPress={() => finishWord(true)}
          disabled={wildSubmitDisabled}
          accessibilityRole="button"
          accessibilityLabel={t('submitAndFinishA11y')}
        >
          {wildBusy ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.buttonText}>{t('submitAndFinish')}</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.affordanceButton, wildBusy && styles.buttonDisabled]}
          onPress={() => finishWord(false)}
          disabled={wildBusy}
          accessibilityRole="button"
          accessibilityLabel={t('skipAndFinishA11y')}
        >
          <Text style={styles.affordanceButtonText}>{t('skipAndFinish')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.arcaneSoft} />
    </View>
  );
}

/** Every stage's AI feedback is 5 named 0-100 dimensions — rendered generically rather than one bespoke layout per stage. */
function ModeTab({
  label,
  icon,
  active,
  onPress,
  disabled,
  styles,
  colors,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  disabled: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.modeTab, active && styles.modeTabActive]}
    >
      <Ionicons name={icon} size={16} color={active ? colors.ink : colors.inkMuted} />
      <Text style={[styles.modeTabText, active && styles.modeTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    flexFill: { flex: 1 },
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      paddingTop: topInset + spacing.xl,
      gap: spacing.lg,
    },
    centered: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.lg,
    },
    error: { color: colors.danger, fontSize: typography.scale.md, textAlign: 'center' },
    errorBackButton: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
    },
    gateContainer: {
      flexGrow: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      padding: spacing.xl,
      paddingTop: topInset + spacing.xxl,
      gap: spacing.lg,
    },
    gateCard: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      alignItems: 'center',
      gap: spacing.sm,
    },
    gateIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: hexToRgba(colors.arcane, 0.16),
      borderWidth: 1,
      borderColor: hexToRgba(colors.arcane, 0.4),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    gateTitle: { color: colors.ink, fontSize: typography.scale.lg, fontWeight: '700' },
    gateSubtitle: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    gateWindowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      marginTop: spacing.md,
    },
    gateWindowConnector: { flex: 1, height: 2, backgroundColor: colors.border, marginBottom: 18 },
    gateWindowCol: { alignItems: 'center', gap: spacing.xs },
    gateWindowDot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gateWindowDotDone: { backgroundColor: colors.success },
    gateWindowDotOpen: {
      backgroundColor: colors.surfaceRaised,
      borderWidth: 2,
      borderColor: colors.arcane,
    },
    gateWindowDotText: { color: colors.inkMuted, fontSize: typography.scale.xs, fontWeight: '700' },
    gateWindowDotTextOpen: { color: colors.arcaneSoft },
    gateWindowLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: '700' },
    gateWindowLabelDone: { color: colors.ink },
    gateNextPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: hexToRgba(colors.arcane, 0.12),
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginTop: spacing.md,
    },
    gateNextPillText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xs,
      fontWeight: '700',
    },
    gateStatsRow: { flexDirection: 'row', width: '100%', gap: spacing.sm },
    gateStatTile: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      gap: 2,
    },
    gateStatValue: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    gateStatLabel: { color: colors.inkMuted, fontSize: typography.scale.xs, fontWeight: '600' },
    gateHomeButton: {
      width: '100%',
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    gatePracticeLink: { paddingVertical: spacing.xs },
    gatePracticeLinkText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.sm,
      fontWeight: '700',
    },
    progressLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    wordTitle: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    clueCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    partOfSpeech: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    definition: { color: colors.ink, fontSize: typography.scale.md },
    lettersRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      justifyContent: 'center',
    },
    letterBox: {
      width: 40,
      height: 48,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    letterBoxFilled: { backgroundColor: colors.surfaceRaised },
    letterBoxFilledText: {
      color: colors.inkMuted,
      fontSize: typography.scale.lg,
      fontWeight: '700',
    },
    letterBoxBlank: {
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.arcaneSoft,
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: '700',
      textAlign: 'center',
    },
    affordanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    affordanceButton: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
    },
    affordanceButtonText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.sm,
      fontWeight: '700',
    },
    affordanceText: { color: colors.inkMuted, fontSize: typography.scale.sm },
    resultCard: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      borderLeftWidth: 3,
      borderLeftColor: colors.glyph,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      gap: 2,
    },
    resultCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    resultCardLabel: {
      color: colors.glyph,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    resultCardText: { color: colors.ink, fontSize: typography.scale.sm },
    paragraphHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    xpPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: hexToRgba(colors.glyph, 0.14),
      borderWidth: 1,
      borderColor: hexToRgba(colors.glyph, 0.4),
      borderRadius: radius.pill,
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
    },
    xpPillText: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
    heroRingWrap: {
      alignSelf: 'center',
      width: 168,
      height: 168,
      marginBottom: spacing.xl,
      position: 'relative',
    },
    proficiencyBadge: {
      position: 'absolute',
      bottom: -14,
      alignSelf: 'center',
      backgroundColor: colors.glyph,
      borderRadius: radius.pill,
      paddingVertical: 4,
      paddingHorizontal: spacing.md,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    // Matches WordMasteryCard's levelBadgeTextMastered -- the same fixed
    // dark ink used everywhere else in the app for text on a gold/glyph
    // background, since that pairing needs a dark label in both themes.
    proficiencyBadgeText: { color: '#181233', fontSize: typography.scale.sm, fontWeight: '700' },
    subScoreRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.xl,
      paddingHorizontal: 2,
    },
    subScoreItem: { alignItems: 'center', gap: spacing.xs },
    subScoreLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: '600' },
    feedbackCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: spacing.md,
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    feedbackCardWorked: {
      backgroundColor: hexToRgba(colors.success, 0.1),
      borderColor: hexToRgba(colors.success, 0.35),
    },
    feedbackCardPolish: {
      backgroundColor: hexToRgba(colors.warning, 0.1),
      borderColor: hexToRgba(colors.warning, 0.35),
    },
    feedbackCardBetter: {
      backgroundColor: hexToRgba(colors.arcaneSoft, 0.1),
      borderColor: hexToRgba(colors.arcaneSoft, 0.35),
    },
    feedbackCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    feedbackCardLabel: {
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    feedbackCardText: { color: colors.ink, fontSize: typography.scale.sm, lineHeight: 20 },
    button: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    feedbackBar: { gap: spacing.sm },
    feedbackText: { fontSize: typography.scale.lg, fontWeight: '700' },
    guessResultHero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
    guessResultBadge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    guessResultBadgeCorrect: { backgroundColor: colors.success },
    guessResultBadgeMiss: { backgroundColor: colors.danger },
    explainButton: { alignSelf: 'flex-start' },
    explainButtonText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.sm,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },

    exampleText: { color: colors.inkMuted, fontSize: typography.scale.sm, fontStyle: 'italic' },
    textArea: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.ink,
      fontSize: typography.scale.md,
      padding: spacing.md,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    textAreaTall: { minHeight: 160 },
    modeTabs: { flexDirection: 'row', gap: spacing.sm },
    modeTab: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      gap: spacing.xs,
    },
    modeTabActive: { backgroundColor: colors.arcane, borderColor: colors.arcane },
    modeTabText: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    modeTabTextActive: { color: colors.ink },
    wildPhotoSection: { gap: spacing.sm },
    wildPreview: {
      width: '100%',
      height: 200,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    photoButtonsRow: { flexDirection: 'row', gap: spacing.sm },
    photoButton: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      gap: spacing.xs,
    },
  });
}
