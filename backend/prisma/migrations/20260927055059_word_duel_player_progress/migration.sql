-- AlterTable
ALTER TABLE "arcade_game_sessions" ADD COLUMN     "currentIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentWordHintsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentWordStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "wordIds" TEXT[];

-- AlterTable
ALTER TABLE "word_duel_player_states" ADD COLUMN     "currentIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentWordStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
