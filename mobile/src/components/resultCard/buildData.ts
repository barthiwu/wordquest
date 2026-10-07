import type { TFunction } from 'i18next';
import type { ArcadeGroup } from '@/services/arcadeGroups';
import type { VersusGame } from '@/services/arcadeVersus';
import type { ArtKind } from '@/features/proto/ui/ProtoArt';
import type { ResultCardData, ResultPlayer } from './types';

export type CardGame = VersusGame | 'WORD_DUEL';

const GAME_TITLE_KEY: Record<CardGame, string> = {
  SCRAMBLE_QUEST: 'scrambleQuestTitle',
  COMPLETE_IT: 'completeItTitle',
  HANGMAN: 'hangmanTitle',
  WORD_DUEL: 'wordDuelTitle',
};

const GAME_ART: Record<CardGame, ArtKind> = {
  SCRAMBLE_QUEST: 'scramble',
  COMPLETE_IT: 'complete',
  HANGMAN: 'hangman',
  WORD_DUEL: 'duel',
};

const BRAND = 'WordQuest';

function common(t: TFunction, game: CardGame) {
  return {
    gameLabel: t(`arcade:${GAME_TITLE_KEY[game]}`),
    gameArt: GAME_ART[game],
    youLabel: t('arcade:share.you'),
    timeLabel: t('arcade:share.time'),
    accuracyLabel: t('arcade:share.accuracy'),
    winnerLabel: '',
    brand: BRAND,
  };
}

/**
 * The share card for a finished group round, or null when there is nothing to
 * show (nobody ranked, or the host hid the leaderboard from this player).
 */
export function buildGroupResultCard(group: ArcadeGroup, t: TFunction): ResultCardData | null {
  if (group.status !== 'ENDED') return null;
  if (!group.isHost && !group.showLeaderboard) return null;
  const players: ResultPlayer[] = group.members
    .filter((m) => m.rank !== null)
    .map((m) => ({
      id: m.userId,
      name: m.username,
      avatarUrl: m.avatarUrl,
      rank: m.rank,
      correct: m.correct,
      total: group.wordsTotal,
      timeMs: m.timeMs,
      isMe: m.isMe,
    }))
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  if (players.length === 0) return null;
  const me = players.find((p) => p.isMe) ?? null;
  const rank = me?.rank ?? null;
  const won = rank === 1;
  const podium = rank !== null && rank <= 3;
  return {
    kind: 'group',
    ...common(t, group.game),
    title: group.title?.trim() || t(`arcade:${GAME_TITLE_KEY[group.game]}`),
    headline: rank
      ? won
        ? t('arcade:share.headlineWon')
        : t('arcade:share.headlineRank', { rank, count: players.length })
      : '',
    aliMessage: won
      ? t('arcade:share.aliWon')
      : podium
        ? t('arcade:share.aliPodium')
        : t('arcade:share.aliTry'),
    aliExpression: won ? 'TRIUMPHANT' : podium ? 'PROUD' : 'ENCOURAGING',
    aliPose: won ? 'WING_SPREAD_FULL' : 'APPROVING_NOD',
    aliIntensity: won ? 4 : 2,
    players,
    playerCount: players.length,
    ofPlayers: t('arcade:share.ofPlayers', { count: players.length }),
    footer: t('arcade:share.footerGroup'),
  };
}

/** The share card for a finished one-on-one (friend / random match or Word Duel). */
export function buildVersusResultCard(
  t: TFunction,
  args: {
    game: CardGame;
    outcome: 'WIN' | 'LOSS' | 'DRAW' | 'NO_CONTEST' | string;
    me: { name: string; avatarUrl?: string | null; correct: number; timeMs?: number | null };
    them: { name: string; avatarUrl?: string | null; correct: number; timeMs?: number | null };
    total: number | null;
  },
): ResultCardData | null {
  const { outcome, me, them, total } = args;
  if (outcome !== 'WIN' && outcome !== 'LOSS' && outcome !== 'DRAW') return null;
  const myRank = outcome === 'LOSS' ? 2 : 1;
  const theirRank = outcome === 'WIN' ? 2 : 1;
  const players: ResultPlayer[] = [
    {
      id: 'me',
      name: me.name,
      avatarUrl: me.avatarUrl,
      rank: myRank,
      correct: me.correct,
      total,
      timeMs: me.timeMs,
      isMe: true,
    },
    {
      id: 'them',
      name: them.name,
      avatarUrl: them.avatarUrl,
      rank: theirRank,
      correct: them.correct,
      total,
      timeMs: them.timeMs,
      isMe: false,
    },
  ].sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9));
  const win = outcome === 'WIN';
  const loss = outcome === 'LOSS';
  return {
    kind: args.game === 'WORD_DUEL' ? 'duel' : 'versus',
    ...common(t, args.game),
    title: t('arcade:share.vsTitle', { name: them.name }),
    headline: win
      ? t('arcade:share.headlineWin')
      : loss
        ? t('arcade:share.headlineLoss', { name: them.name })
        : t('arcade:share.headlineDraw'),
    aliMessage: win
      ? t('arcade:share.aliVsWin')
      : loss
        ? t('arcade:share.aliVsLoss')
        : t('arcade:share.aliVsDraw'),
    aliExpression: win ? 'TRIUMPHANT' : loss ? 'ENCOURAGING' : 'PLEASED',
    aliPose: win ? 'WING_SPREAD_FULL' : 'APPROVING_NOD',
    aliIntensity: win ? 4 : 2,
    players,
    playerCount: 2,
    ofPlayers: t('arcade:share.ofPlayers', { count: 2 }),
    footer: t('arcade:share.footerVersus'),
  };
}
