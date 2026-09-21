import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';
import { AppConfigService } from '../src/config/config.service';
import { nextBattleWindow } from '../src/boss-battle/battle-schedule';

/**
 * V22 §5 "Stress tests: 20 players joining simultaneously, 21st player
 * creating a new group, duplicate submissions, reward duplication
 * attempts" — exercised against the REAL Postgres instance (not the
 * mocked-Prisma unit tests in boss-battle.service.spec.ts), because the
 * whole point of a stress test is to prove the atomic-claim SQL actually
 * serializes correctly under real concurrent transactions, not just that
 * the mocked call sequence LOOKS right.
 *
 * The battle window is a real, fixed weekly wall-clock window
 * (battle-schedule.ts's nextBattleWindow) that's deliberately not
 * fakeable via DI — nothing here fakes the clock. Instead this seeds a
 * REAL BossBattle row for the CURRENT real week's weekId, with
 * scheduledStartUtc/scheduledEndUtc widened to bracket the real "now",
 * so BossBattleService.getOrCreateCurrentBattle's own
 * findUnique({ weekId }) genuinely finds and reuses it — exactly the
 * same code path a real Sunday-afternoon battle would take.
 */
describe('Boss Battle concurrency stress (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let jwt: JwtService;
  let config: AppConfigService;
  const testTag = `e2e-bbstress-${Date.now()}`;
  const createdUserIds: string[] = [];
  let seededBattleId: string;

  async function createEligiblePlayer(index: number): Promise<{ userId: string; token: string }> {
    const user = await users.create({
      email: `${testTag}-${index}@wordquest.test`,
      password: 'Sup3rSecret',
      displayName: `Stress ${index}`,
      dateOfBirth: new Date('2000-01-01'),
    });
    // minLevelToJoin is 2 — a brand-new account defaults to level 1.
    await prisma.userProgression.update({ where: { userId: user.id }, data: { level: 10 } });
    createdUserIds.push(user.id);
    const token = await jwt.signAsync(
      { sub: user.id },
      { secret: config.jwtAccessSecret, expiresIn: config.jwtAccessExpiresIn },
    );
    return { userId: user.id, token };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    users = app.get(UsersService);
    jwt = app.get(JwtService);
    config = app.get(AppConfigService);

    // Widen THIS week's real battle window so it's genuinely LIVE right
    // now, without touching the server clock or the schedule logic.
    // Delete any leftover battle row for this exact real weekId FIRST —
    // a previous run of this same suite earlier in the same ISO week
    // would otherwise leave stale BossBattleGroup rows behind (their
    // playerCount no longer matches reality once THEIR test users were
    // cleaned up, since deleting a user only cascade-deletes its
    // BossBattlePlayer row, not its group's counter) and pollute this
    // run's matchmaking. Cascades through Group -> Player.
    const window = nextBattleWindow(new Date());
    await prisma.bossBattle.deleteMany({ where: { weekId: window.weekId } });
    const seededBattle = await prisma.bossBattle.create({
      data: {
        weekId: window.weekId,
        scheduledStartUtc: new Date(Date.now() - 5 * 60_000),
        scheduledEndUtc: new Date(Date.now() + 55 * 60_000),
      },
    });
    seededBattleId = seededBattle.id;
  });

  afterAll(async () => {
    // Cascades to every BossBattleGroup/BossBattlePlayer this suite
    // created, so nothing is left behind to pollute a future run.
    await prisma.bossBattle.deleteMany({ where: { id: seededBattleId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it('fills a group to exactly 20 and routes the 21st+ joiner into a new group, with no lost or duplicated players', async () => {
    const PLAYER_COUNT = 23;
    const players = await Promise.all(
      Array.from({ length: PLAYER_COUNT }, (_, i) => createEligiblePlayer(1000 + i)),
    );

    const responses = await Promise.all(
      players.map((p) =>
        request(app.getHttpServer())
          .post('/api/v1/boss-battle/join')
          .set('Authorization', `Bearer ${p.token}`),
      ),
    );

    // Every eligible concurrent joiner succeeds — none should be dropped,
    // rejected, or 500 just because 22 others hit the same endpoint at
    // the same instant.
    responses.forEach((res) => expect(res.status).toBe(201));

    const rows = await prisma.bossBattlePlayer.findMany({
      where: { userId: { in: players.map((p) => p.userId) } },
      select: { userId: true, groupId: true },
    });

    // No lost or duplicated players — exactly one row per joiner.
    expect(rows).toHaveLength(PLAYER_COUNT);
    expect(new Set(rows.map((r) => r.userId)).size).toBe(PLAYER_COUNT);

    const byGroup = new Map<string, number>();
    for (const r of rows) byGroup.set(r.groupId, (byGroup.get(r.groupId) ?? 0) + 1);

    // No group ever exceeds the 20-player cap.
    for (const count of byGroup.values()) {
      expect(count).toBeLessThanOrEqual(20);
    }
    // 23 players, cap 20 -> at least 2 groups actually got used, and the
    // total across every group this test's players landed in still sums
    // to exactly 23 (nobody double-counted into two groups).
    expect(byGroup.size).toBeGreaterThanOrEqual(2);
    expect([...byGroup.values()].reduce((a, b) => a + b, 0)).toBe(PLAYER_COUNT);

    // Each group's own stored playerCount matches EXACTLY how many of
    // our rows actually landed in it (this battle was seeded empty in
    // beforeAll, so nothing else could have joined these groups yet) —
    // the atomic increment never drifted from the real row count under
    // concurrent claims.
    for (const [groupId, count] of byGroup) {
      const group = await prisma.bossBattleGroup.findUniqueOrThrow({ where: { id: groupId } });
      expect(group.playerCount).toBe(count);
    }
  }, 30_000);

  it('rejects every concurrent duplicate submission for the same question but the first, granting XP exactly once', async () => {
    const { userId, token } = await createEligiblePlayer(2000);
    await request(app.getHttpServer())
      .post('/api/v1/boss-battle/join')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const player = await prisma.bossBattlePlayer.findFirstOrThrow({ where: { userId } });
    const claimedWordId = player.currentWordId;
    expect(claimedWordId).not.toBeNull();

    const RACERS = 6;
    const responses = await Promise.all(
      Array.from({ length: RACERS }, () =>
        request(app.getHttpServer())
          .post('/api/v1/boss-battle/answer')
          .set('Authorization', `Bearer ${token}`)
          .send({ answer: 'whatever-the-guess-is' }),
      ),
    );

    const succeeded = responses.filter((r) => r.status === 201);
    const conflicted = responses.filter((r) => r.status === 409);
    // Exactly one racer wins the CAS claim on this exact question; every
    // other concurrent/duplicate submission for the SAME question is
    // rejected outright rather than silently reprocessed.
    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(RACERS - 1);

    const events = await prisma.bossBattleEvent.findMany({
      where: { playerId: player.id, wordId: claimedWordId! },
    });
    // Only one BossBattleEvent (and therefore only one XP grant) was ever
    // recorded for this question, no matter how many racers hit it.
    expect(events).toHaveLength(1);
  }, 30_000);

  it('grants finalization rewards exactly once even when many requests race to finalize the same ended group', async () => {
    const { userId, token } = await createEligiblePlayer(3000);
    await request(app.getHttpServer())
      .post('/api/v1/boss-battle/join')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const player = await prisma.bossBattlePlayer.findFirstOrThrow({ where: { userId } });
    // Every player in this suite shares the one BossBattle row seeded in
    // beforeAll, so ending its window in the past ends the battle for
    // everyone under it — harmless here since it's always the LAST test
    // in this file and the earlier tests already made and checked their
    // assertions before this runs.
    const group = await prisma.bossBattleGroup.findUniqueOrThrow({
      where: { id: player.groupId },
    });
    await prisma.bossBattle.update({
      where: { id: group.battleId },
      data: {
        scheduledStartUtc: new Date(Date.now() - 10 * 60_000),
        scheduledEndUtc: new Date(Date.now() - 1_000),
      },
    });

    const RACERS = 8;
    const responses = await Promise.all(
      Array.from({ length: RACERS }, () =>
        request(app.getHttpServer())
          .get('/api/v1/boss-battle/leaderboard')
          .set('Authorization', `Bearer ${token}`),
      ),
    );
    responses.forEach((res) => expect(res.status).toBe(200));

    const rewardGrants = await prisma.xpTransaction.findMany({
      where: { userId, reason: 'BOSS_BATTLE_REWARD', source: 'boss-battle', reference: group.id },
    });
    // No matter how many requests raced to trigger finalization, the
    // two-phase FINALIZING claim means the reward loop actually ran once.
    expect(rewardGrants).toHaveLength(1);

    const finalizedGroup = await prisma.bossBattleGroup.findUniqueOrThrow({
      where: { id: group.id },
    });
    expect(finalizedGroup.status).toBe('COMPLETED');
  }, 30_000);
});
