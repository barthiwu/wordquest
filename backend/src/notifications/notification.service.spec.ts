import { Test } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExpoPushProvider } from './push.provider';

describe('NotificationService', () => {
  let service: NotificationService;

  const prismaMock = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    pushToken: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const pushMock = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ExpoPushProvider, useValue: pushMock },
      ],
    }).compile();
    service = moduleRef.get(NotificationService);
  });

  // notify() fires push dispatch without awaiting it — flush the
  // microtask queue after each call so the fire-and-forget branch
  // actually runs before assertions inspect its effects.
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  describe('notify', () => {
    it('always writes the in-app Notification row first', async () => {
      prismaMock.notification.create.mockResolvedValueOnce({ id: 'n1' });
      prismaMock.user.findUnique.mockResolvedValueOnce({ timezone: 'UTC' });
      prismaMock.notificationPreference.findUnique.mockResolvedValueOnce(null);
      prismaMock.pushToken.findMany.mockResolvedValueOnce([]);

      await service.notify('u1', 'LEVEL_UP', 'Level up!', 'You reached level 5.');

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          type: 'LEVEL_UP',
          title: 'Level up!',
          body: 'You reached level 5.',
          deepLink: undefined,
          data: undefined,
        },
      });
    });

    it('does not push when the player has no registered device', async () => {
      prismaMock.notification.create.mockResolvedValueOnce({ id: 'n1' });
      prismaMock.user.findUnique.mockResolvedValueOnce({ timezone: 'UTC' });
      prismaMock.notificationPreference.findUnique.mockResolvedValueOnce(null);
      prismaMock.pushToken.findMany.mockResolvedValueOnce([]);

      await service.notify('u1', 'LEVEL_UP', 'Level up!', 'You reached level 5.');
      await flush();

      expect(pushMock.send).not.toHaveBeenCalled();
    });

    it('skips push when the category preference is disabled', async () => {
      prismaMock.notification.create.mockResolvedValueOnce({ id: 'n1' });
      prismaMock.user.findUnique.mockResolvedValueOnce({ timezone: 'UTC' });
      prismaMock.notificationPreference.findUnique.mockResolvedValueOnce({
        progressEnabled: false,
        quietHoursStartHour: null,
        quietHoursEndHour: null,
      });
      prismaMock.pushToken.findMany.mockResolvedValueOnce([{ token: 'tok1' }]);

      await service.notify('u1', 'LEVEL_UP', 'Level up!', 'You reached level 5.');
      await flush();

      expect(pushMock.send).not.toHaveBeenCalled();
    });

    it('skips push during the player local quiet hours', async () => {
      prismaMock.notification.create.mockResolvedValueOnce({ id: 'n1' });
      prismaMock.user.findUnique.mockResolvedValueOnce({ timezone: 'UTC' });
      prismaMock.notificationPreference.findUnique.mockResolvedValueOnce({
        progressEnabled: true,
        quietHoursStartHour: 0,
        quietHoursEndHour: 23,
      });
      prismaMock.pushToken.findMany.mockResolvedValueOnce([{ token: 'tok1' }]);

      await service.notify('u1', 'LEVEL_UP', 'Level up!', 'You reached level 5.');
      await flush();

      expect(pushMock.send).not.toHaveBeenCalled();
    });

    it('sends a push to every registered device and marks the notification sent', async () => {
      prismaMock.notification.create.mockResolvedValueOnce({ id: 'n1' });
      prismaMock.user.findUnique.mockResolvedValueOnce({ timezone: 'UTC' });
      prismaMock.notificationPreference.findUnique.mockResolvedValueOnce({
        progressEnabled: true,
        quietHoursStartHour: null,
        quietHoursEndHour: null,
      });
      prismaMock.pushToken.findMany.mockResolvedValueOnce([{ token: 'tok1' }, { token: 'tok2' }]);

      await service.notify('u1', 'LEVEL_UP', 'Level up!', 'You reached level 5.');
      await flush();

      expect(pushMock.send).toHaveBeenCalledWith([
        { to: 'tok1', title: 'Level up!', body: 'You reached level 5.', data: undefined },
        { to: 'tok2', title: 'Level up!', body: 'You reached level 5.', data: undefined },
      ]);
      expect(prismaMock.notification.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { sentAt: expect.any(Date) },
      });
    });

    it('merges deepLink into the push payload data so a tapped push can navigate', async () => {
      prismaMock.notification.create.mockResolvedValueOnce({ id: 'n1' });
      prismaMock.user.findUnique.mockResolvedValueOnce({ timezone: 'UTC' });
      prismaMock.notificationPreference.findUnique.mockResolvedValueOnce({
        progressEnabled: true,
        quietHoursStartHour: null,
        quietHoursEndHour: null,
      });
      prismaMock.pushToken.findMany.mockResolvedValueOnce([{ token: 'tok1' }]);

      await service.notify('u1', 'LEVEL_UP', 'Level up!', 'You reached level 5.', {
        deepLink: 'wordquest://journey',
        data: { level: 5 },
      });
      await flush();

      expect(pushMock.send).toHaveBeenCalledWith([
        {
          to: 'tok1',
          title: 'Level up!',
          body: 'You reached level 5.',
          data: { level: 5, deepLink: 'wordquest://journey' },
        },
      ]);
    });

    it('defaults every category to enabled when no preference row exists yet', async () => {
      prismaMock.notification.create.mockResolvedValueOnce({ id: 'n1' });
      prismaMock.user.findUnique.mockResolvedValueOnce({ timezone: 'UTC' });
      prismaMock.notificationPreference.findUnique.mockResolvedValueOnce(null);
      prismaMock.pushToken.findMany.mockResolvedValueOnce([{ token: 'tok1' }]);

      await service.notify('u1', 'BOSS_BATTLE_RESULT', 'Battle over', 'You placed 2nd.');
      await flush();

      expect(pushMock.send).toHaveBeenCalled();
    });
  });

  describe('getPreferences', () => {
    it('returns the default preference set when none exists yet', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValueOnce(null);
      const prefs = await service.getPreferences('u1');
      expect(prefs).toEqual({
        dailyQuestsEnabled: true,
        learningRemindersEnabled: true,
        progressEnabled: true,
        competitionEnabled: true,
        quietHoursStartHour: null,
        quietHoursEndHour: null,
      });
    });
  });

  describe('markRead / markAllRead', () => {
    it('scopes markRead to the owning user', async () => {
      await service.markRead('u1', 'n1');
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'n1', userId: 'u1' },
        data: { readAt: expect.any(Date) },
      });
    });

    it('marks every unread notification read', async () => {
      await service.markAllRead('u1');
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('registerPushToken', () => {
    it('upserts by token so a re-registered device updates rather than duplicates', async () => {
      await service.registerPushToken('u1', 'tok1', 'ios');
      expect(prismaMock.pushToken.upsert).toHaveBeenCalledWith({
        where: { token: 'tok1' },
        create: { userId: 'u1', token: 'tok1', platform: 'ios' },
        update: { userId: 'u1', platform: 'ios', lastSeenAt: expect.any(Date) },
      });
    });
  });
});
