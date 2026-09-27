-- English spelling-variant preference (2026-09, Barth: a US-fluent
-- speaker shouldn't have to fight a UK-spelled duel and vice versa).
-- All additive/nullable, same pattern as dateOfBirth/avatarKey --
-- existing accounts simply have no recorded preference yet, and
-- existing words simply have no US form recorded yet (columns are
-- populated by a follow-up backfill script + the CSV importer from now
-- on, not by this migration itself).

-- CreateEnum
CREATE TYPE "EnglishVariant" AS ENUM ('US', 'UK');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "englishVariant" "EnglishVariant";

-- AlterTable
ALTER TABLE "words" ADD COLUMN "wordUS" TEXT,
ADD COLUMN     "normalizedWordUS" TEXT,
ADD COLUMN     "exampleSentenceUS" TEXT;
