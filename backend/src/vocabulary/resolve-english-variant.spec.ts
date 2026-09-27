import { resolveEnglishVariant } from './resolve-english-variant';

describe('resolveEnglishVariant', () => {
  const prismaMock = { user: { findUnique: jest.fn() } };

  beforeEach(() => jest.clearAllMocks());

  it('returns the stored preference', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ englishVariant: 'US' });
    expect(await resolveEnglishVariant(prismaMock as any, 'u1')).toBe('US');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { englishVariant: true },
    });
  });

  it('returns null when the user has no preference recorded', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ englishVariant: null });
    expect(await resolveEnglishVariant(prismaMock as any, 'u1')).toBeNull();
  });

  it('returns null when the user row itself is somehow missing', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    expect(await resolveEnglishVariant(prismaMock as any, 'ghost')).toBeNull();
  });
});
