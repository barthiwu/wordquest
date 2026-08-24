import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Glyph economy (V20 Beta Release Checklist §5 Glyph Economy Audit) end
 * to end: balance reads through /progression/me, the shop catalog, and
 * a real atomic purchase (debit + ownership record in one transaction —
 * see ShopService.purchase). The seed data ships with zero shop_items
 * rows (this is a cosmetics "foundation", not populated content yet —
 * confirmed via `psql`), so this suite seeds its own ShopItem directly
 * via Prisma rather than depending on catalog content that doesn't
 * exist. Glyph balance is likewise granted directly (no live path earns
 * Glyphs fast enough for a test) — this is the same direct-Prisma-
 * seeding-for-preconditions pattern already established in
 * auth.e2e-spec.ts.
 */
describe('Glyph economy / Shop (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-glyphs-${Date.now()}@wordquest.test`;
  let accessToken: string;
  let userId: string;
  let affordableItemId: string;
  let expensiveItemId: string;

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
      .send({ email: testEmail, password: 'Sup3rSecret', displayName: 'Glyphs E2E' })
      .expect(201);
    accessToken = registerRes.body.accessToken;
    userId = registerRes.body.user.id;

    const affordable = await prisma.shopItem.create({
      data: {
        key: `e2e-outfit-${Date.now()}`,
        name: 'E2E Test Outfit',
        description: 'A cosmetic outfit seeded for e2e coverage.',
        category: 'ALI_OUTFIT',
        priceGlyphs: 20,
        isActive: true,
      },
    });
    affordableItemId = affordable.id;

    const expensive = await prisma.shopItem.create({
      data: {
        key: `e2e-accessory-${Date.now()}`,
        name: 'E2E Test Accessory',
        description: 'A cosmetic accessory priced above the test balance.',
        category: 'ALI_ACCESSORY',
        priceGlyphs: 5000,
        isActive: true,
      },
    });
    expensiveItemId = expensive.id;

    // No live path grants Glyphs fast enough for a test — granted
    // directly, same pattern as the vocabulary-duplicate fix's DB
    // verification in this same pass.
    await prisma.userProgression.update({
      where: { userId },
      data: { glyphBalance: 50 },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.shopItem.deleteMany({
      where: { id: { in: [affordableItemId, expensiveItemId] } },
    });
    await app.close();
  });

  it('GET /progression/me reflects the seeded Glyph balance', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/progression/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.glyphBalance).toBe(50);
  });

  it('GET /shop/catalog lists the seeded item as active and not yet owned', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/shop/catalog')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const item = res.body.find((i: { id: string }) => i.id === affordableItemId);
    expect(item).toBeDefined();
    expect(item.owned).toBe(false);
    expect(item.priceGlyphs).toBe(20);
  });

  it('POST /shop/purchases atomically debits Glyphs and records ownership', async () => {
    const purchaseRes = await request(app.getHttpServer())
      .post('/api/v1/shop/purchases')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ itemId: affordableItemId })
      .expect(201);

    expect(purchaseRes.body).toMatchObject({ itemId: affordableItemId, priceGlyphs: 20 });

    const progression = await request(app.getHttpServer())
      .get('/api/v1/progression/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(progression.body.glyphBalance).toBe(30); // 50 - 20

    const catalog = await request(app.getHttpServer())
      .get('/api/v1/shop/catalog')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const item = catalog.body.find((i: { id: string }) => i.id === affordableItemId);
    expect(item.owned).toBe(true);
  });

  it('rejects repurchasing an already-owned item with 409, and Glyphs are not charged again', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/shop/purchases')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ itemId: affordableItemId })
      .expect(409);

    const progression = await request(app.getHttpServer())
      .get('/api/v1/progression/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(progression.body.glyphBalance).toBe(30); // unchanged
  });

  it('rejects a purchase the player cannot afford with 400, and Glyphs are not charged', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/shop/purchases')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ itemId: expensiveItemId })
      .expect(400);

    const progression = await request(app.getHttpServer())
      .get('/api/v1/progression/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(progression.body.glyphBalance).toBe(30); // unchanged
  });

  it('GET /shop/purchases reflects the real purchase in history', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/shop/purchases')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ itemId: affordableItemId, priceGlyphs: 20 });
  });

  it('rejects an unauthenticated request to every Shop route', async () => {
    await request(app.getHttpServer()).get('/api/v1/shop/catalog').expect(401);
    await request(app.getHttpServer()).get('/api/v1/shop/purchases').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/shop/purchases')
      .send({ itemId: affordableItemId })
      .expect(401);
  });
});
