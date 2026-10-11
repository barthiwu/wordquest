-- CreateEnum
CREATE TYPE "ChatFlagSource" AS ENUM ('WORD_DUEL', 'ARCADE_VERSUS');

-- CreateEnum
CREATE TYPE "ChatFlagSeverity" AS ENUM ('BLOCKED', 'INSULT', 'REPORTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "chatMutedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "chat_flags" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reporterId" TEXT,
    "source" "ChatFlagSource" NOT NULL,
    "matchId" TEXT NOT NULL,
    "messageId" TEXT,
    "severity" "ChatFlagSeverity" NOT NULL,
    "body" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_flags_userId_createdAt_idx" ON "chat_flags"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_flags_severity_createdAt_idx" ON "chat_flags"("severity", "createdAt");

-- AddForeignKey
ALTER TABLE "chat_flags" ADD CONSTRAINT "chat_flags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
