import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Boss Battle (V1 Final Systems Spec §3.7/§21) end to end. The battle
 * window itself is a real, fixed weekly wall-clock window — every
 * Sunday 17:00-18:00 UTC (see battle-schedule.ts's nextBattleWindow,
 * deliberately not fakeable via dependency injection since the server's
 * own clock is meant to be the single source of truth, not something a
 * caller can override). That means this suite can only exercise the
 * happy "join and answer" path for real during that one hour a week —
 * everywhere else it deterministically exercises the SCHEDULED-state
 * gating, which is what `now` resolves to essentially all the time.
 */
describe('Boss Battle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-bossbattle-${Date.now()}@wordquest.test`;
  let accessToken: string;

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

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: 'Sup3rSecret', displayName: 'Battle E2E' })
      .expect(201);
    accessToken = registerRes.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('GET /boss-battle/upcoming always resolves to a real scheduled window, never errors', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/boss-battle/upcoming')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      weekId: expect.stringMatching(/^\d{4}-W\d{2}$/),
      status: expect.stringMatching(/^(SCHEDULED|LIVE|COMPLETED)$/),
    });
    expect(new Date(res.body.scheduledStartUtc).getTime()).not.toBeNaN();
    expect(new Date(res.body.scheduledEndUtc).getTime()).toBeGreaterThan(
      new Date(res.body.scheduledStartUtc).getTime(),
    );
  });

  it('GET /boss-battle/leaderboard 404s for a player who has never joined a battle', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/boss-battle/leaderboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(res.body.message).toMatch(/have not joined/i);
  });

  it('POST /boss-battle/join outside the live window is rejected with a clear reason, not a 500', async () => {
    const upcoming = await request(app.getHttpServer())
      .get('/api/v1/boss-battle/upcoming')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const joinRes = await request(app.getHttpServer())
      .post('/api/v1/boss-battle/join')
      .set('Authorization', `Bearer ${accessToken}`);

    if (upcoming.body.status === 'LIVE') {
      // The rare real case: this run happens to fall inside the actual
      // weekly window — exercise the real happy path instead.
      expect(joinRes.status).toBe(201);
      expect(joinRes.body).toHaveProperty('word');

      const leaderboard = await request(app.getHttpServer())
        .get('/api/v1/boss-battle/leaderboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      // Correction & Completion Spec §4: while the battle is LIVE, the
      // response is a private progress view — only the requesting
      // player's own entry, no rank, and no other player's data.
      expect(Array.isArray(leaderboard.body.entries)).toBe(true);
      expect(leaderboard.body.entries).toHaveLength(1);
      expect(leaderboard.body.entries[0]).toMatchObject({ isYou: true, rank: null });
    } else {
      expect(joinRes.status).toBe(400);
      expect(joinRes.body.message).toMatch(/hasn't started yet|has ended/i);
    }
  });

  it('rejects an unauthenticated request to every Boss Battle route', async () => {
    await request(app.getHttpServer()).get('/api/v1/boss-battle/upcoming').expect(401);
    await request(app.getHttpServer()).post('/api/v1/boss-battle/join').expect(401);
    await request(app.getHttpServer()).get('/api/v1/boss-battle/leaderboard').expect(401);
  });
});
