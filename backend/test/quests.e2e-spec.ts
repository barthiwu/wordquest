import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Exercises the real first-playable-milestone loop end to end (§50):
 * register → start a Daily Quest → solve the Guess stage → transition
 * into Understanding → Sentence. Requires `npx prisma db seed` to have
 * run (the three timed quests + word pool must exist).
 *
 * This deliberately does NOT drive a word all the way to completion —
 * Sentence/Paragraph submission needs a real Anthropic API call, which
 * this environment has no credentials for (AI_PROVIDER_API_KEY). Those
 * stages' actual scoring behavior is covered by their own heavily-mocked
 * unit tests plus test/ai-eval's live-API quality checks (gated behind a
 * real key) — this suite's job is the real HTTP/DB wiring up to the
 * point where an external credential becomes the limiting factor, not a
 * re-test of AI judgment.
 *
 * Speaking/Pronunciation was removed from V1 entirely (Correction &
 * Completion Spec §1) — Paragraph now advances directly to Optional
 * Wild, so there is no further stage past Paragraph to exercise here.
 *
 * A wrong Guess answer never advances the word (spec: "unlimited
 * attempts until timeout") and there's no way to know the masked word
 * from outside the server, so this solves it deterministically via the
 * reveal-letter affordance rather than guessing blind.
 */
describe('Quests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-quest-${Date.now()}@wordquest.test`;
  let accessToken: string;
  let unlockedQuestKey: string;

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
      .send({ email: testEmail, password: 'Sup3rSecret', displayName: 'Quest E2E' })
      .expect(201);
    accessToken = registerRes.body.accessToken;

    // There is no quest keyed "daily" — the seed data is three
    // hour-windowed quests (morning/noon/evening) whose windows
    // together cover every hour of the day with no gaps, so exactly
    // one is always unlocked. Pick that one from the real catalog
    // response rather than hardcoding a key, so this test is correct
    // at whatever wall-clock hour it happens to run.
    const catalog = await request(app.getHttpServer())
      .get('/api/v1/quests')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const localHour = new Date().getUTCHours(); // fresh account has no timezone set — server falls back to UTC
    const unlocked = (
      catalog.body as Array<{
        key: string;
        windowStartHour: number | null;
        windowEndHour: number | null;
      }>
    ).find((q) => q.windowStartHour === null || localHour >= q.windowStartHour);
    if (!unlocked) {
      throw new Error(
        `No unlocked quest found for hour ${localHour} — check the seeded quest windows.`,
      );
    }
    unlockedQuestKey = unlocked.key;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('solves the Guess stage via reveal-letter, transitions to Understanding, then Sentence — without awarding quest completion early', async () => {
    const start = await request(app.getHttpServer())
      .post(`/api/v1/quests/${unlockedQuestKey}/start`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(start.body.wordCount).toBeGreaterThan(0);
    const questAttemptId: string = start.body.questAttemptId;
    let missingIndexes: number[] = start.body.missingIndexes;
    let displayPattern: string = start.body.displayPattern;

    // Reveal every blanked letter — guarantees a correct answer without
    // ever having to know the word from outside the server (see doc
    // comment above).
    while (missingIndexes.length > 0) {
      const reveal = await request(app.getHttpServer())
        .post(`/api/v1/quests/attempts/${questAttemptId}/reveal-letter`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
      displayPattern = reveal.body.displayPattern;
      missingIndexes = reveal.body.missingIndexes;
    }
    const solvedWord = displayPattern.replace(/\s+/g, '');

    const answerRes = await request(app.getHttpServer())
      .post(`/api/v1/quests/attempts/${questAttemptId}/answer`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ answer: solvedWord })
      .expect(201);

    expect(answerRes.body.isCorrect).toBe(true);
    expect(answerRes.body.timedOut).toBe(false);
    expect(answerRes.body.understanding).not.toBeNull();
    expect(answerRes.body.understanding.word.toLowerCase()).toBe(solvedWord.toLowerCase());

    const ackRes = await request(app.getHttpServer())
      .post(`/api/v1/quests/attempts/${questAttemptId}/acknowledge-understanding`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(ackRes.body.wordStage).toBe('SENTENCE');

    // Reward-timing correctness: a correct Guess awards its own XP
    // immediately (answerRes.body.xpAwarded, up to guessStage.maxXp —
    // see submitAnswer), but Glyphs and the daily streak are only
    // awarded by completeWord() once the FULL word cycle finishes (see
    // QuestsService.completeWord) — this attempt is nowhere near there
    // yet, so those two must still read exactly as they did for a
    // brand-new account.
    const progression = await request(app.getHttpServer())
      .get('/api/v1/progression/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(progression.body.totalXp).toBe(answerRes.body.xpAwarded);
    expect(progression.body.glyphBalance).toBe(0);
    expect(progression.body.currentStreak).toBe(0);
  });

  it('rejects answering a quest attempt that belongs to a different user', async () => {
    // A fresh "owner" account, not the shared accessToken from the test
    // above — that one already completed unlockedQuestKey today, and a
    // quest that's already been completed today can't be started again
    // (see QuestsService.startTimedQuest's completedToday check), so
    // reusing it here would 400 for an unrelated reason before the
    // cross-user authorization check even gets exercised.
    const ownerEmail = `e2e-quest-owner-${Date.now()}@wordquest.test`;
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: ownerEmail, password: 'Sup3rSecret', displayName: 'Quest Owner' })
      .expect(201);

    const otherEmail = `e2e-quest-other-${Date.now()}@wordquest.test`;
    const otherRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Sup3rSecret', displayName: 'Other Player' })
      .expect(201);

    const myQuest = await request(app.getHttpServer())
      .post(`/api/v1/quests/${unlockedQuestKey}/start`)
      .set('Authorization', `Bearer ${ownerRes.body.accessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/quests/attempts/${myQuest.body.questAttemptId}/answer`)
      .set('Authorization', `Bearer ${otherRes.body.accessToken}`)
      .send({ answer: 'anything' })
      .expect(403);

    await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, otherEmail] } } });
  });
});
