-- CreateEnum
CREATE TYPE "ChatMessageKind" AS ENUM ('TEXT', 'QUICK');

-- AlterEnum
ALTER TYPE "ReportTargetType" ADD VALUE 'ARCADE_VERSUS_MESSAGE';

-- AlterTable
ALTER TABLE "word_duel_messages" ADD COLUMN "kind" "ChatMessageKind" NOT NULL DEFAULT 'TEXT';

-- CreateTable
CREATE TABLE "arcade_versus_messages" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "matchId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "kind" "ChatMessageKind" NOT NULL DEFAULT 'TEXT',
    "body" VARCHAR(200) NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arcade_versus_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "arcade_versus_messages_matchId_seq_idx" ON "arcade_versus_messages"("matchId", "seq");

-- CreateIndex
CREATE INDEX "arcade_versus_messages_createdAt_idx" ON "arcade_versus_messages"("createdAt");

-- AddForeignKey
ALTER TABLE "arcade_versus_messages" ADD CONSTRAINT "arcade_versus_messages_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "arcade_versus_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_versus_messages" ADD CONSTRAINT "arcade_versus_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
