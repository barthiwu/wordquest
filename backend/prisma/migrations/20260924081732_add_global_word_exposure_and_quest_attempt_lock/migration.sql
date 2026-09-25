-- 10,000-Word Adaptive Distribution & Repetition System: Layer A (global
-- word distribution) and daily quest locking.

-- AlterTable
ALTER TABLE "words" ADD COLUMN     "globalExposureCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastGlobalExposureAt" TIMESTAMP(3);

-- DropIndex
DROP INDEX "quest_attempts_userId_questId_localDate_idx";

-- CreateIndex
CREATE UNIQUE INDEX "quest_attempts_userId_questId_localDate_key" ON "quest_attempts"("userId", "questId", "localDate");
