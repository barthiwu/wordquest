import {
  cancelVersus,
  getVersusMatch,
  inviteFriendToVersus,
  isVersusGame,
  listMyVersus,
  queueVersus,
  respondToVersus,
} from './arcadeVersus';
import { startScrambleQuest } from './scrambleQuest';
import { startCompleteIt } from './completeIt';
import { startHangman } from './hangman';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('arcade versus service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiRequest as jest.Mock).mockResolvedValue({});
  });

  it('queues, invites, reads, lists, answers and cancels', async () => {
    await queueVersus('t', 'HANGMAN');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/versus/queue', {
      method: 'POST',
      body: { game: 'HANGMAN' },
      accessToken: 't',
    });
    await inviteFriendToVersus('t', 'f1', 'COMPLETE_IT');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/versus/invite', {
      method: 'POST',
      body: { friendId: 'f1', game: 'COMPLETE_IT' },
      accessToken: 't',
    });
    await getVersusMatch('t', 'm1');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/versus/m1', { accessToken: 't' });
    await listMyVersus('t');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/versus/mine', { accessToken: 't' });
    await respondToVersus('t', 'm1', false);
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/versus/m1/respond', {
      method: 'POST',
      body: { accept: false },
      accessToken: 't',
    });
    await cancelVersus('t', 'm1');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/versus/m1/cancel', {
      method: 'POST',
      accessToken: 't',
    });
  });

  it('knows which games have a head-to-head mode', () => {
    expect(isVersusGame('HANGMAN')).toBe(true);
    expect(isVersusGame('SCRAMBLE_QUEST')).toBe(true);
    expect(isVersusGame('COMPLETE_IT')).toBe(true);
    expect(isVersusGame('WORD_DUEL')).toBe(false);
  });

  it('each game start sends the match id only for a head-to-head play', async () => {
    await startScrambleQuest('t');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/scramble-quest/start', {
      method: 'POST',
      accessToken: 't',
    });
    await startScrambleQuest('t', 'm1');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/scramble-quest/start', {
      method: 'POST',
      accessToken: 't',
      body: { versusMatchId: 'm1' },
    });
    await startCompleteIt('t', 'm1');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/complete-it/start', {
      method: 'POST',
      accessToken: 't',
      body: { versusMatchId: 'm1' },
    });
    await startHangman('t', 'm1');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/hangman/start', {
      method: 'POST',
      accessToken: 't',
      body: { versusMatchId: 'm1' },
    });
  });
});
