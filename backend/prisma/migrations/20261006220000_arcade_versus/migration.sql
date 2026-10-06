-- CreateEnum
CREATE TYPE "ArcadeVersusKind" AS ENUM ('RANDOM', 'FRIEND');

-- CreateEnum
CREATE TYPE "ArcadeVersusStatus" AS ENUM ('SEARCHING', 'INVITED', 'ACTIVE', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- AlterEnum


ALTER TYPE "NotificationType" ADD VALUE 'ARCADE_CHALLENGE';
ALTER TYPE "NotificationType" ADD VALUE 'ARCADE_RESULT';
ALTER TYPE "NotificationType" ADD VALUE 'ARCADE_PLAY_LIMIT';

-- AlterTable
ALTER TABLE "arcade_game_sessions" ADD COLUMN     "versusMatchId" TEXT;

-- CreateTable
CREATE TABLE "arcade_versus_matches" (
    "id" TEXT NOT NULL,
    "game" "ArcadeGame" NOT NULL,
    "kind" "ArcadeVersusKind" NOT NULL,
    "status" "ArcadeVersusStatus" NOT NULL,
    "hostId" TEXT NOT NULL,
    "guestId" TEXT,
    "wordIds" TEXT[],
    "wordsPickedAt" TIMESTAMP(3),
    "winnerId" TEXT,
    "resultReason" TEXT,
    "hostCorrect" INTEGER,
    "guestCorrect" INTEGER,
    "hostTimeMs" INTEGER,
    "guestTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "arcade_versus_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "arcade_versus_matches_status_game_kind_idx" ON "arcade_versus_matches"("status", "game", "kind");

-- CreateIndex
CREATE INDEX "arcade_versus_matches_hostId_status_idx" ON "arcade_versus_matches"("hostId", "status");

-- CreateIndex
CREATE INDEX "arcade_versus_matches_guestId_status_idx" ON "arcade_versus_matches"("guestId", "status");

-- CreateIndex
CREATE INDEX "arcade_versus_matches_expiresAt_idx" ON "arcade_versus_matches"("expiresAt");

-- CreateIndex
CREATE INDEX "arcade_game_sessions_versusMatchId_idx" ON "arcade_game_sessions"("versusMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "arcade_game_sessions_versusMatchId_userId_key" ON "arcade_game_sessions"("versusMatchId", "userId");

-- AddForeignKey
ALTER TABLE "arcade_game_sessions" ADD CONSTRAINT "arcade_game_sessions_versusMatchId_fkey" FOREIGN KEY ("versusMatchId") REFERENCES "arcade_versus_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_versus_matches" ADD CONSTRAINT "arcade_versus_matches_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_versus_matches" ADD CONSTRAINT "arcade_versus_matches_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

