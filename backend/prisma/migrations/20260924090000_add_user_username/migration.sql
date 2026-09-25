-- Public, unique player handle (privacy: multiplayer surfaces show this
-- instead of the account owner's real displayName -- see users.username
-- doc comment in schema.prisma).

-- AlterTable
ALTER TABLE "users" ADD COLUMN "username" TEXT;

-- Backfill: derive a lowercase alphanumeric/underscore username from each
-- existing displayName, falling back to "player" when nothing usable
-- survives normalization (e.g. a name in a non-Latin script), and always
-- suffixing an 8-hex-char slice of the row's own id (already globally
-- unique) so the NOT NULL + UNIQUE constraints below can never fail on
-- real data. Deliberately not "pretty" -- it's just a starting point the
-- player can change to a clean, available handle from Settings afterward.
UPDATE "users"
SET "username" = COALESCE(
  NULLIF(regexp_replace(lower("displayName"), '[^a-z0-9_]', '', 'g'), ''),
  'player'
) || '_' || substr(replace("id", '-', ''), 1, 8);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
