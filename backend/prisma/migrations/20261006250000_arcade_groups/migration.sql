-- CreateEnum
CREATE TYPE "ArcadeGroupStatus" AS ENUM ('LOBBY', 'ACTIVE', 'ENDED');

-- AlterTable
ALTER TABLE "arcade_game_sessions" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "arcade_groups" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "game" "ArcadeGame" NOT NULL,
    "status" "ArcadeGroupStatus" NOT NULL DEFAULT 'LOBBY',
    "hostId" TEXT NOT NULL,
    "title" TEXT,
    "maxMembers" INTEGER NOT NULL DEFAULT 50,
    "showLeaderboard" BOOLEAN NOT NULL DEFAULT true,
    "windowMinutes" INTEGER NOT NULL DEFAULT 60,
    "wordIds" TEXT[],
    "wordsPickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "arcade_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arcade_group_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arcade_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arcade_groups_code_key" ON "arcade_groups"("code");

-- CreateIndex
CREATE INDEX "arcade_groups_hostId_status_idx" ON "arcade_groups"("hostId", "status");

-- CreateIndex
CREATE INDEX "arcade_groups_status_expiresAt_idx" ON "arcade_groups"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "arcade_group_members_userId_idx" ON "arcade_group_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "arcade_group_members_groupId_userId_key" ON "arcade_group_members"("groupId", "userId");

-- CreateIndex
CREATE INDEX "arcade_game_sessions_groupId_idx" ON "arcade_game_sessions"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "arcade_game_sessions_groupId_userId_key" ON "arcade_game_sessions"("groupId", "userId");

-- AddForeignKey
ALTER TABLE "arcade_game_sessions" ADD CONSTRAINT "arcade_game_sessions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "arcade_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_groups" ADD CONSTRAINT "arcade_groups_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_group_members" ADD CONSTRAINT "arcade_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "arcade_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_group_members" ADD CONSTRAINT "arcade_group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

