import type { ResultCardData, ResultPlayer } from './types';

const p = (
  id: string,
  name: string,
  rank: number | null,
  correct: number | null,
  timeMs: number | null,
  isMe = false,
): ResultPlayer => ({ id, name, rank, correct, total: 10, timeMs, isMe, avatarUrl: null });

/** Sample data for the design gallery and tests. */
export function sampleResultCard(
  overrides: Partial<ResultCardData> = {},
  myRank = 2,
): ResultCardData {
  const base = [
    p('u1', 'wordsmith', 1, 9, 48200),
    p('u2', 'chioma', 2, 8, 52100),
    p('u3', 'ali_fan', 3, 7, 61000),
    p('u4', 'tunde', 4, 6, 59000),
    p('u5', 'kemi', 5, 4, 40000),
  ];
  const players = base.map((x) => ({ ...x, isMe: x.rank === myRank, name: x.rank === myRank ? 'barth' : x.name }));
  return {
    kind: 'group',
    gameLabel: 'ScrambleQuest',
    gameArt: 'scramble',
    title: 'Friday game night',
    headline: myRank === 1 ? 'You won the round!' : `You finished #${myRank} of 5`,
    aliMessage: myRank === 1 ? 'Champion of the night!' : 'So close. Next round is yours!',
    aliExpression: myRank === 1 ? 'TRIUMPHANT' : 'ENCOURAGING',
    aliPose: myRank === 1 ? 'WING_SPREAD_FULL' : 'APPROVING_NOD',
    aliIntensity: myRank === 1 ? 4 : 2,
    players,
    playerCount: 5,
    ofPlayers: 'of 5 players',
    winnerLabel: 'Winner',
    youLabel: 'YOU',
    timeLabel: 'TIME',
    accuracyLabel: 'ACCURACY',
    footer: 'Play along at the next round',
    brand: 'WordQuest',
    ...overrides,
  };
}
