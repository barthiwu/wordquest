-- AlterTable
ALTER TABLE "users" ADD COLUMN     "plusUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "arcade_play_counts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" "ArcadeGame" NOT NULL,
    "localDate" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "arcade_play_counts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "arcade_play_counts_localDate_idx" ON "arcade_play_counts"("localDate");

-- CreateIndex
CREATE UNIQUE INDEX "arcade_play_counts_userId_game_localDate_key" ON "arcade_play_counts"("userId", "game", "localDate");

-- AddForeignKey
ALTER TABLE "arcade_play_counts" ADD CONSTRAINT "arcade_play_counts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

