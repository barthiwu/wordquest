-- Word Duel in-game chat: messages table plus a new report target type. Additive only.
ALTER TYPE "ReportTargetType" ADD VALUE 'WORD_DUEL_MESSAGE';

-- CreateTable
CREATE TABLE "word_duel_messages" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "matchId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" VARCHAR(200) NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_duel_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "word_duel_messages_matchId_seq_idx" ON "word_duel_messages"("matchId", "seq");

-- CreateIndex
CREATE INDEX "word_duel_messages_createdAt_idx" ON "word_duel_messages"("createdAt");

-- AddForeignKey
ALTER TABLE "word_duel_messages" ADD CONSTRAINT "word_duel_messages_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "word_duel_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_duel_messages" ADD CONSTRAINT "word_duel_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
