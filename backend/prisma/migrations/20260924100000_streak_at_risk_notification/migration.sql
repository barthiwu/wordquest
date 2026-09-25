-- Adds the STREAK_AT_RISK notification type: evening reminders (see
-- notificationScheduler.streakAtRiskLocalHours) for a player who hasn't
-- done anything quest-worthy yet today, so their streak is still on the
-- line. Postgres enum values can only be added, never removed/reordered,
-- in a single ALTER TYPE statement -- same pattern as every other
-- NotificationType/SecurityEventType/etc. addition in this migration history.
ALTER TYPE "NotificationType" ADD VALUE 'STREAK_AT_RISK';
