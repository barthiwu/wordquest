-- One-time cleanup: the app used to have no database-level lock on
-- "one QuestAttempt per player per quest per local day", so a rare
-- concurrent double-tap could create two attempts for the same day.
-- Keeps the COMPLETED one when there is one (so no earned XP/rewards
-- are lost), otherwise the most recently started one; deletes the
-- rest (their ChallengeAttempt rows cascade-delete with them, which
-- is safe -- those are just per-answer history for the row being
-- removed, never data belonging to the kept row).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "userId", "questId", "localDate"
           ORDER BY (status = 'COMPLETED') DESC, "startedAt" DESC
         ) AS rn
  FROM quest_attempts
)
DELETE FROM quest_attempts
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
