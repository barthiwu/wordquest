import { useArcadePlaysStore } from './arcadePlaysStore';
import type { ArcadeAllowance } from '@/services/arcadePlays';

jest.mock('@/services/arcadePlays', () => ({
  ...jest.requireActual('@/services/arcadePlays'),
  getArcadeAllowance: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getArcadeAllowance } = require('@/services/arcadePlays') as {
  getArcadeAllowance: jest.Mock;
};

const allowance = (): ArcadeAllowance => ({
  unlimited: false,
  limit: 10,
  resetsAt: '2026-10-07T00:00:00.000Z',
  games: [
    { game: 'SCRAMBLE_QUEST', used: 4, limit: 10, remaining: 6, locked: false },
    { game: 'WORD_DUEL', used: 0, limit: 10, remaining: 10, locked: false },
    { game: 'COMPLETE_IT', used: 0, limit: 10, remaining: 10, locked: false },
    { game: 'HANGMAN', used: 0, limit: 10, remaining: 10, locked: false },
  ],
});

describe('arcadePlaysStore', () => {
  beforeEach(() => {
    getArcadeAllowance.mockReset();
    useArcadePlaysStore.getState().reset();
  });

  it('loads the allowance, and keeps the old one when a refresh fails', async () => {
    getArcadeAllowance.mockResolvedValueOnce(allowance());
    await useArcadePlaysStore.getState().refresh('tok');
    expect(useArcadePlaysStore.getState().allowance?.games).toHaveLength(4);

    getArcadeAllowance.mockRejectedValueOnce(new Error('offline'));
    await useArcadePlaysStore.getState().refresh('tok');
    expect(useArcadePlaysStore.getState().allowance?.games).toHaveLength(4);
  });

  it('a play updates that game and queues a toast only at a milestone', () => {
    useArcadePlaysStore.setState({ allowance: allowance() });

    useArcadePlaysStore
      .getState()
      .applyNotice({ game: 'SCRAMBLE_QUEST', used: 5, limit: 10, remaining: 5, percent: 50 });
    expect(useArcadePlaysStore.getState().notice?.percent).toBe(50);
    expect(
      useArcadePlaysStore.getState().allowance?.games.find((g) => g.game === 'SCRAMBLE_QUEST'),
    ).toEqual(expect.objectContaining({ used: 5, remaining: 5 }));

    useArcadePlaysStore.getState().dismissNotice();
    useArcadePlaysStore
      .getState()
      .applyNotice({ game: 'SCRAMBLE_QUEST', used: 6, limit: 10, remaining: 4, percent: null });
    expect(useArcadePlaysStore.getState().notice).toBeNull();
  });

  it('ignores a missing notice (a resumed session carries none)', () => {
    useArcadePlaysStore.setState({ allowance: allowance() });
    useArcadePlaysStore.getState().applyNotice(undefined);
    expect(useArcadePlaysStore.getState().allowance?.games[0].used).toBe(4);
  });

  it('markLocked locks a game after the server refused it', () => {
    useArcadePlaysStore.setState({ allowance: allowance() });
    useArcadePlaysStore.getState().markLocked('HANGMAN');
    expect(
      useArcadePlaysStore.getState().allowance?.games.find((g) => g.game === 'HANGMAN'),
    ).toEqual({ game: 'HANGMAN', used: 10, limit: 10, remaining: 0, locked: true });
  });

  it('reset clears everything (sign-out)', () => {
    useArcadePlaysStore.setState({ allowance: allowance() });
    useArcadePlaysStore.getState().reset();
    expect(useArcadePlaysStore.getState().allowance).toBeNull();
  });
});
