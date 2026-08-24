import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * GET /journey/me end to end (Screen Bible screens 20/21) — the dual
 * gate (Level AND masteredWordsCount, both required — Final Core
 * Progression Spec §2.2) computed server-side per stage. Crossing the
 * gate for real would need 50 real mastered words, so this suite
 * asserts the honest fresh-account shape first, then seeds
 * UserProgression directly to cross the Forest -> Hamlet gate and
 * verifies the computed unlocked/current fields flip correctly — same
 * direct-Prisma-seeding pattern as the other new e2e suites in this
 * pass.
 */
describe('Journey (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-journey-${Date.now()}@wordquest.test`;
  let accessToken: string;
  let userId: string;

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
      .send({ email: testEmail, password: 'Sup3rSecret', displayName: 'Journey E2E' })
      .expect(201);
    accessToken = registerRes.body.accessToken;
    userId = registerRes.body.user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('a fresh account starts at Forest, unlocked and current, with Hamlet locked as next', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/journey/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.currentStage).toMatchObject({
      stage: 0,
      key: 'forest',
      unlocked: true,
      current: true,
    });
    expect(res.body.nextStage).toMatchObject({ stage: 1, key: 'hamlet', unlocked: false });
    expect(Array.isArray(res.body.stages)).toBe(true);
    expect(res.body.stages.length).toBeGreaterThan(1);
  });

  it('unlocks Hamlet once BOTH Level and masteredWordsCount clear its gate, without unlocking Village', async () => {
    await prisma.userProgression.update({
      where: { userId },
      data: { level: 6, masteredWordsCount: 50, journeyStage: 1 },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/journey/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.currentStage).toMatchObject({
      stage: 1,
      key: 'hamlet',
      unlocked: true,
      current: true,
    });
    const forestStage = res.body.stages.find((s: { key: string }) => s.key === 'forest');
    expect(forestStage.unlocked).toBe(true);
    expect(forestStage.current).toBe(false);
    const villageStage = res.body.stages.find((s: { key: string }) => s.key === 'village');
    expect(villageStage.unlocked).toBe(false); // needs level 11 + 100 mastered — neither cleared
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer()).get('/api/v1/journey/me').expect(401);
  });
});
