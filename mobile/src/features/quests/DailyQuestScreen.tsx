import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';
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
import { submitTextEvidence } from '@/services/word-in-the-wild';
import { explainMistake } from '@/services/ali';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { FadeInUp } from '@/components/FadeInUp';
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

export function DailyQuestScreen({ route, navigation }: Props) {
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
  const [wildBusy, setWildBusy] = useState(false);
  const [mistakeExplanation, setMistakeExplanation] = useState<string | null>(null);
  const [mistakeExplanationLoading, setMistakeExplanationLoading] = useState(false);
  const inputRefs = useRef<Record<number, TextInput | null>>({});

  const load = (attemptIdToResume?: string) => {
    if (!accessToken) return;
    setStage('loading');
    startQuest(accessToken, questKey)
      .then((view) => {
        setChallenge(view);
        setAttemptId(view.questAttemptId);
        setStage('guess');
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
    const answer = buildAnswer(challenge);
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
      if (result.isCorrect && result.understanding) {
        setUnderstanding(result.understanding);
      }
      setStage('guessFeedback');
    } catch {
      setStage('error');
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
    } catch {
      setStage('error');
    }
  };

  const onSubmitSentence = async () => {
    if (!accessToken || !attemptId || !sentenceText.trim()) return;
    try {
      const result = await submitSentence(accessToken, attemptId, sentenceText.trim());
      setSentenceResult(result);
      setStage('sentenceFeedback');
    } catch {
      setStage('error');
    }
  };

  const paragraphWordCount = paragraphText.trim().length
    ? paragraphText.trim().split(/\s+/).length
    : 0;
  const paragraphValid = paragraphWordCount >= 30 && paragraphWordCount <= 100;

  const onSubmitParagraph = async () => {
    if (!accessToken || !attemptId || !paragraphValid) return;
    try {
      const result = await submitParagraph(accessToken, attemptId, paragraphText.trim());
      setParagraphResult(result);
      setStage('paragraphFeedback');
    } catch {
      setStage('error');
    }
  };

  const finishWord = async (submitWildEvidence: boolean) => {
    if (!accessToken || !attemptId) return;
    setWildBusy(true);
    try {
      if (submitWildEvidence && wildText.trim()) {
        const mission = await createOptionalWildMission(accessToken, attemptId);
        await submitTextEvidence(accessToken, mission.id, wildText.trim());
      }
      const result = await completeWord(accessToken, attemptId);
      navigation.replace('QuestComplete', result);
    } catch {
      setStage('error');
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
              style={[styles.button, !allBlanksFilled && styles.buttonDisabled]}
              onPress={onSubmitGuess}
              disabled={!allBlanksFilled}
              accessibilityRole="button"
              accessibilityLabel="Submit"
            >
              <Text style={styles.buttonText}>Submit</Text>
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
            {guessFeedback.aliQuickReaction && (
              <Text style={styles.aliReactionText}>{guessFeedback.aliQuickReaction}</Text>
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
          style={[styles.button, !sentenceText.trim() && styles.buttonDisabled]}
          onPress={onSubmitSentence}
          disabled={!sentenceText.trim()}
          accessibilityRole="button"
          accessibilityLabel="Submit"
        >
          <Text style={styles.buttonText}>Submit</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (stage === 'sentenceFeedback' && sentenceResult) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.progressLabel}>Sentence — {sentenceResult.xpAwarded} XP</Text>
        <FadeInUp style={styles.feedbackGroup}>
          <ScoreList scores={sentenceResult.scores as unknown as Record<string, number>} />
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
          style={[styles.button, !paragraphValid && styles.buttonDisabled]}
          onPress={onSubmitParagraph}
          disabled={!paragraphValid}
          accessibilityRole="button"
          accessibilityLabel="Submit"
        >
          <Text style={styles.buttonText}>Submit</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (stage === 'paragraphFeedback' && paragraphResult) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.progressLabel}>Paragraph — {paragraphResult.xpAwarded} XP</Text>
        <FadeInUp style={styles.feedbackGroup}>
          <ScoreList scores={paragraphResult.scores as unknown as Record<string, number>} />
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
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.progressLabel}>Word in the Wild (optional)</Text>
        <Text style={styles.definition}>
          Spotted “{understanding?.word ?? 'this word'}” out in the real world — a sign, a menu, a
          conversation? Tell ALI about it, or skip.
        </Text>
        <TextInput
          style={styles.textArea}
          value={wildText}
          onChangeText={setWildText}
          multiline
          placeholder="Where did you see or hear it?"
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel="Where you saw or heard it"
        />
        <Pressable
          style={[styles.button, (wildBusy || !wildText.trim()) && styles.buttonDisabled]}
          onPress={() => finishWord(true)}
          disabled={wildBusy || !wildText.trim()}
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
function ScoreList({ scores }: { scores: Record<string, number> }) {
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

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
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
  aliReactionText: {
    color: colors.arcaneSoft,
    fontSize: typography.scale.sm,
    fontStyle: 'italic',
  },
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
});
