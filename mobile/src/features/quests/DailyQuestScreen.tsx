import { useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  acknowledgeUnderstanding,
  completeWord,
  createOptionalWildMission,
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
  type UnderstandingContent,
} from '@/services/quests';
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

export function DailyQuestScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { questKey } = route.params;
  const accessToken = useAuthStore((s) => s.accessToken);
  const [stage, setStage] = useState<Stage>('loading');
  const [errorMessage, setErrorMessage] = useState(
    'Could not load your Quest. Check your connection and try again.',
  );
  const [challenge, setChallenge] = useState<ChallengeView | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [letters, setLetters] = useState<Record<number, string>>({});
  const [guessFeedback, setGuessFeedback] = useState<GuessFeedback | null>(null);
  const [understanding, setUnderstanding] = useState<UnderstandingContent | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [synonym, setSynonym] = useState<string | null>(null);
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
    if (!accessToken || !attemptId) return;
    try {
      const result = await requestHint(accessToken, attemptId);
      setHint(result.hint ?? 'No hint available for this word.');
    } catch {
      // Non-critical affordance — a failed hint request shouldn't interrupt the guess itself.
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
      setMistakeExplanation('Could not get an explanation right now — try again in a moment.');
    } finally {
      setMistakeExplanationLoading(false);
    }
  };

  const onSynonym = async () => {
    if (!accessToken || !attemptId) return;
    try {
      const result = await requestSynonym(accessToken, attemptId);
      setSynonym(result.synonym ?? 'No synonym available for this word.');
    } catch {
      // Non-critical affordance — same reasoning as onHint.
    }
  };

  const onRevealLetter = async () => {
    if (!accessToken || !attemptId) return;
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
      setWildError(
        `WordQuest needs ${source === 'camera' ? 'camera' : 'photo library'} access to do this.`,
      );
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
        const target = await createPhotoUploadTarget(accessToken, mission.id, wildPhoto.contentType);
        await uploadPhotoToR2(target.uploadUrl, wildPhoto.uri, wildPhoto.contentType);
        await submitPhotoEvidence(accessToken, mission.id, target.key);
      } else if (submitWildEvidence && wildMode === 'TEXT' && wildText.trim()) {
        const mission = await createOptionalWildMission(accessToken, attemptId);
        await submitTextEvidence(accessToken, mission.id, wildText.trim());
      }
      const result = await completeWord(accessToken, attemptId);
      navigation.replace('QuestComplete', result);
    } catch (err) {
      setWildError(err instanceof ApiError ? err.message : 'Could not submit your evidence.');
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
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{errorMessage}</Text>
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
          <Text style={styles.progressLabel}>Guess</Text>

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
                onKeyPress={({ nativeEvent }) => nativeEvent.key === 'Backspace' && onBackspace(i)}
                maxLength={1}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={stage === 'guess'}
                accessibilityLabel={`Letter ${i + 1}`}
              />
            ) : (
              <View key={i} style={[styles.letterBox, styles.letterBoxFilled]}>
                <Text style={styles.letterBoxFilledText}>{token}</Text>
              </View>
            ),
          )}
        </View>

        {stage === 'guess' && (
          <>
            <View style={styles.affordanceRow}>
              <Pressable
                style={styles.affordanceButton}
                onPress={onHint}
                accessibilityRole="button"
                accessibilityLabel="Hint"
              >
                <Text style={styles.affordanceButtonText}>Hint</Text>
              </Pressable>
              <Pressable
                style={styles.affordanceButton}
                onPress={onSynonym}
                accessibilityRole="button"
                accessibilityLabel="Synonym"
              >
                <Text style={styles.affordanceButtonText}>Synonym</Text>
              </Pressable>
              <Pressable
                style={styles.affordanceButton}
                onPress={onRevealLetter}
                accessibilityRole="button"
                accessibilityLabel="Reveal a letter"
              >
                <Text style={styles.affordanceButtonText}>Reveal a letter</Text>
              </Pressable>
            </View>
            {hint && <Text style={styles.affordanceText}>Hint: {hint}</Text>}
            {synonym && <Text style={styles.affordanceText}>Synonym: {synonym}</Text>}

            <Pressable
              style={[styles.button, (!allBlanksFilled || guessBusy) && styles.buttonDisabled]}
              onPress={onSubmitGuess}
              disabled={!allBlanksFilled || guessBusy}
              accessibilityRole="button"
              accessibilityLabel="Submit"
            >
              {guessBusy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonText}>Submit</Text>}
            </Pressable>
          </>
        )}

        {stage === 'guessFeedback' && guessFeedback && (
          <FadeInUp style={styles.feedbackBar}>
            <Text
              style={[
                styles.feedbackText,
                { color: guessFeedback.isCorrect ? colors.success : colors.danger },
              ]}
            >
              {guessFeedback.timedOut
                ? "Time's up."
                : guessFeedback.isCorrect
                  ? `Correct! +${guessFeedback.xpAwarded} XP`
                  : 'Not quite.'}
            </Text>
            {!guessFeedback.isCorrect && (
              <Text style={styles.revealText}>
                The word was <Text style={styles.revealWord}>{guessFeedback.correctAnswer}</Text>
              </Text>
            )}
            {!guessFeedback.isCorrect && !guessFeedback.timedOut && !mistakeExplanation && (
              <Pressable
                style={styles.explainButton}
                onPress={onExplainMistake}
                disabled={mistakeExplanationLoading}
                accessibilityRole="button"
                accessibilityLabel="Why was this wrong?"
              >
                {mistakeExplanationLoading ? (
                  <ActivityIndicator color={colors.arcaneSoft} size="small" />
                ) : (
                  <Text style={styles.explainButtonText}>Why was this wrong?</Text>
                )}
              </Pressable>
            )}
            {mistakeExplanation && (
              <Text style={styles.mistakeExplanationText}>{mistakeExplanation}</Text>
            )}
            <Pressable
              style={styles.button}
              onPress={guessFeedback.isCorrect ? () => setStage('understanding') : onRetryGuess}
              accessibilityRole="button"
              accessibilityLabel={guessFeedback.isCorrect ? 'Continue' : 'Try again'}
            >
              <Text style={styles.buttonText}>
                {guessFeedback.isCorrect ? 'Continue' : 'Try again'}
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
        <Text style={styles.progressLabel}>Understanding</Text>
        <Text style={styles.wordTitle}>{understanding.word}</Text>
        <Text style={styles.partOfSpeech}>{understanding.partOfSpeech}</Text>
        {understanding.phoneticRepresentation && (
          <Text style={styles.affordanceText}>{understanding.phoneticRepresentation}</Text>
        )}
        <Text style={styles.definition}>{understanding.definition}</Text>
        {understanding.synonyms.length > 0 && (
          <Text style={styles.affordanceText}>Synonyms: {understanding.synonyms.join(', ')}</Text>
        )}
        <Text style={styles.exampleText}>{understanding.exampleSentence}</Text>

        <Pressable
          style={styles.button}
          onPress={onContinueToSentence}
          accessibilityRole="button"
          accessibilityLabel="I understand — continue"
        >
          <Text style={styles.buttonText}>I understand — continue</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (stage === 'sentence') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.progressLabel}>Sentence</Text>
        <Text style={styles.definition}>
          Write one sentence using “{understanding?.word ?? 'the word'}”.
        </Text>
        <TextInput
          style={styles.textArea}
          value={sentenceText}
          onChangeText={setSentenceText}
          multiline
          placeholder="Type your sentence..."
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel="Your sentence"
        />
        <Pressable
          style={[styles.button, (!sentenceText.trim() || sentenceBusy) && styles.buttonDisabled]}
          onPress={onSubmitSentence}
          disabled={!sentenceText.trim() || sentenceBusy}
          accessibilityRole="button"
          accessibilityLabel="Submit"
        >
          {sentenceBusy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonText}>Submit</Text>}
        </Pressable>
      </ScrollView>
    );
  }

  if (stage === 'sentenceFeedback' && sentenceResult) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.progressLabel}>Sentence — {sentenceResult.xpAwarded} XP</Text>
        <FadeInUp style={styles.feedbackGroup}>
          <ScoreList scores={sentenceResult.scores as unknown as Record<string, number>} styles={styles} />
          <Text style={styles.definition}>{sentenceResult.whatWentWell}</Text>
          <Text style={styles.affordanceText}>{sentenceResult.whatNeedsImprovement}</Text>
          {sentenceResult.betterVersion && (
            <Text style={styles.exampleText}>{sentenceResult.betterVersion}</Text>
          )}
        </FadeInUp>
        <Pressable
          style={styles.button}
          onPress={() => setStage('paragraph')}
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (stage === 'paragraph') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.progressLabel}>Paragraph</Text>
        <Text style={styles.definition}>
          Write a 30-100 word paragraph using “{understanding?.word ?? 'the word'}”.
        </Text>
        <TextInput
          style={[styles.textArea, styles.textAreaTall]}
          value={paragraphText}
          onChangeText={setParagraphText}
          multiline
          placeholder="Type your paragraph..."
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel="Your paragraph"
        />
        <Text style={styles.affordanceText}>{paragraphWordCount} / 30-100 words</Text>
        <Pressable
          style={[styles.button, (!paragraphValid || paragraphBusy) && styles.buttonDisabled]}
          onPress={onSubmitParagraph}
          disabled={!paragraphValid || paragraphBusy}
          accessibilityRole="button"
          accessibilityLabel="Submit"
        >
          {paragraphBusy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonText}>Submit</Text>}
        </Pressable>
      </ScrollView>
    );
  }

  if (stage === 'paragraphFeedback' && paragraphResult) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.progressLabel}>Paragraph — {paragraphResult.xpAwarded} XP</Text>
        <FadeInUp style={styles.feedbackGroup}>
          <ScoreList scores={paragraphResult.scores as unknown as Record<string, number>} styles={styles} />
          <Text style={styles.affordanceText}>
            Estimated proficiency: {paragraphResult.estimatedProficiency}
          </Text>
          <Text style={styles.definition}>{paragraphResult.whatWentWell}</Text>
          <Text style={styles.affordanceText}>{paragraphResult.whatNeedsImprovement}</Text>
        </FadeInUp>
        <Pressable
          style={styles.button}
          onPress={() => setStage('optionalWild')}
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (stage === 'optionalWild') {
    const wildSubmitDisabled = wildBusy || (wildMode === 'TEXT' ? !wildText.trim() : !wildPhoto);
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.progressLabel}>Word in the Wild (optional)</Text>
        <Text style={styles.definition}>
          Spotted “{understanding?.word ?? 'this word'}” out in the real world — a sign, a menu, a
          conversation? Tell ALI about it, or skip.
        </Text>

        <View style={styles.modeTabs}>
          <ModeTab
            label="Text"
            icon={wildMode === 'TEXT' ? MODE_ICONS.TEXT.active : MODE_ICONS.TEXT.inactive}
            active={wildMode === 'TEXT'}
            onPress={() => setWildMode('TEXT')}
            disabled={wildBusy}
            styles={styles}
            colors={colors}
          />
          <ModeTab
            label="Photo"
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
            placeholder="Where did you see or hear it?"
            placeholderTextColor={colors.inkMuted}
            editable={!wildBusy}
            accessibilityLabel="Where you saw or heard it"
          />
        )}

        {wildMode === 'PHOTO' && (
          <View style={styles.wildPhotoSection}>
            <Text style={styles.affordanceText}>
              Take or choose a screenshot proving you actually used the word — a text you sent, a
              post, a caption.
            </Text>

            {wildPhoto && <Image source={{ uri: wildPhoto.uri }} style={styles.wildPreview} />}

            <View style={styles.photoButtonsRow}>
              <Pressable
                style={styles.photoButton}
                onPress={() => pickWildPhoto('camera')}
                disabled={wildBusy}
                accessibilityRole="button"
                accessibilityLabel="Take Photo"
              >
                <Ionicons name="camera-outline" size={16} color={colors.arcaneSoft} />
                <Text style={styles.affordanceButtonText}>Take Photo</Text>
              </Pressable>
              <Pressable
                style={styles.photoButton}
                onPress={() => pickWildPhoto('library')}
                disabled={wildBusy}
                accessibilityRole="button"
                accessibilityLabel="Choose Photo"
              >
                <Ionicons name="images-outline" size={16} color={colors.arcaneSoft} />
                <Text style={styles.affordanceButtonText}>Choose Photo</Text>
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
          accessibilityLabel="Submit and finish"
        >
          {wildBusy ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.buttonText}>Submit & finish</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.affordanceButton, wildBusy && styles.buttonDisabled]}
          onPress={() => finishWord(false)}
          disabled={wildBusy}
          accessibilityRole="button"
          accessibilityLabel="Skip and finish"
        >
          <Text style={styles.affordanceButtonText}>Skip & finish</Text>
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
function ScoreList({
  scores,
  styles,
}: {
  scores: Record<string, number>;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.clueCard}>
      {Object.entries(scores).map(([key, value]) => (
        <View key={key} style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>{key}</Text>
          <Text style={styles.scoreValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

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
  },
  error: { color: colors.danger, fontSize: typography.scale.md, textAlign: 'center' },
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
  lettersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center' },
  letterBox: {
    width: 40,
    height: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterBoxFilled: { backgroundColor: colors.surfaceRaised },
  letterBoxFilledText: { color: colors.inkMuted, fontSize: typography.scale.lg, fontWeight: '700' },
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
  button: {
    backgroundColor: colors.arcane,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  feedbackBar: { gap: spacing.sm },
  feedbackGroup: { gap: spacing.lg },
  feedbackText: { fontSize: typography.scale.md, fontWeight: '700' },
  revealText: { color: colors.inkMuted, fontSize: typography.scale.sm },
  revealWord: { color: colors.ink, fontWeight: '700' },
  explainButton: { alignSelf: 'flex-start' },
  explainButtonText: {
    color: colors.arcaneSoft,
    fontSize: typography.scale.sm,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  mistakeExplanationText: {
    color: colors.inkMuted,
    fontSize: typography.scale.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: spacing.sm,
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
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scoreLabel: {
    color: colors.inkMuted,
    fontSize: typography.scale.sm,
    textTransform: 'capitalize',
  },
  scoreValue: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
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
