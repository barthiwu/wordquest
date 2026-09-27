-- CreateEnum
CREATE TYPE "ArcadeGame" AS ENUM ('SCRAMBLE_QUEST', 'WORD_DUEL', 'COMPLETE_IT');

-- CreateEnum
CREATE TYPE "ArcadeSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "WordDuelMatchStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "arcade_game_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" "ArcadeGame" NOT NULL,
    "status" "ArcadeSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "wordsTotal" INTEGER NOT NULL,
    "totalXpAwarded" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "arcade_game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arcade_answers" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "wordIndex" INTEGER NOT NULL,
    "wordId" TEXT NOT NULL,
    "submittedAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "timedOut" BOOLEAN NOT NULL DEFAULT false,
    "baseXp" INTEGER NOT NULL,
    "speedModifier" DOUBLE PRECISION NOT NULL,
    "hintModifier" DOUBLE PRECISION NOT NULL,
    "streakModifier" DOUBLE PRECISION NOT NULL,
    "finalXpAwarded" INTEGER NOT NULL,
    "streakBefore" INTEGER NOT NULL,
    "streakAfter" INTEGER NOT NULL,
    "responseTimeMs" INTEGER,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arcade_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_duel_matches" (
    "id" TEXT NOT NULL,
    "status" "WordDuelMatchStatus" NOT NULL DEFAULT 'WAITING',
    "wordIds" TEXT[],
    "startedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "winnerId" TEXT,
    "tieBreakReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_duel_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_duel_player_states" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "reconnectedAt" TIMESTAMP(3),

    CONSTRAINT "word_duel_player_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_duel_answers" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerStateId" TEXT NOT NULL,
    "wordIndex" INTEGER NOT NULL,
    "wordId" TEXT NOT NULL,
    "submittedAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "cluesRevealed" INTEGER NOT NULL DEFAULT 0,
    "baseXp" INTEGER NOT NULL,
    "speedModifier" DOUBLE PRECISION NOT NULL,
    "streakModifier" DOUBLE PRECISION NOT NULL,
    "finalXpAwarded" INTEGER NOT NULL,
    "streakBefore" INTEGER NOT NULL,
    "streakAfter" INTEGER NOT NULL,
    "responseTimeMs" INTEGER,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_duel_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "arcade_game_sessions_userId_game_idx" ON "arcade_game_sessions"("userId", "game");

-- CreateIndex
CREATE INDEX "arcade_game_sessions_status_idx" ON "arcade_game_sessions"("status");

-- CreateIndex
CREATE INDEX "arcade_answers_sessionId_idx" ON "arcade_answers"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "arcade_answers_sessionId_wordIndex_key" ON "arcade_answers"("sessionId", "wordIndex");

-- CreateIndex
CREATE INDEX "word_duel_matches_status_idx" ON "word_duel_matches"("status");

-- CreateIndex
CREATE INDEX "word_duel_player_states_userId_idx" ON "word_duel_player_states"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "word_duel_player_states_matchId_userId_key" ON "word_duel_player_states"("matchId", "userId");

-- CreateIndex
CREATE INDEX "word_duel_answers_matchId_idx" ON "word_duel_answers"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "word_duel_answers_playerStateId_wordIndex_key" ON "word_duel_answers"("playerStateId", "wordIndex");

-- AddForeignKey
ALTER TABLE "arcade_game_sessions" ADD CONSTRAINT "arcade_game_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_answers" ADD CONSTRAINT "arcade_answers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "arcade_game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_answers" ADD CONSTRAINT "arcade_answers_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_duel_player_states" ADD CONSTRAINT "word_duel_player_states_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "word_duel_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_duel_player_states" ADD CONSTRAINT "word_duel_player_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_duel_answers" ADD CONSTRAINT "word_duel_answers_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "word_duel_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_duel_answers" ADD CONSTRAINT "word_duel_answers_playerStateId_fkey" FOREIGN KEY ("playerStateId") REFERENCES "word_duel_player_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_duel_answers" ADD CONSTRAINT "word_duel_answers_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
