import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ArcadeGuestService } from './guest.service';

describe('ArcadeGuestService', () => {
  const prisma = {
    user: { create: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
  };
  const groups = { preview: jest.fn(), join: jest.fn(), shownNames: jest.fn() };
  const auth = { startGuestSession: jest.fn() };
  const service = new ArcadeGuestService(prisma as never, groups as never, auth as never);

  const open = { code: 'ABCDEFGHJK', full: false, maxMembers: 50, allowGuests: true };

  beforeEach(() => {
    jest.resetAllMocks();
    groups.preview.mockResolvedValue(open);
    prisma.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'g1', ...data, countryCode: null, avatarKey: null }),
    );
    groups.join.mockResolvedValue({ id: 'grp' });
    groups.shownNames.mockResolvedValue(['wordsmith']);
    auth.startGuestSession.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {} });
    prisma.user.delete.mockResolvedValue({});
  });

  it('creates a flagged guest with a placeholder email and an unusable password, joins, returns a session', async () => {
    const out = await service.join('ABCDEFGHJK', 'Chioma');

    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ isGuest: true, username: 'chioma', displayName: 'Chioma' });
    expect(data.displayName).toBe('Chioma'); // shown exactly as typed
    expect(data.email).toMatch(/^guest-.+@guest\.wordquest\.invalid$/);
    expect(data.passwordHash.startsWith('$2')).toBe(false); // never a real bcrypt hash
    expect(groups.join).toHaveBeenCalledWith('g1', 'ABCDEFGHJK', true);
    expect(auth.startGuestSession).toHaveBeenCalled();
    expect(out).toMatchObject({ accessToken: 'a', group: { id: 'grp' } });
  });

  it('does not create anyone when the group is full or gone', async () => {
    groups.preview.mockResolvedValueOnce({ ...open, full: true });
    await expect(service.join('ABCDEFGHJK', 'Chioma')).rejects.toBeInstanceOf(ConflictException);
    groups.preview.mockRejectedValueOnce(new NotFoundException());
    await expect(service.join('BADCODE123', 'Chioma')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('removes the guest again if joining fails (group filled up in between)', async () => {
    groups.join.mockRejectedValueOnce(new ConflictException('full'));
    await expect(service.join('ABCDEFGHJK', 'Chioma')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
    expect(auth.startGuestSession).not.toHaveBeenCalled();
  });

  it('picks another handle when the first is taken', async () => {
    prisma.user.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    await service.join('ABCDEFGHJK', 'Chioma');
    expect(prisma.user.create).toHaveBeenCalledTimes(2);
    expect(prisma.user.create.mock.calls[1][0].data.username).toMatch(/^chioma_\d{2}$/);
  });

  it('shows a guest under exactly the name typed, even one a real player already has', async () => {
    groups.shownNames.mockResolvedValueOnce(['wordsmith']);
    await service.join('ABCDEFGHJK', '  Barth  ');
    expect(prisma.user.create.mock.calls[0][0].data.displayName).toBe('Barth');
  });

  it('adds a number when two people in the same group pick the same name', async () => {
    groups.shownNames.mockResolvedValueOnce(['barth', 'barth 2']);
    await service.join('ABCDEFGHJK', 'Barth');
    expect(prisma.user.create.mock.calls[0][0].data.displayName).toBe('Barth 3');
  });

  it('refuses guests when the host only allows accounts, and creates nobody', async () => {
    groups.preview.mockResolvedValueOnce({ ...open, allowGuests: false });
    await expect(service.join('ABCDEFGHJK', 'Chioma')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('purges only stale guests and survives one failing delete', async () => {
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    prisma.user.delete.mockRejectedValueOnce(new Error('fk')).mockResolvedValueOnce({});
    await service.purgeStale();
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ isGuest: true });
    expect(prisma.user.delete).toHaveBeenCalledTimes(2);
  });
});
