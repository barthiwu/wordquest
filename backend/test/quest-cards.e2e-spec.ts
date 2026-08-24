import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Quest Cards gallery + showcase end to end (V19 Stabilization Spec §8).
 * QuestCardService.createCard is exercised by its own unit tests and by
 * the services that call it (Achievement/Boss-Battle/Journey) — this
 * suite's job is the player-facing read/showcase surface, seeded
 * directly via Prisma the same way the other new e2e suites in this
 * pass seed their preconditions.
 */
describe('Quest Cards (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-questcards-${Date.now()}@wordquest.test`;
  const otherEmail = `e2e-questcards-other-${Date.now()}@wordquest.test`;
  let accessToken: string;
  let userId: string;
  let otherUserId: string;
  let cardIds: string[];
  let otherCardId: string;

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
      .send({ email: testEmail, password: 'Sup3rSecret', displayName: 'Quest Cards E2E' })
      .expect(201);
    accessToken = registerRes.body.accessToken;
    userId = registerRes.body.user.id;

    const otherRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Sup3rSecret', displayName: 'Other Player' })
      .expect(201);
    otherUserId = otherRes.body.user.id;

    const cards = await Promise.all(
      ['first_step', 'first_mastery'].map((achievementId, i) =>
        prisma.questCard.create({
          data: {
            userId,
            source: 'ACHIEVEMENT',
            sourceEventId: achievementId,
            title: `Card ${i}`,
            category: 'DISCOVERY',
            playerDisplayNameSnapshot: 'Quest Cards E2E',
          },
        }),
      ),
    );
    cardIds = cards.map((c) => c.id);

    const otherCard = await prisma.questCard.create({
      data: {
        userId: otherUserId,
        source: 'ACHIEVEMENT',
        sourceEventId: 'first_step',
        title: "Other's Card",
        category: 'DISCOVERY',
        playerDisplayNameSnapshot: 'Other Player',
      },
    });
    otherCardId = otherCard.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [testEmail, otherEmail] } } });
    await app.close();
  });

  it('GET /quest-cards/me lists every card the player has earned', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/quest-cards/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body.map((c: { id: string }) => c.id).sort()).toEqual([...cardIds].sort());
  });

  it('GET /quest-cards/me/:id returns full detail for an owned card', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/quest-cards/me/${cardIds[0]}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({ id: cardIds[0], title: 'Card 0', source: 'ACHIEVEMENT' });
  });

  it('rejects reading a card that belongs to another player', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/quest-cards/me/${otherCardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('GET /quest-cards/me/showcase starts empty', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/quest-cards/me/showcase')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('PATCH /quest-cards/me/showcase sets the showcase in the given order', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/quest-cards/me/showcase')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cardIds: [cardIds[1], cardIds[0]] })
      .expect(200);

    expect(res.body.map((c: { id: string }) => c.id)).toEqual([cardIds[1], cardIds[0]]);
    expect(res.body[0].showcaseOrder).toBe(1);
    expect(res.body[1].showcaseOrder).toBe(2);

    const showcase = await request(app.getHttpServer())
      .get('/api/v1/quest-cards/me/showcase')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(showcase.body.map((c: { id: string }) => c.id)).toEqual([cardIds[1], cardIds[0]]);
  });

  it('PATCH with an empty array clears the showcase (full replace, not additive)', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/quest-cards/me/showcase')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cardIds: [] })
      .expect(200);

    const showcase = await request(app.getHttpServer())
      .get('/api/v1/quest-cards/me/showcase')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(showcase.body).toEqual([]);
  });

  it('rejects more than MAX_SHOWCASE_CARDS ids with 400', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/quest-cards/me/showcase')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cardIds: ['a', 'b', 'c', 'd', 'e', 'f'] })
      .expect(400);
  });

  it("rejects showcasing another player's card with 403", async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/quest-cards/me/showcase')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cardIds: [otherCardId] })
      .expect(403);
  });

  it('rejects an unauthenticated request to every route', async () => {
    await request(app.getHttpServer()).get('/api/v1/quest-cards/me').expect(401);
    await request(app.getHttpServer()).get('/api/v1/quest-cards/me/showcase').expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/quest-cards/me/showcase')
      .send({ cardIds: [] })
      .expect(401);
    await request(app.getHttpServer()).get(`/api/v1/quest-cards/me/${cardIds[0]}`).expect(401);
  });
});
