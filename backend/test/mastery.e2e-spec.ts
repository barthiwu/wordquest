import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * GET /users/me/words/:wordId/mastery (Spec v2 §19) end to end — the
 * per-word detail view MasteryService.getDetail returns. The live path
 * to a real MASTERED word needs a real Anthropic API call (Sentence/
 * Paragraph AI scoring — see quests.e2e-spec.ts's doc comment), which
 * this environment has no credentials for, so the "real data passes
 * through" half of this suite seeds a Mastery row directly via Prisma
 * rather than driving a full word cycle over HTTP.
 */
describe('Mastery detail (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-mastery-${Date.now()}@wordquest.test`;
  let accessToken: string;
  let userId: string;
  let wordId: string;

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
      .send({ email: testEmail, password: 'Sup3rSecret', displayName: 'Mastery E2E' })
      .expect(201);
    accessToken = registerRes.body.accessToken;
    userId = registerRes.body.user.id;

    const word = await prisma.word.findFirstOrThrow({ where: { isActive: true } });
    wordId = word.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('returns the default all-zero NEW shape for a word the player has never touched', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/users/me/words/${wordId}/mastery`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      wordId,
      currentLevel: 'NEW',
      masteryScore: 0,
      timesPresented: 0,
      timesCorrect: 0,
      timesIncorrect: 0,
      currentCorrectStreak: 0,
      guessScore: 0,
      sentenceScore: 0,
      paragraphScore: 0,
      lastPresentedAt: null,
      lastCorrectAt: null,
      masteredAt: null,
      nextReviewDueAt: null,
    });
  });

  it('returns the real persisted values once a Mastery row exists', async () => {
    const now = new Date();
    await prisma.mastery.create({
      data: {
        userId,
        wordId,
        currentLevel: 'MASTERED',
        masteryScore: 92,
        timesPresented: 6,
        timesCorrect: 5,
        timesIncorrect: 1,
        currentCorrectStreak: 3,
        guessScore: 100,
        sentenceScore: 80,
        paragraphScore: 85,
        lastPresentedAt: now,
        lastCorrectAt: now,
        lastReviewedAt: now,
        masteredAt: now,
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/users/me/words/${wordId}/mastery`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      wordId,
      currentLevel: 'MASTERED',
      masteryScore: 92,
      timesPresented: 6,
      timesCorrect: 5,
      timesIncorrect: 1,
      currentCorrectStreak: 3,
      guessScore: 100,
      sentenceScore: 80,
      paragraphScore: 85,
    });
    expect(res.body.lastPresentedAt).not.toBeNull();
    expect(res.body.masteredAt).not.toBeNull();
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer()).get(`/api/v1/users/me/words/${wordId}/mastery`).expect(401);
  });
});
