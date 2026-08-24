import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ACHIEVEMENT_CATALOG } from '../src/achievement/achievement-catalog';

/**
 * Achievement catalog + player unlocks end to end (V20 Beta Release
 * Checklist §6). The full unlock-triggering flow (AchievementService.
 * unlock, called from Mastery/Progression/Boss-Battle code paths) is
 * already covered by those services' own unit tests — this suite's job
 * is the read surface real players hit: the public catalog and their
 * own unlock history, seeded directly for the "already unlocked" case
 * since manufacturing a real unlock over HTTP would mean replaying an
 * entire other subsystem's flow just to get one row.
 */
describe('Achievements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-achievements-${Date.now()}@wordquest.test`;
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
      .send({ email: testEmail, password: 'Sup3rSecret', displayName: 'Achievements E2E' })
      .expect(201);
    accessToken = registerRes.body.accessToken;
    userId = registerRes.body.user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('GET /achievements/catalog returns the full v1.0 list, every entry checkable', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/achievements/catalog')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(ACHIEVEMENT_CATALOG.length);
    expect(res.body.every((a: { checkable: boolean }) => a.checkable === true)).toBe(true);
    expect(res.body.map((a: { id: string }) => a.id)).toEqual(
      expect.arrayContaining(['first_step', 'first_mastery', 'seven_strong', 'boss_champion']),
    );
  });

  it('GET /achievements/me is empty for a fresh account', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/achievements/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('reflects a real unlock row once one exists', async () => {
    await prisma.achievementUnlock.create({
      data: { userId, achievementId: 'first_step' },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/achievements/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].achievementId).toBe('first_step');
    expect(res.body[0].unlockedAt).toBeDefined();
  });

  it('rejects an unauthenticated request to either route', async () => {
    await request(app.getHttpServer()).get('/api/v1/achievements/catalog').expect(401);
    await request(app.getHttpServer()).get('/api/v1/achievements/me').expect(401);
  });
});
