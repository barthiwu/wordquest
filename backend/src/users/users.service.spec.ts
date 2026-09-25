import { BadRequestException, ConflictException } from '@nestjs/common';
import { UsersService, generateDefaultUsername, USERNAME_REGEX } from './users.service';

describe('generateDefaultUsername', () => {
  it('normalizes to lowercase alphanumeric/underscore and suffixes an id slice', () => {
    const username = generateDefaultUsername(
      'Ada Lovelace',
      'a1b2c3d4-e5f6-0000-0000-000000000000',
    );
    expect(username).toMatch(USERNAME_REGEX);
    expect(username.startsWith('adalovelace_')).toBe(true);
    expect(username.endsWith('a1b2c3d4')).toBe(true);
  });

  it('falls back to "player" when nothing survives normalization', () => {
    const username = generateDefaultUsername('日本語', 'a1b2c3d4-e5f6-0000-0000-000000000000');
    expect(username).toMatch(USERNAME_REGEX);
    expect(username.startsWith('player_')).toBe(true);
  });
});

describe('UsersService', () => {
  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  const storageMock = {
    isStorageConfigured: jest.fn().mockReturnValue(false),
  };

  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(prismaMock as any, storageMock as any);
  });

  describe('create', () => {
    it('generates and persists a default username derived from displayName', async () => {
      prismaMock.user.create.mockResolvedValueOnce({ id: 'u1', displayName: 'Grace Hopper' });

      await service.create({
        email: 'grace@example.com',
        password: 'Sup3rSecret',
        displayName: 'Grace Hopper',
        dateOfBirth: new Date('1990-01-01'),
      });

      expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
      const data = prismaMock.user.create.mock.calls[0][0].data;
      expect(data.username).toMatch(USERNAME_REGEX);
      expect(data.username.startsWith('gracehoppe')).toBe(true);
    });

    it('retries with a fresh username on a unique-constraint collision', async () => {
      const conflict = Object.assign(new Error('unique violation'), { code: 'P2002' });
      prismaMock.user.create.mockRejectedValueOnce(conflict).mockResolvedValueOnce({ id: 'u1' });

      await service.create({
        email: 'grace@example.com',
        password: 'Sup3rSecret',
        displayName: 'Grace Hopper',
        dateOfBirth: new Date('1990-01-01'),
      });

      expect(prismaMock.user.create).toHaveBeenCalledTimes(2);
    });

    it('seeds a real progression row and an age-appropriate starting LearningProfile', async () => {
      prismaMock.user.create.mockResolvedValueOnce({ id: 'u1' });

      await service.create({
        email: 'grace@example.com',
        password: 'Sup3rSecret',
        displayName: 'Grace Hopper',
        // A 1990 birthdate is comfortably 25+ as of "now" in every CI run.
        dateOfBirth: new Date('1990-01-01'),
      });

      const data = prismaMock.user.create.mock.calls[0][0].data;
      expect(data.progression).toEqual({ create: {} });
      expect(data.learningProfile).toEqual({ create: { currentDifficulty: 'INTERMEDIATE' } });
    });

    it('starts a teenage player at BEGINNER, per startingDifficultyByAgeRange', async () => {
      prismaMock.user.create.mockResolvedValueOnce({ id: 'u1' });
      const fifteenYearsAgo = new Date();
      fifteenYearsAgo.setFullYear(fifteenYearsAgo.getFullYear() - 15);

      await service.create({
        email: 'teen@example.com',
        password: 'Sup3rSecret',
        displayName: 'Teen Player',
        dateOfBirth: fifteenYearsAgo,
      });

      const data = prismaMock.user.create.mock.calls[0][0].data;
      expect(data.learningProfile).toEqual({ create: { currentDifficulty: 'BEGINNER' } });
    });
  });

  describe('updateProfile', () => {
    it('accepts a well-formed, available username', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null); // no existing holder
      prismaMock.user.update.mockResolvedValueOnce({ id: 'u1', username: 'grace_hopper' });

      await service.updateProfile('u1', { username: 'grace_hopper' });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { username: 'grace_hopper' },
      });
    });

    it('rejects a malformed username before touching the database', async () => {
      await expect(service.updateProfile('u1', { username: 'Has Spaces!' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('rejects a username already held by another player', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'someone-else' });

      await expect(service.updateProfile('u1', { username: 'taken' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('allows a player to "change" a username to the one they already hold', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1' });
      prismaMock.user.update.mockResolvedValueOnce({ id: 'u1', username: 'grace_hopper' });

      await expect(
        service.updateProfile('u1', { username: 'grace_hopper' }),
      ).resolves.toBeDefined();
    });

    it('surfaces a race-lost unique-constraint violation as a Conflict, not a raw Prisma error', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      const conflict = Object.assign(new Error('unique violation'), { code: 'P2002' });
      prismaMock.user.update.mockRejectedValueOnce(conflict);

      await expect(
        service.updateProfile('u1', { username: 'grace_hopper' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('updates displayName independently of username', async () => {
      prismaMock.user.update.mockResolvedValueOnce({ id: 'u1', displayName: 'Grace H.' });

      await service.updateProfile('u1', { displayName: 'Grace H.' });

      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { displayName: 'Grace H.' },
      });
    });
  });

  describe('isUsernameAvailable', () => {
    it('is false for a format-invalid candidate without querying the database', async () => {
      const available = await service.isUsernameAvailable('No Good!', 'u1');
      expect(available).toBe(false);
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('is true when nobody holds the username', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.isUsernameAvailable('freehandle', 'u1')).resolves.toBe(true);
    });

    it('is true when the current user already holds it (no-op rename)', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1' });
      await expect(service.isUsernameAvailable('grace_hopper', 'u1')).resolves.toBe(true);
    });

    it('is false when a different user holds it', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'someone-else' });
      await expect(service.isUsernameAvailable('grace_hopper', 'u1')).resolves.toBe(false);
    });
  });
});
