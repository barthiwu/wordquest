import {
  acceptFriendRequest,
  blockPlayer,
  declineFriendRequest,
  getFriendRequests,
  getFriends,
  getPublicProfile,
  searchByUsername,
  sendFriendRequest,
  unblockPlayer,
  unfriend,
} from './friends';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('friends service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches a player's public profile by userId", async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getPublicProfile('tok', 'u1');
    expect(apiRequest).toHaveBeenCalledWith('/friends/profile/u1', { accessToken: 'tok' });
  });

  it('searches for a player by exact username, URI-encoded', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(null);
    await searchByUsername('tok', 'ada lovelace');
    expect(apiRequest).toHaveBeenCalledWith('/friends/search?username=ada%20lovelace', {
      accessToken: 'tok',
    });
  });

  it("fetches the viewer's accepted friends", async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await getFriends('tok');
    expect(apiRequest).toHaveBeenCalledWith('/friends', { accessToken: 'tok' });
  });

  it('fetches incoming/outgoing friend requests', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({ incoming: [], outgoing: [] });
    await getFriendRequests('tok');
    expect(apiRequest).toHaveBeenCalledWith('/friends/requests', { accessToken: 'tok' });
  });

  it('sends a friend request by username', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({ accepted: true });
    await sendFriendRequest('tok', 'ada');
    expect(apiRequest).toHaveBeenCalledWith('/friends/requests', {
      method: 'POST',
      body: { username: 'ada' },
      accessToken: 'tok',
    });
  });

  it('accepts a friend request by id', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await acceptFriendRequest('tok', 'req1');
    expect(apiRequest).toHaveBeenCalledWith('/friends/requests/req1/accept', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('declines a friend request by id', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await declineFriendRequest('tok', 'req1');
    expect(apiRequest).toHaveBeenCalledWith('/friends/requests/req1/decline', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('unfriends a player by userId', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await unfriend('tok', 'u2');
    expect(apiRequest).toHaveBeenCalledWith('/friends/u2', {
      method: 'DELETE',
      accessToken: 'tok',
    });
  });

  it('blocks a player by userId', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await blockPlayer('tok', 'u3');
    expect(apiRequest).toHaveBeenCalledWith('/friends/u3/block', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('unblocks a player by userId', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await unblockPlayer('tok', 'u3');
    expect(apiRequest).toHaveBeenCalledWith('/friends/u3/unblock', {
      method: 'POST',
      accessToken: 'tok',
    });
  });
});
