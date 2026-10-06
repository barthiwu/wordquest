import {
  createGroup,
  endGroup,
  extractGroupCode,
  formatGroupCode,
  getGroup,
  groupShareUrl,
  joinGroup,
  leaveGroup,
  listMyGroups,
  previewGroup,
  removeGroupMember,
  startGroupRound,
} from './arcadeGroups';
import { startScrambleQuest } from './scrambleQuest';
import { startCompleteIt } from './completeIt';
import { startHangman } from './hangman';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('arcade group service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiRequest as jest.Mock).mockResolvedValue({});
  });

  it('creates, previews, joins, reads, lists, starts, ends, leaves and removes', async () => {
    await createGroup('t', { game: 'HANGMAN', title: 'JSS2', showLeaderboard: false });
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/groups', {
      method: 'POST',
      body: { game: 'HANGMAN', title: 'JSS2', showLeaderboard: false },
      accessToken: 't',
    });
    await previewGroup('t', 'ABCDEFGHJK');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/groups/preview/ABCDEFGHJK', {
      accessToken: 't',
    });
    await joinGroup('t', 'ABCDEFGHJK');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/groups/join', {
      method: 'POST',
      body: { code: 'ABCDEFGHJK' },
      accessToken: 't',
    });
    await getGroup('t', 'g1');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/groups/g1', { accessToken: 't' });
    await listMyGroups('t');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/groups/mine', { accessToken: 't' });
    await startGroupRound('t', 'g1', 30);
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/groups/g1/start', {
      method: 'POST',
      body: { windowMinutes: 30 },
      accessToken: 't',
    });
    await startGroupRound('t', 'g1');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/groups/g1/start', {
      method: 'POST',
      body: {},
      accessToken: 't',
    });
    await endGroup('t', 'g1');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/groups/g1/end', {
      method: 'POST',
      accessToken: 't',
    });
    await leaveGroup('t', 'g1');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/groups/g1/leave', {
      method: 'POST',
      accessToken: 't',
    });
    await removeGroupMember('t', 'g1', 'u9');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/groups/g1/members/u9', {
      method: 'DELETE',
      accessToken: 't',
    });
  });

  it('each game start sends the group id only for a group play', async () => {
    await startScrambleQuest('t');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/scramble-quest/start', {
      method: 'POST',
      accessToken: 't',
    });
    await startScrambleQuest('t', undefined, 'g1');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/scramble-quest/start', {
      method: 'POST',
      accessToken: 't',
      body: { groupId: 'g1' },
    });
    await startCompleteIt('t', undefined, 'g1');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/complete-it/start', {
      method: 'POST',
      accessToken: 't',
      body: { groupId: 'g1' },
    });
    await startHangman('t', undefined, 'g1');
    expect(apiRequest).toHaveBeenLastCalledWith('/arcade/hangman/start', {
      method: 'POST',
      accessToken: 't',
      body: { groupId: 'g1' },
    });
  });

  describe('invite links and codes', () => {
    it('builds the share link from the code', () => {
      expect(groupShareUrl('ABCDEFGHJK')).toBe('https://barthiwu.github.io/wordquest/g/ABCDEFGHJK');
      expect(groupShareUrl('ABCDEFGHJK', 'http://x.test')).toBe('http://x.test/g/ABCDEFGHJK');
    });

    it('reads a code out of a pasted link, a bare code, or a spaced code', () => {
      expect(extractGroupCode('https://barthiwu.github.io/wordquest/g/ABCDEFGHJK')).toBe(
        'ABCDEFGHJK',
      );
      expect(extractGroupCode('https://x.test/g/abcdefghjk?utm=1')).toBe('ABCDEFGHJK');
      expect(extractGroupCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
      expect(extractGroupCode('ABCDE FGHJK')).toBe('ABCDEFGHJK');
    });

    it('rejects things that cannot be a code', () => {
      expect(extractGroupCode('')).toBeNull();
      expect(extractGroupCode('   ')).toBeNull();
      expect(extractGroupCode('ABC')).toBeNull();
      // 0, O, 1, I and L are never issued
      expect(extractGroupCode('ABCDEFGHJ0')).toBeNull();
      expect(extractGroupCode('ABCDEFGHJO')).toBeNull();
      expect(extractGroupCode('ABCDEFGHJL')).toBeNull();
      expect(extractGroupCode('https://x.test/other/ABCDEFGHJK')).toBeNull();
    });

    it('shows the code in two readable halves', () => {
      expect(formatGroupCode('ABCDEFGHJK')).toBe('ABCDE FGHJK');
    });
  });
});
