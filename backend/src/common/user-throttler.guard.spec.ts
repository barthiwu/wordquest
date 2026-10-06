import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigService } from '../config/config.service';
import { UserAwareThrottlerGuard } from './user-throttler.guard';

describe('UserAwareThrottlerGuard', () => {
  const SECRET = 'test-access-secret';
  let guard: UserAwareThrottlerGuard;
  let jwt: JwtService;

  const tracker = (req: Record<string, unknown>) =>
    (guard as unknown as { getTracker(r: Record<string, unknown>): Promise<string> }).getTracker(
      req,
    );

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
      providers: [
        UserAwareThrottlerGuard,
        JwtService,
        { provide: AppConfigService, useValue: { jwtAccessSecret: SECRET } },
      ],
    }).compile();
    guard = moduleRef.get(UserAwareThrottlerGuard);
    jwt = moduleRef.get(JwtService);
  });

  it('counts a signed-in player on their own, whatever IP they share', async () => {
    const token = await jwt.signAsync({ sub: 'u1' }, { secret: SECRET });
    const a = await tracker({ ip: '41.1.1.1', headers: { authorization: `Bearer ${token}` } });
    const b = await tracker({ ip: '41.9.9.9', headers: { authorization: `Bearer ${token}` } });
    expect(a).toBe('user:u1');
    expect(b).toBe('user:u1');
  });

  it('gives two students on one school IP separate budgets', async () => {
    const t1 = await jwt.signAsync({ sub: 'u1' }, { secret: SECRET });
    const t2 = await jwt.signAsync({ sub: 'u2' }, { secret: SECRET });
    const a = await tracker({ ip: '41.1.1.1', headers: { authorization: `Bearer ${t1}` } });
    const b = await tracker({ ip: '41.1.1.1', headers: { authorization: `Bearer ${t2}` } });
    expect(a).not.toBe(b);
  });

  it('uses the IP address with no token (login, register, password reset)', async () => {
    expect(await tracker({ ip: '41.1.1.1', headers: {} })).toBe('41.1.1.1');
    expect(await tracker({ ip: '41.1.1.1' })).toBe('41.1.1.1');
  });

  it("uses the IP address for a forged token, so nobody can spend another player's budget", async () => {
    const forged = await jwt.signAsync({ sub: 'victim' }, { secret: 'attacker-secret' });
    expect(await tracker({ ip: '6.6.6.6', headers: { authorization: `Bearer ${forged}` } })).toBe(
      '6.6.6.6',
    );
  });

  it('uses the IP address for an expired token or one that is not a bearer token', async () => {
    const expired = await jwt.signAsync({ sub: 'u1' }, { secret: SECRET, expiresIn: -10 });
    expect(await tracker({ ip: '1.2.3.4', headers: { authorization: `Bearer ${expired}` } })).toBe(
      '1.2.3.4',
    );
    expect(await tracker({ ip: '1.2.3.4', headers: { authorization: 'Basic abc' } })).toBe(
      '1.2.3.4',
    );
    expect(await tracker({ ip: '1.2.3.4', headers: { authorization: 'Bearer not.a.jwt' } })).toBe(
      '1.2.3.4',
    );
  });
});
