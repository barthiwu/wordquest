import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  getWordDuelState,
  joinWordDuelQueue,
  leaveWordDuelQueue,
  revealWordDuelClue,
  sendWordDuelMessage,
  submitWordDuelAnswer,
  type WordDuelChatMessage,
  type WordDuelStateView,
} from '@/services/wordDuel';
import { ApiError } from '@/services/apiClient';
import { trackEvent } from '@/services/analyticsClient';
import { useAuthStore } from '@/state/authStore';
import type { AliExpressionCue } from '@/services/aliExpression';
import { AliBubble } from '@/components/AliBubble';
import { AliDeferredRecap } from '@/components/AliDeferredRecap';
import { DuelTicketResult } from '@/components/DuelTicketResult';
import { WordDuelFeedbackPrompt } from '@/components/WordDuelFeedbackPrompt';
import { DuelPrepJourney } from './DuelPrepJourney';
import { BackButton } from '@/components/BackButton';
import { ProtoGameHeader } from '@/features/proto/ProtoGameHeader';
import { useIsPrototype } from '@/state/uiVersionStore';
import { ProtoDuelNoOpponent, ProtoDuelSearch } from '@/features/proto/ProtoDuelSearch';
import { CountdownRing } from '@/components/CountdownRing';
import { LetterBoxInput } from '@/components/LetterBoxInput';
import { AvatarActionMenu } from '@/components/AvatarActionMenu';
import { AvatarBubble } from '@/components/AvatarBubble';
import { DuelChat } from '@/components/DuelChat';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'WordDuel'>;

type Phase = 'loading' | 'waiting' | 'active' | 'no-opponent' | 'complete' | 'error';

/** How often to poll the live match state (spec §6/§11's deliberately
 * chosen REST + client-polling transport, not a WebSocket gateway —
 * see WordDuelService's doc comment). Short enough that the opponent
 * joining/answering/finishing feels prompt; well under the controller's
 * 120-req/min budget on the state endpoint. Clue reveals themselves are
 * player-triggered (requestClue/revealWordDuelClue), not polled for. */
const POLL_INTERVAL_MS = 2000;

/** How long after the match ends the chat keeps updating (mirrors the server's POST_MATCH_GRACE_MINUTES). */
const CHAT_AFTER_MATCH_MS = 5 * 60_000;
/** How long a correct/incorrect flash stays up before clearing itself —
 * a duel doesn't pause for the player to hit "Continue" the way
 * ScrambleQuest does, since the opponent isn't waiting either. */
const FEEDBACK_DISPLAY_MS = 1400;
/** Mirrors backend WORD_DUEL_CONFIG.MATCH_DURATION_MINUTES -- the match
 * clock only ever gives this screen an absolute deadline (matchEndsAt),
 * not a total duration or start time, so the countdown ring's "how much
 * of the match is left" fraction needs its own denominator. If the API
 * ever adds a match-duration/started-at field, prefer that over this. */
const MATCH_DURATION_SECONDS = 5 * 60;
/** Same "Bold Modern" design-canvas language ScrambleQuest/Complete It
 * use -- kept at 30s here (not the usual 10s) since a 5-minute match
 * clock needs a longer runway to feel like a real warning. */
const URGENT_THRESHOLD_SECONDS = 30;
/** The "Clues" button always names the SPECIFIC clue it's about to
 * reveal next (2026-09-30 spec) rather than a generic "Clues (N left)"
 * label -- indexed by `state.current.cluesRevealed`, same fixed order
 * as the backend's resolveClue (CATEGORY, SYNONYM, FIRST_LAST, EXAMPLE,
 * LETTERS). Translation keys, not display strings themselves. */
const CLUE_NAME_KEYS = [
  'clueNames.category',
  'clueNames.synonym',
  'clueNames.firstLast',
  'clueNames.example',
  'clueNames.letters',
] as const;

interface Feedback {
  isCorrect: boolean;
  correctAnswer: string;
  xpAwarded: number;
}

/**
 * Word Duel (spec §6) — a two-player real-time race. Unlike
 * ScrambleQuest/Complete It there's no per-word timer, only the
 * match-wide countdown — but clues ARE player-triggered here too (a
 * "Clues" button), not automatic: the meaning and the word's letter
 * count are always shown, and tapping Clues reveals, one at a time,
 * category, synonym, first & last letter, an example sentence, then
 * 60% of the letters (2026-09-30 Barth spec, "This makes it more like
 * a game, and less like an exam hall" — supersedes the 2026-09-29
 * synonym+hint two-clue design). The "Lock In" button (same spec,
 * renamed from "Submit" — "That language matters... 'Lock in' feels
 * like a game decision") is always available the moment there's any
 * text typed, with or without a single clue revealed.
 * This screen's countdown/opponent progress are refreshed by polling,
 * not a WebSocket push — see POLL_INTERVAL_MS above.
 */
export function WordDuelScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['wordDuel', 'arcade', 'scrambleQuest']);
  const { t: tp } = useTranslation('proto');
  const proto = useIsPrototype();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userAvatarUrl = useAuthStore((s) => s.user?.avatarUrl ?? null);
  const userUsername = useAuthStore((s) => s.user?.username ?? null);

  const [phase, setPhase] = useState<Phase>('loading');
  const [state, setState] = useState<WordDuelStateView | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [revealingClue, setRevealingClue] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aliBubble, setAliBubble] = useState<{
    id: number;
    message: string;
    expression: AliExpressionCue;
  } | null>(null);
  const aliBubbleCounter = useRef(0);
  // Avatar-tap popup for the opponent -- only ever opened from the
  // COMPLETED result screen below, since opponent identity is withheld
  // by the backend entirely until then (WordDuelOpponentView's doc
  // comment).
  const [opponentMenuOpen, setOpponentMenuOpen] = useState(false);

  // In-game chat. Messages arrive on the same poll as the match state (the
  // poll sends the highest seq it has), and are merged here by id so a
  // re-fetch never duplicates one. Unread counts only the opponent's
  // messages that landed while the panel was closed.
  const [chatMessages, setChatMessages] = useState<WordDuelChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [chatUnavailable, setChatUnavailable] = useState(false);
  const chatSeqRef = useRef(0);
  const chatIdsRef = useRef<Set<string>>(new Set());
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  const completeAtRef = useRef<number | null>(null);

  // Telemetry (spec §4B/§12) — refs so the unmount cleanup below always
  // reads the CURRENT phase/state rather than whatever was in scope
  // when that effect first ran; a plain render-time assignment (not an
  // effect) keeps this cheap and always up to date for a cleanup
  // function that only ever runs once, on unmount.
  const latestRef = useRef({ phase, state });
  latestRef.current = { phase, state };
  const trackedWordIndexRef = useRef<number | null>(null);

  const mergeChat = useCallback((incoming: WordDuelChatMessage[]) => {
    const fresh = incoming.filter((m) => !chatIdsRef.current.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => {
      chatIdsRef.current.add(m.id);
      chatSeqRef.current = Math.max(chatSeqRef.current, m.seq);
    });
    setChatMessages((prev) => [...prev, ...fresh].sort((a, b) => a.seq - b.seq));
    if (!chatOpenRef.current) {
      const fromOpponent = fresh.filter((m) => !m.mine).length;
      if (fromOpponent > 0) setChatUnread((n) => n + fromOpponent);
    }
  }, []);

  const applyState = useCallback(
    (view: WordDuelStateView) => {
      if (view.chat) mergeChat(view.chat);
      setState(view);
      if (view.status === 'WAITING') setPhase('waiting');
      else if (view.status === 'ACTIVE') setPhase('active');
      else if (view.status === 'COMPLETED') {
        if (completeAtRef.current === null) completeAtRef.current = Date.now();
        setPhase('complete');
      } else setPhase('no-opponent'); // ABANDONED — this player's own stale queue entry
    },
    [mergeChat],
  );

  const join = useCallback(async () => {
    if (!accessToken) return;
    setPhase('loading');
    setFeedback(null);
    setAnswer('');
    // A new match starts a new conversation.
    setChatMessages([]);
    setChatUnread(0);
    setChatOpen(false);
    setChatUnavailable(false);
    chatSeqRef.current = 0;
    chatIdsRef.current = new Set();
    completeAtRef.current = null;
    try {
      const view = await joinWordDuelQueue(accessToken);
      applyState(view);
    } catch {
      setPhase('error');
    }
  }, [accessToken, applyState]);

  useEffect(() => {
    join();
  }, [join]);

  // DUEL_VIEWED / DUEL_ABANDONED (spec §12) — mount/unmount is the only
  // reliable signal the CLIENT has for "the player opened this screen"
  // and "the player left mid-match"; the backend has no visibility into
  // either (it only ever sees API calls, not navigation). Abandonment is
  // reported only for WAITING/ACTIVE — leaving from 'complete', 'error',
  // or 'no-opponent' isn't abandoning a match, there either isn't one
  // (yet) or it's already over.
  useEffect(() => {
    trackEvent('DUEL_VIEWED', undefined, 'WordDuel');
    return () => {
      const { phase: finalPhase, state: finalState } = latestRef.current;
      if (finalPhase === 'waiting' || finalPhase === 'active') {
        trackEvent(
          'DUEL_ABANDONED',
          { matchId: finalState?.matchId ?? null, wordIndex: finalState?.wordIndex ?? null },
          'WordDuel',
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only, by design.
  }, []);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  // Polls the live match while there's anything worth watching for —
  // an opponent joining, clues revealing, or the match ending. Silent
  // on a failed tick (a transient network hiccup shouldn't flash an
  // error over an otherwise-fine match).
  useEffect(() => {
    // After the final bell the poll only keeps running while the chat is
    // open (players can still say "gg" for a few minutes).
    const chatStillOpen =
      phase === 'complete' &&
      chatOpen &&
      completeAtRef.current !== null &&
      Date.now() - completeAtRef.current < CHAT_AFTER_MATCH_MS;
    if (!accessToken || !state || (phase !== 'waiting' && phase !== 'active' && !chatStillOpen)) {
      return undefined;
    }
    const matchId = state.matchId;
    const interval = setInterval(async () => {
      try {
        const fresh = await getWordDuelState(accessToken, matchId, chatSeqRef.current);
        applyState(fresh);
      } catch {
        // transient — next tick will retry
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [accessToken, state, phase, chatOpen, applyState]);

  // Cosmetic match countdown, ticked from the server-issued matchEndsAt.
  useEffect(() => {
    if (phase !== 'active' || !state?.matchEndsAt) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [phase, state?.matchEndsAt]);

  // DUEL_WORD_PRESENTED (spec §12) — fires once per distinct word, keyed
  // on wordIndex, so the 2s poll (POLL_INTERVAL_MS) re-fetching the SAME
  // word never double-counts it.
  useEffect(() => {
    if (phase !== 'active' || !state?.current) return;
    if (trackedWordIndexRef.current === state.wordIndex) return;
    trackedWordIndexRef.current = state.wordIndex;
    trackEvent('DUEL_WORD_PRESENTED', { wordIndex: state.wordIndex }, 'WordDuel');
  }, [phase, state]);

  const handleSubmit = async () => {
    if (!accessToken || !state || submitting || !answer.trim()) return;
    trackEvent(
      'LOCK_IN_PRESSED',
      { wordIndex: state.wordIndex, cluesUsed: state.current?.cluesRevealed ?? 0 },
      'WordDuel',
    );
    setSubmitting(true);
    const matchId = state.matchId;
    const submittedAnswer = answer;
    try {
      const result = await submitWordDuelAnswer(accessToken, matchId, submittedAnswer);
      applyState(result.state);
      setAnswer('');
      setFeedback({
        isCorrect: result.isCorrect,
        correctAnswer: result.correctAnswer,
        xpAwarded: result.xpAwarded,
      });
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), FEEDBACK_DISPLAY_MS);
      if (result.aliQuickReaction && result.aliQuickExpression) {
        aliBubbleCounter.current += 1;
        setAliBubble({
          id: aliBubbleCounter.current,
          message: result.aliQuickReaction,
          expression: result.aliQuickExpression,
        });
      }
    } catch (err) {
      // A raced/duplicate submission (409, two taps or a slow retry) or
      // an answer that arrived just as the match ended (400) both just
      // mean the server has moved on — refresh state rather than
      // showing a hard error over what's really a timing race.
      if (err instanceof ApiError && (err.status === 409 || err.status === 400)) {
        try {
          const fresh = await getWordDuelState(accessToken, matchId);
          applyState(fresh);
        } catch (refreshErr) {
          trackEvent(
            'GAMEPLAY_ERROR',
            {
              step: 'duelAnswerRefetchAfterRace',
              status: refreshErr instanceof ApiError ? refreshErr.status : undefined,
            },
            'WordDuel',
          );
          setPhase('error');
        }
      } else {
        trackEvent(
          'GAMEPLAY_ERROR',
          { step: 'duelAnswerSubmit', status: err instanceof ApiError ? err.status : undefined },
          'WordDuel',
        );
        setPhase('error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Player-triggered clue reveal (the "Clues" button, 2026-09-29 spec) —
  // same CAS-guarded server endpoint shape as ScrambleQuest's hint
  // button; a failed/raced tap (409, two taps in flight) just means
  // another request already claimed this reveal, so it's silently
  // dropped rather than shown as an error, same treatment handleSubmit
  // gives a raced answer.
  const handleRevealClue = async () => {
    if (!accessToken || !state || revealingClue) return;
    if (!state.current || state.current.cluesRevealed >= state.current.maxClues) return;
    trackEvent(
      'CLUE_BUTTON_PRESSED',
      { wordIndex: state.wordIndex, clueNumber: state.current.cluesRevealed + 1 },
      'WordDuel',
    );
    setRevealingClue(true);
    try {
      const fresh = await revealWordDuelClue(accessToken, state.matchId);
      applyState(fresh);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Lost the race — another tap already revealed this clue.
      } else if (err instanceof ApiError && err.status === 400) {
        // The match ended as the clue was tapped: show the real state
        // (usually the results), not a dead error screen.
        try {
          applyState(await getWordDuelState(accessToken, state.matchId));
        } catch {
          setPhase('error');
        }
      } else {
        setPhase('error');
      }
    } finally {
      setRevealingClue(false);
    }
  };

  // Sends a chat message. Resolves when the server accepted it; rejects with
  // a player-safe message (filtered language, too fast, blocked...) that the
  // chat panel shows under the box.
  const handleSendChat = async (body: string) => {
    if (!accessToken || !state) return;
    try {
      const message = await sendWordDuelMessage(accessToken, state.matchId, body);
      mergeChat([message]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setChatUnavailable(true);
      throw new Error(err instanceof ApiError ? err.message : '');
    }
  };

  const toggleChat = () => {
    setChatOpen((open) => {
      if (!open) setChatUnread(0);
      return !open;
    });
  };

  // Leaving the search closes the waiting match on the server, so the next
  // player isn't paired with an empty seat for five minutes.
  const onCancelSearch = () => {
    if (accessToken && state?.matchId) {
      leaveWordDuelQueue(accessToken, state.matchId).catch(() => undefined);
    }
    navigation.goBack();
  };

  if (phase === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{t('genericError')}</Text>
      </View>
    );
  }

  if (phase === 'waiting') {
    if (proto) {
      return (
        <ProtoDuelSearch
          title={t('waitingTitle')}
          subtitle={t('waitingSubtitle')}
          wordTipLabel={t('wordTipLabel')}
          cancelLabel={t('cancelSearch')}
          onCancel={onCancelSearch}
        />
      );
    }
    return (
      <DuelPrepJourney
        colors={colors}
        title={t('waitingTitle')}
        subtitle={t('waitingSubtitle')}
        wordTipLabel={t('wordTipLabel')}
        cancelLabel={t('cancelSearch')}
        onCancel={onCancelSearch}
      />
    );
  }

  if (phase === 'no-opponent') {
    if (proto) {
      return (
        <ProtoDuelNoOpponent
          title={t('noOpponentTitle')}
          subtitle={t('noOpponentSubtitle')}
          retryLabel={t('tryAgain')}
          backLabel={t('arcade:backToPlay')}
          onRetry={join}
          onBack={() => navigation.goBack()}
        />
      );
    }
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />

        {/* "No opponent found" hero -- Design canvas review, Sept 2026
            ("WordQuest Arcade Game Logos" artifact, Option A): the
            crossed-quills Word Duel mark in a glowing badge with two
            sparkle accents, replacing the bare title+subtitle the
            screen used to show here. */}
        <View style={styles.noOpponentIconOuter}>
          <Svg width={120} height={120} viewBox="0 0 120 120" style={StyleSheet.absoluteFillObject}>
            <Defs>
              <RadialGradient id="noOpponentGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={colors.arcane} stopOpacity={0.35} />
                <Stop offset="70%" stopColor={colors.arcane} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={60} cy={60} r={60} fill="url(#noOpponentGlow)" />
          </Svg>
          <View
            style={[styles.noOpponentSparkle, { top: 2, right: 10, backgroundColor: colors.glyph }]}
          />
          <View
            style={[
              styles.noOpponentSparkle,
              { bottom: 8, left: 4, backgroundColor: colors.arcaneSoft },
            ]}
          />
          <View style={styles.noOpponentBadge}>
            <Svg width={52} height={52} viewBox="0 0 100 100">
              <Line
                x1={26}
                y1={26}
                x2={74}
                y2={74}
                stroke={colors.glyph}
                strokeWidth={7}
                strokeLinecap="round"
              />
              <Path d="M74,74 L84,78 L78,84 Z" fill={colors.glyph} />
              <Line
                x1={74}
                y1={26}
                x2={26}
                y2={74}
                stroke={colors.arcaneSoft}
                strokeWidth={7}
                strokeLinecap="round"
              />
              <Path d="M26,74 L16,78 L22,84 Z" fill={colors.arcaneSoft} />
            </Svg>
          </View>
        </View>

        <Text style={styles.title}>{t('noOpponentTitle')}</Text>
        <Text style={styles.subtitle}>{t('noOpponentSubtitle')}</Text>

        <View style={styles.noOpponentButtonCol}>
          <Pressable
            style={styles.button}
            onPress={join}
            accessibilityRole="button"
            accessibilityLabel={t('tryAgain')}
          >
            <Text style={styles.buttonText}>{t('tryAgain')}</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('arcade:backToPlay')}
          >
            <Text style={styles.secondaryButtonText}>{t('arcade:backToPlay')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === 'complete' && state?.result) {
    const { result } = state;
    const outcomeTitle =
      result.winnerId === null
        ? t('resultDrawTitle')
        : result.youWon
          ? t('resultWinTitle')
          : t('resultLoseTitle');
    // Only the tiebreak note is left as an extra line -- the opponent's
    // score/XP now live on the ticket itself (DuelTicketResult's right
    // avatar column), not a caption underneath.
    const extraLines = result.tieBreakReason ? [t('resultTiebreakNote')] : [];
    // Present only once the match is COMPLETED (see WordDuelOpponentView's
    // doc comment) -- undefined/absent during WAITING/ACTIVE, which this
    // phase never renders anyway.
    const opponentIdentity =
      state.opponent?.userId && state.opponent.username
        ? {
            userId: state.opponent.userId,
            username: state.opponent.username,
            avatarUrl: state.opponent.avatarUrl ?? null,
          }
        : null;
    return (
      <ScrollView style={styles.flexFill} contentContainerStyle={styles.centeredScrollContent}>
        <DuelTicketResult
          colors={colors}
          eyebrow={t('resultTicketEyebrow')}
          title={outcomeTitle}
          subtitle={t('resultCorrectOfTotal', {
            correct: state.correctCount,
            total: state.wordsTotal,
          })}
          youCorrect={state.correctCount}
          opponentCorrect={state.opponent?.correctCount ?? 0}
          youAvatarUrl={userAvatarUrl}
          youLabel={t('youLabel')}
          youXpText={t('xpLabel', { xp: state.totalXp })}
          opponentAvatarUrl={opponentIdentity?.avatarUrl}
          opponentUsername={opponentIdentity?.username ?? t('opponentLabel')}
          opponentXpText={t('xpLabel', { xp: state.opponent?.totalXp ?? 0 })}
          onPressOpponent={opponentIdentity ? () => setOpponentMenuOpen(true) : undefined}
          opponentAccessibilityLabel={
            opponentIdentity
              ? t('friends:popup.avatarLabel', { username: opponentIdentity.username })
              : undefined
          }
          stats={[
            {
              icon: 'flame',
              text: t('scrambleQuest:sessionLongestStreak', { streak: state.longestStreak }),
            },
          ]}
          extraLines={extraLines}
          primaryLabel={t('playAgain')}
          onPrimary={join}
          secondaryLabel={t('arcade:backToPlay')}
          onSecondary={() => navigation.goBack()}
        />
        <AliDeferredRecap
          reactions={[
            ...(state.streakReaction ? [state.streakReaction] : []),
            ...state.deferredAliReactions,
          ]}
          colors={colors}
          style={styles.deferredRecap}
        />
        <WordDuelFeedbackPrompt matchId={state.matchId} />
        {opponentIdentity && (
          <View style={styles.chatWrap}>
            <DuelChat
              colors={colors}
              messages={chatMessages}
              opponentName={opponentIdentity.username}
              open={chatOpen}
              onToggle={toggleChat}
              unread={chatUnread}
              onSend={handleSendChat}
              onOpponentMenu={() => setOpponentMenuOpen(true)}
              unavailable={chatUnavailable}
            />
          </View>
        )}
        {opponentIdentity && (
          <AvatarActionMenu
            visible={opponentMenuOpen}
            onClose={() => setOpponentMenuOpen(false)}
            userId={opponentIdentity.userId}
            username={opponentIdentity.username}
            avatarUrl={opponentIdentity.avatarUrl}
            onOpenProfile={(userId) => navigation.navigate('PublicProfile', { userId })}
          />
        )}
      </ScrollView>
    );
  }

  if (!state) return null;

  const remainingSeconds = state.matchEndsAt
    ? Math.max(0, Math.ceil((new Date(state.matchEndsAt).getTime() - now) / 1000))
    : 0;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

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
        <BackButton onPress={() => navigation.goBack()} />
        <ProtoGameHeader line={tp('gameDuel')} />

        {state.matchEndsAt && (
          <>
            <Text style={styles.timerLabel}>{t('matchTimeLabel')}</Text>
            <CountdownRing
              remainingSeconds={remainingSeconds}
              totalSeconds={MATCH_DURATION_SECONDS}
              colors={colors}
              urgentThresholdSeconds={URGENT_THRESHOLD_SECONDS}
              label={`${minutes}:${String(seconds).padStart(2, '0')}`}
            />
          </>
        )}

        <View style={styles.scoreRow}>
          <View style={[styles.scoreCard, styles.scoreCardSelf]}>
            <View style={styles.scoreCardAvatarSpacer}>
              <AvatarBubble
                colors={colors}
                avatarUrl={userAvatarUrl}
                username={userUsername ?? t('youLabel')}
                size={40}
              />
            </View>
            <Text style={styles.scoreLabel}>
              {userUsername ? t('youWithUsernameLabel', { username: userUsername }) : t('youLabel')}
            </Text>
            <Text style={styles.scoreValue}>
              {t('correctCountLabel', { count: state.correctCount })}
            </Text>
            <Text style={styles.scoreXp}>{t('xpLabel', { xp: state.totalXp })}</Text>
          </View>
          <View style={styles.scoreCard}>
            {/* Real username + avatar live as soon as an opponent has joined
                (2026-09-29 spec) — falls back to the generic label/blank
                avatar only in the brief window before the backend has
                resolved their identity. */}
            <View style={styles.scoreCardAvatarSpacer}>
              <AvatarBubble
                colors={colors}
                avatarUrl={state.opponent?.avatarUrl}
                username={state.opponent?.username ?? t('opponentLabel')}
                size={40}
              />
            </View>
            <Text style={styles.scoreLabel}>{state.opponent?.username ?? t('opponentLabel')}</Text>
            <Text style={styles.scoreValue}>
              {t('correctCountLabel', { count: state.opponent?.correctCount ?? 0 })}
            </Text>
            <Text style={styles.scoreXp}>{t('xpLabel', { xp: state.opponent?.totalXp ?? 0 })}</Text>
          </View>
        </View>

        {state.current ? (
          <>
            <View style={styles.puzzleCard}>
              <LinearGradient
                colors={[colors.glyph, colors.arcane]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.puzzleCardAccentBar}
              />
              {/* Meaning and letter count are both always shown, never
                  gated behind a clue — 2026-09-30, Barth: "Meaning of
                  the word and total letters in the word would always
                  show when a new word is dropped". */}
              <Text style={styles.meaningText}>
                {t('meaningFormat', { meaning: state.current.meaning })}
              </Text>
              <Text style={styles.wordLengthText}>
                {t('wordLengthLabel', { count: state.current.wordLength })}
              </Text>
              <Text style={styles.displayHint}>{state.current.displayHint.toUpperCase()}</Text>
              <Text style={styles.clueProgress}>
                {t('clueProgressLabel', {
                  revealed: state.current.cluesRevealed,
                  max: state.current.maxClues,
                })}
              </Text>

              {/* Player-triggered — the "Clues" button (2026-09-30 spec):
                  tapping it reveals the next clue, in fixed order
                  (category, synonym, first & last letter, example, then
                  60% of the letters — see handleRevealClue). The button
                  itself names the specific clue it's about to reveal
                  next, not a generic "Clues (N left)" label. */}
              <Pressable
                style={[
                  styles.cluesButton,
                  (state.current.cluesRevealed >= state.current.maxClues || revealingClue) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleRevealClue}
                disabled={state.current.cluesRevealed >= state.current.maxClues || revealingClue}
                accessibilityRole="button"
                accessibilityLabel={
                  state.current.cluesRevealed < state.current.maxClues
                    ? t('cluesButtonReveal', {
                        clueName: t(CLUE_NAME_KEYS[state.current.cluesRevealed]),
                      })
                    : t('noCluesRemaining')
                }
              >
                {revealingClue ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <Text style={styles.cluesButtonText}>
                    {state.current.cluesRevealed < state.current.maxClues
                      ? t('cluesButtonReveal', {
                          clueName: t(CLUE_NAME_KEYS[state.current.cluesRevealed]),
                        })
                      : t('noCluesRemaining')}
                  </Text>
                )}
              </Pressable>

              {state.current.clues.map((clue, index) => (
                <Text key={`${clue.type}-${index}`} style={styles.clueText}>
                  {clue.type === 'CATEGORY' &&
                    (clue.text
                      ? t('categoryClueLabel', { text: clue.text })
                      : t('categoryUnavailable'))}
                  {clue.type === 'SYNONYM' &&
                    (clue.text
                      ? t('synonymClueLabel', { text: clue.text })
                      : t('synonymUnavailable'))}
                  {clue.type === 'FIRST_LAST' && t('firstLastClueRevealedLabel')}
                  {clue.type === 'EXAMPLE' && t('exampleClueLabel', { text: clue.text })}
                  {clue.type === 'LETTERS' && t('lettersClueRevealedLabel')}
                </Text>
              ))}
            </View>

            <LetterBoxInput
              value={answer}
              onChangeText={setAnswer}
              length={state.current.displayHint.split(' ').length}
              colors={colors}
              editable={!submitting && remainingSeconds > 0}
              accessibilityLabel={t('yourAnswerLabel')}
              onSubmitEditing={handleSubmit}
            />
            {/* "Lock In", not "Submit" -- 2026-09-30 Barth: "'Submit'
                feels like a form. 'LOCK IN' feels like a game decision."
                Always available the moment there's any text typed --
                revealing a clue first is never required (handleSubmit's
                own guard is just `!answer.trim() || submitting`, no clue
                gate). */}
            <Pressable
              style={[
                styles.button,
                (!answer.trim() || submitting || remainingSeconds <= 0) && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!answer.trim() || submitting || remainingSeconds <= 0}
              accessibilityRole="button"
              accessibilityLabel={t('lockInButton')}
            >
              {submitting ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <Text style={styles.buttonText}>{t('lockInButton')}</Text>
              )}
            </Pressable>

            {feedback && (
              <View style={styles.feedbackBar}>
                <Text
                  style={[
                    styles.feedbackText,
                    { color: feedback.isCorrect ? colors.success : colors.danger },
                  ]}
                >
                  {feedback.isCorrect
                    ? t('correctFeedback', { xp: feedback.xpAwarded })
                    : t('incorrectFeedback', { answer: feedback.correctAnswer })}
                </Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.waitingForOpponentCard}>
            <ActivityIndicator color={colors.arcaneSoft} />
            <Text style={styles.title}>{t('waitingForOpponentTitle')}</Text>
            <Text style={styles.subtitle}>{t('waitingForOpponentSubtitle')}</Text>
          </View>
        )}

        {state.opponent?.userId && state.opponent.username && (
          <>
            <DuelChat
              colors={colors}
              messages={chatMessages}
              opponentName={state.opponent.username}
              open={chatOpen}
              onToggle={toggleChat}
              unread={chatUnread}
              onSend={handleSendChat}
              onOpponentMenu={() => setOpponentMenuOpen(true)}
              unavailable={chatUnavailable}
            />
            <AvatarActionMenu
              visible={opponentMenuOpen}
              onClose={() => setOpponentMenuOpen(false)}
              userId={state.opponent.userId}
              username={state.opponent.username}
              avatarUrl={state.opponent.avatarUrl}
              onOpenProfile={(userId) => navigation.navigate('PublicProfile', { userId })}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    chatWrap: { alignSelf: 'stretch', maxWidth: 420, width: '100%' },
    flexFill: { flex: 1 },
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      paddingTop: topInset + spacing.md,
      gap: spacing.lg,
    },
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
    noOpponentIconOuter: {
      width: 120,
      height: 120,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noOpponentBadge: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noOpponentSparkle: {
      position: 'absolute',
      width: 5,
      height: 5,
      borderRadius: 3,
    },
    noOpponentButtonCol: {
      width: '100%',
      maxWidth: 360,
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    error: { color: colors.danger, fontSize: typography.scale.md, textAlign: 'center' },
    title: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
      textAlign: 'center',
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    summaryLine: { color: colors.ink, fontSize: typography.scale.md, textAlign: 'center' },
    tiebreakNote: { color: colors.inkMuted, fontSize: typography.scale.xs, textAlign: 'center' },
    timerLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      textTransform: 'uppercase',
      fontWeight: '700',
      textAlign: 'center',
    },
    scoreRow: { flexDirection: 'row', gap: spacing.md },
    scoreCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      alignItems: 'center',
      gap: 2,
    },
    // Extra breathing room under the avatar bubble at the top of each
    // score card, before the username/score text starts -- `gap: 2`
    // above is fine for the text lines but too tight right under a
    // 40px avatar image.
    scoreCardAvatarSpacer: { marginBottom: 4 },
    // The player's own score card only -- same gold-outline language as
    // the streak pill in ScrambleQuest/Complete It, so "you" is visually
    // distinct from the opponent's card at a glance.
    scoreCardSelf: { borderColor: colors.glyph },
    scoreLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    scoreValue: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    scoreXp: { color: colors.glyph, fontSize: typography.scale.xs },
    puzzleCard: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      overflow: 'hidden',
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.35,
      shadowRadius: 18,
      elevation: 8,
    },
    puzzleCardAccentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 5 },
    displayHint: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: '700',
      letterSpacing: 4,
    },
    meaningText: {
      color: colors.glyph,
      fontSize: typography.scale.sm,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    wordLengthText: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    clueProgress: { color: colors.inkMuted, fontSize: typography.scale.xs },
    cluesButton: {
      borderRadius: radius.pill,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.glyph,
    },
    cluesButtonText: { color: colors.glyph, fontSize: typography.scale.xs, fontWeight: '700' },
    clueText: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      textAlign: 'center',
      paddingHorizontal: spacing.sm,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.ink,
      fontSize: typography.scale.md,
      padding: spacing.md,
    },
    button: {
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      alignItems: 'center',
      shadowColor: colors.arcane,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 14,
      elevation: 4,
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    secondaryButton: {
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.xl,
    },
    secondaryButtonText: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
      fontWeight: '600',
    },
    feedbackBar: { alignItems: 'center' },
    feedbackText: { fontSize: typography.scale.md, fontWeight: '700' },
    waitingForOpponentCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      alignItems: 'center',
      gap: spacing.sm,
    },
  });
}
