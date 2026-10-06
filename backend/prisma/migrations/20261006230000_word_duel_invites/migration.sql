-- AlterTable
ALTER TABLE "word_duel_matches" ADD COLUMN     "invitedUserId" TEXT;

-- CreateIndex
CREATE INDEX "word_duel_matches_invitedUserId_status_idx" ON "word_duel_matches"("invitedUserId", "status");
