import { apiRequest } from './apiClient';

export type NotificationType =
  | 'MORNING_QUEST'
  | 'AFTERNOON_QUEST'
  | 'EVENING_QUEST'
  | 'REVIEW_REMINDER'
  | 'FORGETTING_CURVE_REMINDER'
  | 'WEAK_SKILL_REMINDER'
  | 'LEVEL_UP'
  | 'JOURNEY_UNLOCK'
  | 'ACHIEVEMENT_UNLOCK'
  | 'CEFR_UNLOCK'
  | 'BOSS_BATTLE_REMINDER'
  | 'BOSS_BATTLE_RESULT'
  | 'LEADERBOARD_UPDATE'
  | 'STREAK_AT_RISK';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  deepLink: string | null;
  data: unknown;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  dailyQuestsEnabled: boolean;
  learningRemindersEnabled: boolean;
  progressEnabled: boolean;
  competitionEnabled: boolean;
  quietHoursStartHour: number | null;
  quietHoursEndHour: number | null;
}

/** The Notification Engine's player-facing surface (spec §15/§19) — inbox, preferences, and this device's push token. */
export function getMyNotifications(
  accessToken: string,
  unreadOnly?: boolean,
): Promise<AppNotification[]> {
  const params = unreadOnly ? '?unreadOnly=true' : '';
  return apiRequest<AppNotification[]>(`/notifications${params}`, { accessToken });
}

export function markNotificationRead(accessToken: string, id: string): Promise<void> {
  return apiRequest<void>(`/notifications/${id}/read`, { method: 'POST', accessToken });
}

export function markAllNotificationsRead(accessToken: string): Promise<void> {
  return apiRequest<void>('/notifications/read-all', { method: 'POST', accessToken });
}

export function getNotificationPreferences(accessToken: string): Promise<NotificationPreferences> {
  return apiRequest<NotificationPreferences>('/notifications/preferences', { accessToken });
}

export function updateNotificationPreferences(
  accessToken: string,
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return apiRequest<NotificationPreferences>('/notifications/preferences', {
    method: 'PATCH',
    accessToken,
    body: patch,
  });
}

export function registerPushToken(
  accessToken: string,
  token: string,
  platform: 'ios' | 'android',
): Promise<void> {
  return apiRequest<void>('/notifications/push-tokens', {
    method: 'POST',
    accessToken,
    body: { token, platform },
  });
}

export function unregisterPushToken(accessToken: string, token: string): Promise<void> {
  return apiRequest<void>(`/notifications/push-tokens/${encodeURIComponent(token)}`, {
    method: 'DELETE',
    accessToken,
  });
}
