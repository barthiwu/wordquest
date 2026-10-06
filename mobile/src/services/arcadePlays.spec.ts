import { ApiError } from './apiClient';
import {
  applyNoticeToAllowance,
  isPlayLimitError,
  playsBadge,
  type ArcadeAllowance,
} from './arcadePlays';

const allowance = (over: Partial<ArcadeAllowance> = {}): ArcadeAllowance => ({
  unlimited: false,
  limit: 10,
  resetsAt: '2026-10-07T00:00:00.000Z',
  games: [
    { game: 'SCRAMBLE_QUEST', used: 3, limit: 10, remaining: 7, locked: false },
    { game: 'WORD_DUEL', used: 10, limit: 10, remaining: 0, locked: true },
    { game: 'COMPLETE_IT', used: 0, limit: 10, remaining: 10, locked: false },
    { game: 'HANGMAN', used: 9, limit: 10, remaining: 1, locked: false },
  ],
  ...over,
});

describe('isPlayLimitError', () => {
  it("recognises the server's ARCADE_PLAY_LIMIT 403", () => {
    const err = new ApiError('used up', 403, { statusCode: 403, error: 'ARCADE_PLAY_LIMIT' });
    expect(isPlayLimitError(err)).toBe(true);
  });

  it('ignores other 403s, other statuses and non-API errors', () => {
    expect(isPlayLimitError(new ApiError('no', 403, { error: 'Forbidden' }))).toBe(false);
    expect(isPlayLimitError(new ApiError('no', 403))).toBe(false);
    expect(isPlayLimitError(new ApiError('no', 500, { error: 'ARCADE_PLAY_LIMIT' }))).toBe(false);
    expect(isPlayLimitError(new Error('boom'))).toBe(false);
    expect(isPlayLimitError(null)).toBe(false);
  });
});

describe('playsBadge', () => {
  it('shows plays left, or locked at zero', () => {
    expect(playsBadge(allowance(), 'SCRAMBLE_QUEST')).toEqual({ kind: 'left', left: 7 });
    expect(playsBadge(allowance(), 'HANGMAN')).toEqual({ kind: 'left', left: 1 });
    expect(playsBadge(allowance(), 'WORD_DUEL')).toEqual({ kind: 'locked' });
  });

  it('shows nothing before the data loads or on WordQuest+', () => {
    expect(playsBadge(null, 'HANGMAN')).toBeNull();
    expect(playsBadge(allowance({ unlimited: true }), 'HANGMAN')).toBeNull();
  });
});

describe('applyNoticeToAllowance', () => {
  it('updates just that game and locks it at the limit', () => {
    const next = applyNoticeToAllowance(allowance(), {
      game: 'HANGMAN',
      used: 10,
      limit: 10,
      remaining: 0,
      percent: 100,
    });
    expect(next?.games.find((g) => g.game === 'HANGMAN')).toEqual({
      game: 'HANGMAN',
      used: 10,
      limit: 10,
      remaining: 0,
      locked: true,
    });
    expect(next?.games.find((g) => g.game === 'SCRAMBLE_QUEST')?.used).toBe(3);
  });

  it('leaves an unloaded allowance alone', () => {
    expect(
      applyNoticeToAllowance(null, {
        game: 'HANGMAN',
        used: 1,
        limit: 10,
        remaining: 9,
        percent: null,
      }),
    ).toBeNull();
  });
});
