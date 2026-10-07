import { buildGroupResultCard, buildVersusResultCard } from './buildData';
import type { ArcadeGroup, GroupMember } from '@/services/arcadeGroups';

// Echoes the key and options so the tests see which line a card picked.
const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}${JSON.stringify(opts)}` : key) as never;

const member = (over: Partial<GroupMember>): GroupMember => ({
  userId: 'u',
  username: 'u',
  avatarUrl: null,
  isHost: false,
  isMe: false,
  state: 'FINISHED',
  rank: null,
  correct: null,
  answered: null,
  timeMs: null,
  ...over,
});

const group = (over: Partial<ArcadeGroup> = {}): ArcadeGroup =>
  ({
    id: 'g',
    code: 'ABCDEFGHJK',
    game: 'SCRAMBLE_QUEST',
    status: 'ENDED',
    title: 'Friday game night',
    isHost: false,
    showLeaderboard: true,
    wordsTotal: 10,
    members: [
      member({ userId: 'a', username: 'ada', rank: 2, correct: 8, timeMs: 5000 }),
      member({ userId: 'b', username: 'bayo', rank: 1, correct: 9, timeMs: 4000, isMe: true }),
      member({ userId: 'c', username: 'idle', rank: null, state: 'NOT_STARTED' }),
    ],
    ...over,
  }) as ArcadeGroup;

describe('buildGroupResultCard', () => {
  it('ranks best-first, leaves out players with no score, and cheers the winner', () => {
    const card = buildGroupResultCard(group(), t)!;
    expect(card.players.map((p) => p.name)).toEqual(['bayo', 'ada']);
    expect(card.players[0]).toMatchObject({ isMe: true, correct: 9, total: 10 });
    expect(card.aliExpression).toBe('TRIUMPHANT');
    expect(card.headline).toBe('arcade:share.headlineWon');
    expect(card.title).toBe('Friday game night');
  });

  it('is null until the round has ended, and when the host hides the leaderboard from a player', () => {
    expect(buildGroupResultCard(group({ status: 'ACTIVE' }), t)).toBeNull();
    expect(buildGroupResultCard(group({ showLeaderboard: false }), t)).toBeNull();
    expect(buildGroupResultCard(group({ showLeaderboard: false, isHost: true }), t)).not.toBeNull();
  });

  it('is null when nobody finished with a score', () => {
    const empty = group({ members: [member({ isMe: true, state: 'NOT_STARTED' })] });
    expect(buildGroupResultCard(empty, t)).toBeNull();
  });

  it('falls back to the game name when the group has no title', () => {
    expect(buildGroupResultCard(group({ title: null }), t)!.title).toBe(
      'arcade:scrambleQuestTitle',
    );
  });
});

describe('buildVersusResultCard', () => {
  const sides = {
    me: { name: 'me', correct: 7, timeMs: 30000 },
    them: { name: 'rival', correct: 5, timeMs: 28000 },
    total: 10,
  };

  it('puts the winner first and marks the viewer', () => {
    const win = buildVersusResultCard(t, { game: 'HANGMAN', outcome: 'WIN', ...sides })!;
    expect(win.players.map((p) => [p.name, p.rank])).toEqual([
      ['me', 1],
      ['rival', 2],
    ]);
    expect(win.players[0].isMe).toBe(true);
    const loss = buildVersusResultCard(t, { game: 'HANGMAN', outcome: 'LOSS', ...sides })!;
    expect(loss.players[0].name).toBe('rival');
    expect(loss.aliExpression).toBe('ENCOURAGING');
  });

  it('shares a draw as joint first, a Word Duel as a duel, and skips unsettled matches', () => {
    const draw = buildVersusResultCard(t, { game: 'WORD_DUEL', outcome: 'DRAW', ...sides })!;
    expect(draw.players.map((p) => p.rank)).toEqual([1, 1]);
    expect(draw.kind).toBe('duel');
    expect(draw.gameArt).toBe('duel');
    expect(
      buildVersusResultCard(t, { game: 'HANGMAN', outcome: 'NO_CONTEST', ...sides }),
    ).toBeNull();
  });
});
