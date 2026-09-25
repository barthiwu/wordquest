-- Quest Cards are visible to other players (Boss Battle results, shared
-- showcases); the snapshot on each card must be the public username, not
-- the owner's real displayName (see users.username doc comment). Renaming
-- (not dropping+adding) preserves each card's existing snapshot column
-- identity; the backfill below replaces the real-name values that were
-- captured under the old column with each card's owner's current
-- username -- the closest available approximation of "the handle this
-- player went by," since no historical username exists to snapshot.

-- RenameColumn
ALTER TABLE "quest_cards" RENAME COLUMN "playerDisplayNameSnapshot" TO "playerUsernameSnapshot";

-- Backfill existing rows with each card owner's current username.
UPDATE "quest_cards" qc
SET "playerUsernameSnapshot" = u."username"
FROM "users" u
WHERE qc."userId" = u."id";
