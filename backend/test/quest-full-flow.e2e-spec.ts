import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SentenceEvaluationService } from '../src/sentence/sentence-evaluation.service';
import { ParagraphEvaluationService } from '../src/paragraph/paragraph-evaluation.service';
import { AliService } from '../src/ali/ali.service';

/**
 * V22 §4 "Daily Quest Full User Flow Test": Registration -> Onboarding
 * -> First Quest -> Guess -> Sentence -> Paragraph -> Word in the Wild
 * -> XP reward -> Progress update, verifying correct scoring/XP/mastery
 * updates/ALI reactions.
 *
 * quests.e2e-spec.ts deliberately stops at Sentence because Sentence/
 * Paragraph evaluation calls a real Anthropic API this sandbox has no
 * credential for (AI_PROVIDER_API_KEY unset) — see that file's doc
 * comment. This suite completes the rest of the journey by overriding
 * ONLY the two AI-evaluator providers (SentenceEvaluationService,
 * ParagraphEvaluationService) with deterministic stubs, and replacing
 * AliService with a spy — everything else (controllers, guards, real
 * Postgres, ProgressionService, MasteryService, AchievementService,
 * LearningProfileService, WordInTheWildService) is the real, wired-up
 * app. This is the correct boundary: it proves the HTTP/DB wiring
 * between every stage is genuinely correct end to end, without
 * re-testing AI judgment quality itself (already covered by
 * sentence/paragraph-evaluation.service.spec.ts's mocked unit tests).
 */
describe('Daily Quest full user-flow (e2e, mocked AI evaluators)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aliReactSpy: jest.Mock;
  const testEmail = `e2e-quest-fullflow-${Date.now()}@wordquest.test`;
  let accessToken: string;
  let unlockedQuestKey: string;

  const STRONG_SENTENCE_SCORES = {
    grammar: 90,
    vocabulary: 90,
    context: 90,
    naturalness: 90,
    clarity: 90,
  };
  const STRONG_PARAGRAPH_SCORES = {
    grammar: 90,
    vocabulary: 90,
    structure: 90,
    flow: 90,
    context: 90,
  };

  beforeAll(async () => {
    aliReactSpy = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SentenceEvaluationService)
      .useValue({
        isConfigured: () => true,
        evaluate: async () => ({
          scores: STRONG_SENTENCE_SCORES,
          xpAwarded: 1250, // 5 dimensions x 250 max, matching STRONG_SENTENCE_SCORES being maxed
          confidence: 0.95,
          whatWentWell: 'Clear and natural use of the target word.',
          whatNeedsImprovement: 'Nothing significant.',
          betterVersion: null,
          nextAction: 'Move on to the paragraph stage.',
        }),
      })
      .overrideProvider(ParagraphEvaluationService)
      .useValue({
        isConfigured: () => true,
        evaluate: async () => ({
          scores: STRONG_PARAGRAPH_SCORES,
          xpAwarded: 1750, // 5 dimensions x 350 max, matching STRONG_PARAGRAPH_SCORES being maxed
          confidence: 0.95,
          estimatedProficiency: 'B2',
          whatWentWell: 'Well-structured paragraph with natural flow.',
          whatNeedsImprovement: 'Nothing significant.',
          suggestedRevision: null,
          nextAction: 'Complete the word.',
        }),
      })
      .overrideProvider(AliService)
      .useValue({
        isConfigured: () => true,
        reactFireAndForget: aliReactSpy,
        react: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    // Registration (§4 step 1).
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: 'Sup3rSecret', displayName: 'Full Flow E2E' })
      .expect(201);
    accessToken = registerRes.body.accessToken;

    // Onboarding (§4 step 2) is represented by a brand-new account
    // having a real UserProgression row at its defaults — verified
    // explicitly below before the flow starts, rather than assumed.
    const progressionAtStart = await request(app.getHttpServer())
      .get('/api/v1/progression/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(progressionAtStart.body.totalXp).toBe(0);
    expect(progressionAtStart.body.glyphBalance).toBe(0);
    expect(progressionAtStart.body.level).toBe(1);

    const catalog = await request(app.getHttpServer())
      .get('/api/v1/quests')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const localHour = new Date().getUTCHours();
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

  it('completes the full word cycle — Guess -> Sentence -> Paragraph -> Word in the Wild -> completion — with correct XP, mastery, streak, and ALI wiring', async () => {
    // First Quest (§4 step 3).
    const start = await request(app.getHttpServer())
      .post(`/api/v1/quests/${unlockedQuestKey}/start`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const questAttemptId: string = start.body.questAttemptId;
    let missingIndexes: number[] = start.body.missingIndexes;
    let displayPattern: string = start.body.displayPattern;

    // Guess (§4 step 4) — solved deterministically via reveal-letter,
    // same technique as quests.e2e-spec.ts, since the masked word can't
    // be known from outside the server.
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
    const guessXp: number = answerRes.body.xpAwarded;
    // Revealing every letter costs the no-hint bonus, so guessXp should
    // still be a real, positive, XP-capped value — not 0 and not the
    // theoretical max.
    expect(guessXp).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post(`/api/v1/quests/attempts/${questAttemptId}/acknowledge-understanding`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    // Sentence (§4 step 5) — mocked evaluator, deterministic XP.
    const sentenceRes = await request(app.getHttpServer())
      .post(`/api/v1/quests/attempts/${questAttemptId}/sentence`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sentence: 'This is a perfectly natural sentence using the target word.' })
      .expect(201);
    expect(sentenceRes.body.scores).toEqual(STRONG_SENTENCE_SCORES);
    expect(sentenceRes.body.xpAwarded).toBe(1250);

    // Paragraph (§4 step 6) — 30-100 words, per QuestsService's own
    // server-side gate (checked BEFORE the AI evaluator is even called).
    const thirtyPlusWordParagraph = Array.from(
      { length: 32 },
      (_, i) => `word${i}`,
    ).join(' ');
    const paragraphRes = await request(app.getHttpServer())
      .post(`/api/v1/quests/attempts/${questAttemptId}/paragraph`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ paragraph: thirtyPlusWordParagraph })
      .expect(201);
    expect(paragraphRes.body.scores).toEqual(STRONG_PARAGRAPH_SCORES);
    expect(paragraphRes.body.xpAwarded).toBe(1750);
    expect(paragraphRes.body.estimatedProficiency).toBe('B2');

    // Word in the Wild (§4 step 7) — tied to this quest's specific word.
    const missionRes = await request(app.getHttpServer())
      .post(`/api/v1/quests/attempts/${questAttemptId}/optional-wild-mission`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(missionRes.body).toHaveProperty('id');

    // Word completion — the quest's own baseXp/baseGlyphs bonus, streak
    // recording, and Consistency/Independent-Learning achievement checks
    // all happen here (see QuestsService.completeWord's doc comment).
    const completeRes = await request(app.getHttpServer())
      .post(`/api/v1/quests/attempts/${questAttemptId}/complete-word`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(completeRes.body.xpAwarded).toBeGreaterThan(0);
    expect(completeRes.body.glyphAwarded).toBeGreaterThan(0);
    expect(completeRes.body.correctCount).toBe(1);
    expect(completeRes.body.totalCount).toBe(1);

    // XP reward + Progress update (§4 steps 8-9) — the FULL word cycle's
    // XP (Guess + Sentence + Paragraph + completion bonus) landed on the
    // player's real, persisted progression row, and Glyphs/streak moved
    // too, exactly as completeWord promised in its own response.
    const finalProgression = await request(app.getHttpServer())
      .get('/api/v1/progression/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const expectedTotalXp = guessXp + 1250 + 1750 + completeRes.body.xpAwarded;
    expect(finalProgression.body.totalXp).toBe(expectedTotalXp);
    expect(finalProgression.body.glyphBalance).toBe(completeRes.body.glyphAwarded);
    expect(finalProgression.body.currentStreak).toBe(1);

    // Correct mastery updates — a single clean correct Guess plus two
    // maxed-out AI stages should register a real, non-zero forward step
    // in this word's Mastery row (not necessarily all the way to
    // MASTERED, since MasteryService's guessScore is streak-based and
    // this attempt is this word's first-ever presentation — see
    // mastery.service.spec.ts's own dedicated MASTERED-gate tests for
    // that boundary), never left at the untouched default.
    const wordId = start.body.wordId ?? undefined;
    const attemptRow = await prisma.questAttempt.findUniqueOrThrow({
      where: { id: questAttemptId },
    });
    const masteryRow = await prisma.mastery.findUnique({
      where: {
        userId_wordId: {
          userId: (await prisma.user.findUniqueOrThrow({ where: { email: testEmail } })).id,
          wordId: attemptRow.wordIds[0],
        },
      },
    });
    expect(masteryRow).not.toBeNull();
    expect(masteryRow!.currentLevel).not.toBe('NEW');
    expect(masteryRow!.timesPresented).toBeGreaterThan(0);
    void wordId;

    // Correct ALI reactions — QUEST_COMPLETION fires from completeWord,
    // wired with the real journeyStage/context shape, proving the
    // service-to-service call happens at the right moment with the
    // right event, without depending on real AI output text.
    expect(aliReactSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'QUEST_COMPLETION' }),
    );
  }, 30_000);
});
