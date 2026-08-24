import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Notification inbox + preferences end to end (V1 Remaining Systems
 * Spec §15/§19). The push-dispatch half (Expo delivery, quiet hours,
 * per-category gating) is covered by NotificationService's own unit
 * tests with a mocked push provider — this suite covers the real
 * HTTP/DB surface: list/read/read-all and the preferences upsert,
 * seeding inbox rows directly via Prisma since no other e2e-covered
 * flow in this environment reliably produces a notification (most
 * triggers — level-up, achievement unlock, journey advancement — need
 * a full progression cycle this environment's missing AI credentials
 * make impractical to drive over HTTP; see mastery/journeys/
 * achievements e2e suites for the same constraint).
 */
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-notifications-${Date.now()}@wordquest.test`;
  let accessToken: string;
  let userId: string;
  let notificationIds: string[];

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
      .send({ email: testEmail, password: 'Sup3rSecret', displayName: 'Notifications E2E' })
      .expect(201);
    accessToken = registerRes.body.accessToken;
    userId = registerRes.body.user.id;

    const notifications = await Promise.all([
      prisma.notification.create({
        data: {
          userId,
          type: 'ACHIEVEMENT_UNLOCK',
          title: 'Achievement Unlocked',
          body: 'You unlocked "First Step".',
        },
      }),
      prisma.notification.create({
        data: {
          userId,
          type: 'LEVEL_UP',
          title: 'Level Up',
          body: 'You reached level 2.',
        },
      }),
    ]);
    notificationIds = notifications.map((n) => n.id);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('GET /notifications lists both seeded notifications, newest first', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body.map((n: { id: string }) => n.id).sort()).toEqual([...notificationIds].sort());
    expect(res.body.every((n: { readAt: string | null }) => n.readAt === null)).toBe(true);
  });

  it('GET /notifications?unreadOnly=true also returns both while unread', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toHaveLength(2);
  });

  it('POST /notifications/:id/read marks only that one read', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/notifications/${notificationIds[0]}/read`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const unread = await request(app.getHttpServer())
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(unread.body).toHaveLength(1);
    expect(unread.body[0].id).toBe(notificationIds[1]);
  });

  it("rejects marking another player's notification read (no-op, not an error, and it stays unread)", async () => {
    const strangerEmail = `e2e-notifications-stranger-${Date.now()}@wordquest.test`;
    const stranger = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: strangerEmail, password: 'Sup3rSecret', displayName: 'Stranger' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/notifications/${notificationIds[1]}/read`)
      .set('Authorization', `Bearer ${stranger.body.accessToken}`)
      .expect(201);

    const unread = await request(app.getHttpServer())
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(unread.body).toHaveLength(1); // still unread — the stranger's request didn't touch it

    await prisma.user.deleteMany({ where: { email: strangerEmail } });
  });

  it('POST /notifications/read-all clears every remaining unread notification', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const unread = await request(app.getHttpServer())
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(unread.body).toEqual([]);
  });

  it('GET /notifications/preferences falls back to the default shape when no row exists yet', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toEqual({
      dailyQuestsEnabled: true,
      learningRemindersEnabled: true,
      progressEnabled: true,
      competitionEnabled: true,
      quietHoursStartHour: null,
      quietHoursEndHour: null,
    });
  });

  it('PATCH /notifications/preferences upserts a real preference row and persists it', async () => {
    const patchRes = await request(app.getHttpServer())
      .patch('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ dailyQuestsEnabled: false, quietHoursStartHour: 22, quietHoursEndHour: 6 })
      .expect(200);

    expect(patchRes.body).toMatchObject({
      dailyQuestsEnabled: false,
      learningRemindersEnabled: true,
      quietHoursStartHour: 22,
      quietHoursEndHour: 6,
    });

    const getRes = await request(app.getHttpServer())
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(getRes.body).toMatchObject({
      dailyQuestsEnabled: false,
      quietHoursStartHour: 22,
      quietHoursEndHour: 6,
    });
  });

  it('rejects an out-of-range quiet hour with 400', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ quietHoursStartHour: 24 })
      .expect(400);
  });

  it('rejects an unauthenticated request to every route', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications').expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/notifications/${notificationIds[0]}/read`)
      .expect(401);
    await request(app.getHttpServer()).post('/api/v1/notifications/read-all').expect(401);
    await request(app.getHttpServer()).get('/api/v1/notifications/preferences').expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/notifications/preferences')
      .send({})
      .expect(401);
  });
});
