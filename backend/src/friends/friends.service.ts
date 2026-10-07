import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

/** Client-safe view of another player — never email/displayName/dateOfBirth
 * (same "username is the only identity other players see" rule the rest
 * of the app already follows — see User.username's schema doc comment). */
export interface FriendPublicView {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

export interface FriendRequestView {
  id: string;
  user: FriendPublicView;
  createdAt: string;
}

export interface FriendRequestsView {
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
}

/** How the viewer relates to the profile they're looking at -- drives
 * which action(s) the avatar-tap popup (Profile / Add Friend / Block)
 * offers on the mobile side. */
export type FriendRelationship =
  'SELF' | 'FRIENDS' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'BLOCKED' | 'NONE';

/** Public profile view for the avatar-tap "Profile" popup option --
 * intentionally the same narrow, non-PII field set every other public-
 * facing surface in the app uses (username, never email/displayName/
 * dateOfBirth -- see FriendPublicView's own doc comment). */
export interface PublicProfileView {
  userId: string;
  username: string;
  avatarUrl: string | null;
  level: number;
  currentStreak: number;
  clanName: string | null;
  joinedAt: string;
  relationship: FriendRelationship;
}

/**
 * Friends (2026-09, Barth): request-and-accept graph backing the Friend
 * Rank leaderboard and the avatar-tap "Profile / Add Friend / Block"
 * popup in Boss Battle (and Word Duel's post-match result). A request
 * needs the addressee to accept before the two are mutual friends —
 * confirmed with Barth rather than an instant one-way add.
 *
 * Block is deliberately a stronger action than just "remove from my
 * list": isBlockedEitherWay is checked everywhere a block should matter
 * -- sending/receiving requests, username search, and (see
 * WordDuelService) matchmaking -- so the effect is always mutual even
 * though the Block row itself only records who initiated it.
 */
/** After a decline the requester can't ask the same player again for this long. */
const DECLINE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  private async toPublicView(user: {
    id: string;
    username: string;
    avatarKey: string | null;
  }): Promise<FriendPublicView> {
    return {
      userId: user.id,
      username: user.username,
      avatarUrl: await this.users.resolveAvatarUrl(user.avatarKey),
    };
  }

  private async isBlockedEitherWay(userAId: string, userBId: string): Promise<boolean> {
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userAId, blockedId: userBId },
          { blockerId: userBId, blockedId: userAId },
        ],
      },
      select: { id: true },
    });
    return block !== null;
  }

  /** Exact (case-sensitive, matching username's own uniqueness) lookup by
   * handle — never a partial/fuzzy match, so search never leaks a list of
   * "close" accounts. Returns null for self, a nonexistent username, or
   * a player blocked either way with the viewer, same as a genuine
   * not-found from the searcher's point of view. */
  async searchByUsername(viewerId: string, username: string): Promise<FriendPublicView | null> {
    const target = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, avatarKey: true, status: true, isGuest: true },
    });
    if (!target || target.id === viewerId || target.status === 'DELETED' || target.isGuest) {
      return null;
    }
    if (await this.isBlockedEitherWay(viewerId, target.id)) return null;
    return this.toPublicView(target);
  }

  async listFriends(userId: string): Promise<FriendPublicView[]> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: { select: { id: true, username: true, avatarKey: true } },
        addressee: { select: { id: true, username: true, avatarKey: true } },
      },
      orderBy: { respondedAt: 'desc' },
    });
    return Promise.all(
      rows.map((row) =>
        this.toPublicView(row.requesterId === userId ? row.addressee : row.requester),
      ),
    );
  }

  async listRequests(userId: string): Promise<FriendRequestsView> {
    const [incomingRows, outgoingRows] = await Promise.all([
      this.prisma.friendship.findMany({
        where: { addresseeId: userId, status: 'PENDING' },
        include: { requester: { select: { id: true, username: true, avatarKey: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.friendship.findMany({
        where: { requesterId: userId, status: 'PENDING' },
        include: { addressee: { select: { id: true, username: true, avatarKey: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const incoming = await Promise.all(
      incomingRows.map(async (row) => ({
        id: row.id,
        user: await this.toPublicView(row.requester),
        createdAt: row.createdAt.toISOString(),
      })),
    );
    const outgoing = await Promise.all(
      outgoingRows.map(async (row) => ({
        id: row.id,
        user: await this.toPublicView(row.addressee),
        createdAt: row.createdAt.toISOString(),
      })),
    );
    return { incoming, outgoing };
  }

  /** Sends a friend request by username. Idempotent-ish: re-sending after
   * the addressee already sent one back auto-accepts instead of creating
   * a redundant second row (two players requesting each other at once
   * should just become friends, not deadlock waiting on each other). */
  async sendRequest(
    requesterId: string,
    username: string,
  ): Promise<FriendRequestView | { accepted: true }> {
    const target = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, avatarKey: true, status: true },
    });
    if (!target || target.status === 'DELETED') {
      throw new NotFoundException('No player with that username.');
    }
    if (target.id === requesterId) {
      throw new BadRequestException('You cannot add yourself as a friend.');
    }
    if (await this.isBlockedEitherWay(requesterId, target.id)) {
      throw new ForbiddenException('You cannot add this player.');
    }

    const reverseExisting = await this.prisma.friendship.findUnique({
      where: { requesterId_addresseeId: { requesterId: target.id, addresseeId: requesterId } },
    });
    if (reverseExisting && reverseExisting.status === 'DECLINED') {
      // You declined them earlier; now you're the one reaching out, so the
      // old declined row has no meaning left -- clear it and carry on.
      await this.prisma.friendship.delete({ where: { id: reverseExisting.id } });
    } else if (reverseExisting) {
      if (reverseExisting.status === 'ACCEPTED') {
        throw new BadRequestException('You are already friends with this player.');
      }
      // They already requested you -- accept theirs instead of creating
      // a mirrored pending row that would just need the same handshake.
      await this.prisma.friendship.update({
        where: { id: reverseExisting.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      return { accepted: true };
    }

    const existing = await this.prisma.friendship.findUnique({
      where: { requesterId_addresseeId: { requesterId, addresseeId: target.id } },
    });
    if (existing) {
      if (existing.status === 'ACCEPTED') {
        throw new BadRequestException('You are already friends with this player.');
      }
      if (existing.status === 'DECLINED') {
        const declinedAt = existing.respondedAt?.getTime() ?? 0;
        if (Date.now() - declinedAt < DECLINE_COOLDOWN_MS) {
          // Deliberately vague -- don't tell the requester they were declined.
          throw new BadRequestException(
            "This player isn't accepting a friend request from you right now.",
          );
        }
        // Cooldown over: reopen the same row rather than creating a second one.
        const reopened = await this.prisma.friendship.update({
          where: { id: existing.id },
          data: { status: 'PENDING', respondedAt: null, createdAt: new Date() },
        });
        return {
          id: reopened.id,
          user: await this.toPublicView(target),
          createdAt: reopened.createdAt.toISOString(),
        };
      }
      throw new BadRequestException('A friend request is already pending with this player.');
    }

    const created = await this.prisma.friendship.create({
      data: { requesterId, addresseeId: target.id },
    });
    return {
      id: created.id,
      user: await this.toPublicView(target),
      createdAt: created.createdAt.toISOString(),
    };
  }

  async acceptRequest(userId: string, requestId: string): Promise<void> {
    const request = await this.loadPendingRequest(requestId);
    if (request.addresseeId !== userId) {
      throw new ForbiddenException('This request was not sent to you.');
    }
    await this.prisma.friendship.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });
  }

  async declineRequest(userId: string, requestId: string): Promise<void> {
    const request = await this.loadPendingRequest(requestId);
    if (request.addresseeId !== userId) {
      throw new ForbiddenException('This request was not sent to you.');
    }
    await this.prisma.friendship.update({
      where: { id: requestId },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
  }

  /** The sender withdrawing a request that is still pending. */
  async cancelRequest(userId: string, requestId: string): Promise<void> {
    const request = await this.loadPendingRequest(requestId);
    if (request.requesterId !== userId) {
      throw new ForbiddenException('This request was not sent by you.');
    }
    await this.prisma.friendship.delete({ where: { id: requestId } });
  }

  private async loadPendingRequest(requestId: string) {
    const request = await this.prisma.friendship.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Friend request not found.');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('This friend request has already been responded to.');
    }
    return request;
  }

  /** Removes an existing (ACCEPTED) friendship in either direction. A
   * no-op-but-not-an-error if the two were never friends -- unfriending
   * something that isn't there has nothing left to do. */
  async unfriend(userId: string, otherUserId: string): Promise<void> {
    await this.prisma.friendship.deleteMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: userId, addresseeId: otherUserId },
          { requesterId: otherUserId, addresseeId: userId },
        ],
      },
    });
  }

  /** Full, mutual block: removes any friendship or pending request
   * between the two (whichever direction), then records the block.
   * isBlockedEitherWay is what actually enforces the "can never re-add
   * / re-match" effect everywhere else this matters. */
  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new BadRequestException('You cannot block yourself.');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Player not found.');

    await this.prisma.$transaction([
      this.prisma.friendship.deleteMany({
        where: {
          OR: [
            { requesterId: blockerId, addresseeId: blockedId },
            { requesterId: blockedId, addresseeId: blockerId },
          ],
        },
      }),
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        create: { blockerId, blockedId },
        update: {},
      }),
    ]);
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
  }

  /**
   * The avatar-tap Profile popup's data source. `BLOCKED` covers both
   * directions (the viewer blocked them, or vice versa) -- from the
   * viewer's side, either way, there's nothing more to do here than see
   * the same read-only profile everyone else who isn't a friend sees.
   */
  async getProfile(viewerId: string, targetUserId: string): Promise<PublicProfileView> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        username: true,
        avatarKey: true,
        createdAt: true,
        status: true,
        clan: { select: { name: true } },
        progression: { select: { level: true, currentStreak: true } },
      },
    });
    if (!target || target.status === 'DELETED') throw new NotFoundException('Player not found.');
    // Someone who blocked the viewer looks exactly like a player that
    // doesn't exist (same as search). Showing them as "Blocked" told the
    // viewer they'd been blocked and offered an Unblock that did nothing.
    if (
      target.id !== viewerId &&
      (await this.prisma.block.findFirst({
        where: { blockerId: target.id, blockedId: viewerId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('Player not found.');
    }

    const relationship = await this.relationshipWith(viewerId, target.id);

    return {
      userId: target.id,
      username: target.username,
      avatarUrl: await this.users.resolveAvatarUrl(target.avatarKey),
      level: target.progression?.level ?? 1,
      currentStreak: target.progression?.currentStreak ?? 0,
      clanName: target.clan?.name ?? null,
      joinedAt: target.createdAt.toISOString(),
      relationship,
    };
  }

  private async relationshipWith(
    viewerId: string,
    targetUserId: string,
  ): Promise<FriendRelationship> {
    if (viewerId === targetUserId) return 'SELF';
    // Only the viewer's own block shows as BLOCKED (they can lift it);
    // being blocked by the target never reaches here (getProfile 404s).
    const viewerBlocked = await this.prisma.block.findFirst({
      where: { blockerId: viewerId, blockedId: targetUserId },
      select: { id: true },
    });
    if (viewerBlocked) return 'BLOCKED';

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: viewerId, addresseeId: targetUserId },
          { requesterId: targetUserId, addresseeId: viewerId },
        ],
      },
    });
    if (!friendship) return 'NONE';
    if (friendship.status === 'ACCEPTED') return 'FRIENDS';
    if (friendship.status === 'DECLINED') {
      // The decliner sees a clean slate; the declined sender still sees
      // "request sent" (they are never told they were declined).
      return friendship.requesterId === viewerId ? 'REQUEST_SENT' : 'NONE';
    }
    return friendship.requesterId === viewerId ? 'REQUEST_SENT' : 'REQUEST_RECEIVED';
  }

  /** Exposed for other modules (Word Duel matchmaking) that need to
   * exclude blocked pairs without importing FriendsService's whole
   * surface just for this one check. */
  async areBlocked(userAId: string, userBId: string): Promise<boolean> {
    return this.isBlockedEitherWay(userAId, userBId);
  }

  /** Exposed for other modules (Word Duel's post-match result, 2026-09)
   * that need to resolve a bare userId to the same narrow, non-PII
   * identity shape (username + avatarUrl) FriendPublicView already
   * uses, without importing UsersService separately just for this one
   * lookup. Returns null for a nonexistent user rather than throwing --
   * callers here are enriching an already-resolved row (e.g. a match
   * opponent), not looking a player up by an id they're unsure of. */
  async getPublicIdentity(userId: string): Promise<FriendPublicView | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, avatarKey: true },
    });
    if (!user) return null;
    return this.toPublicView(user);
  }
}
