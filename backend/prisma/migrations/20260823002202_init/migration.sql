-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'CONTENT_EDITOR', 'SUPPORT');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "LearningGoal" AS ENUM ('CASUAL', 'TRAVEL', 'ACADEMIC', 'CAREER', 'FLUENCY');

-- CreateEnum
CREATE TYPE "GlyphDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "WordDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "MasteryLevel" AS ENUM ('NEW', 'RECOGNIZING', 'RECALLING', 'STRONG', 'MASTERED');

-- CreateEnum
CREATE TYPE "QuestType" AS ENUM ('DAILY', 'STANDARD');

-- CreateEnum
CREATE TYPE "QuestAttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "WordStage" AS ENUM ('GUESSING', 'UNDERSTANDING', 'SENTENCE', 'PARAGRAPH', 'SPEAKING', 'OPTIONAL_WILD', 'WORD_COMPLETE');

-- CreateEnum
CREATE TYPE "ChallengeType" AS ENUM ('LETTER_OMISSION', 'MULTIPLE_CHOICE', 'FILL_IN_BLANK', 'MEANING_SELECTION', 'CONTEXT_SELECTION', 'DEFINITION_TO_WORD', 'WORD_TO_DEFINITION', 'SYNONYM', 'ANTONYM', 'SENTENCE_CONSTRUCTION', 'WRITING', 'SPEAKING', 'RECALL', 'WORD_IN_THE_WILD');

-- CreateEnum
CREATE TYPE "WordInTheWildMissionStatus" AS ENUM ('OPEN', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "WordInTheWildEvidenceType" AS ENUM ('TEXT', 'PHOTO');

-- CreateEnum
CREATE TYPE "WordInTheWildAssessmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BossBattleStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BossBattleGroupStatus" AS ENUM ('FORMING', 'LIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OrderName" AS ENUM ('SCRIBES', 'SEEKERS', 'ORATORS', 'ARTISANS');

-- CreateEnum
CREATE TYPE "QuestCardSource" AS ENUM ('JOURNEY_COMPLETION', 'BOSS_BATTLE_WIN', 'ACHIEVEMENT');

-- CreateEnum
CREATE TYPE "QuestCardRarity" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "CefrAssessmentSource" AS ENUM ('PARAGRAPH_SUBMISSION', 'SPEAKING_SUBMISSION', 'CALIBRATION');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MORNING_QUEST', 'AFTERNOON_QUEST', 'EVENING_QUEST', 'REVIEW_REMINDER', 'FORGETTING_CURVE_REMINDER', 'WEAK_SKILL_REMINDER', 'LEVEL_UP', 'JOURNEY_UNLOCK', 'ACHIEVEMENT_UNLOCK', 'CEFR_UNLOCK', 'BOSS_BATTLE_REMINDER', 'BOSS_BATTLE_RESULT', 'LEADERBOARD_UPDATE');

-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED', 'EMAIL_VERIFIED', 'ACCOUNT_RECOVERED', 'ACCOUNT_DELETED', 'REFRESH_TOKEN_REUSE_DETECTED');

-- CreateEnum
CREATE TYPE "AliEventType" AS ENUM ('LEVEL_UP', 'JOURNEY_COMPLETION', 'ACHIEVEMENT_UNLOCK', 'BOSS_BATTLE_RESULT', 'STREAK_MILESTONE', 'MASTERY_EVENT', 'ORDER_SELECTION', 'MISTAKE_EXPLANATION', 'VOCABULARY_ALTERNATIVES', 'WRITING_FEEDBACK', 'FORGETTING_CURVE_REMINDER');

-- CreateEnum
CREATE TYPE "MasterChallengeStatus" AS ENUM ('LOCKED', 'AVAILABLE', 'COMPLETED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "countryCode" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "timezone" TEXT,
    "nativeLanguage" TEXT,
    "targetLanguage" TEXT,
    "learningGoal" "LearningGoal",
    "onboardingCompletedAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clanId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lore" TEXT NOT NULL,
    "bannerAsset" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_progression" (
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "glyphBalance" INTEGER NOT NULL DEFAULT 0,
    "journeyStage" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActiveOn" TIMESTAMP(3),
    "masteredWordsCount" INTEGER NOT NULL DEFAULT 0,
    "bossBattlesCompleted" INTEGER NOT NULL DEFAULT 0,
    "cefrUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "cefrUnlockedAt" TIMESTAMP(3),
    "estimatedCefrLevel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_progression_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "xp_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "glyph_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "direction" "GlyphDirection" NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "glyph_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "words" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "normalizedWord" TEXT NOT NULL,
    "length" INTEGER NOT NULL,
    "definition" TEXT NOT NULL,
    "partOfSpeech" TEXT NOT NULL,
    "exampleSentence" TEXT NOT NULL,
    "baseDifficulty" "WordDifficulty" NOT NULL,
    "cefrLevel" TEXT,
    "category" TEXT,
    "difficultyScore" DOUBLE PRECISION,
    "usageNotes" TEXT,
    "synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "antonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relatedWords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pronunciation" TEXT,
    "phoneticRepresentation" TEXT,
    "audioUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "example_sentences" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "example_sentences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "masteries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "currentLevel" "MasteryLevel" NOT NULL DEFAULT 'NEW',
    "masteryScore" INTEGER NOT NULL DEFAULT 0,
    "timesPresented" INTEGER NOT NULL DEFAULT 0,
    "timesCorrect" INTEGER NOT NULL DEFAULT 0,
    "timesIncorrect" INTEGER NOT NULL DEFAULT 0,
    "currentCorrectStreak" INTEGER NOT NULL DEFAULT 0,
    "guessScore" INTEGER NOT NULL DEFAULT 0,
    "sentenceScore" INTEGER NOT NULL DEFAULT 0,
    "paragraphScore" INTEGER NOT NULL DEFAULT 0,
    "speakingScore" INTEGER NOT NULL DEFAULT 0,
    "pronunciationScore" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewDueAt" TIMESTAMP(3),
    "forgettingRisk" DOUBLE PRECISION DEFAULT 0,
    "lastPresentedAt" TIMESTAMP(3),
    "lastCorrectAt" TIMESTAMP(3),
    "masteredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "masteries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quests" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "QuestType" NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 5,
    "baseXp" INTEGER NOT NULL DEFAULT 50,
    "baseGlyphs" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "windowStartHour" INTEGER,
    "windowEndHour" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "status" "QuestAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "wordIds" TEXT[],
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "localDate" TEXT NOT NULL,
    "currentDisplayPattern" TEXT,
    "currentMissingIndexes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "guessStartedAt" TIMESTAMP(3),
    "wrongAttempts" INTEGER NOT NULL DEFAULT 0,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "synonymsUsed" INTEGER NOT NULL DEFAULT 0,
    "lettersRevealed" INTEGER NOT NULL DEFAULT 0,
    "wordStage" "WordStage" NOT NULL DEFAULT 'GUESSING',
    "sentenceText" TEXT,
    "sentenceScores" JSONB,
    "sentenceXpAwarded" INTEGER NOT NULL DEFAULT 0,
    "paragraphText" TEXT,
    "paragraphScores" JSONB,
    "paragraphEstimatedProficiency" TEXT,
    "paragraphXpAwarded" INTEGER NOT NULL DEFAULT 0,
    "speakingAudioKey" TEXT,
    "speakingTranscript" TEXT,
    "speakingScores" JSONB,
    "speakingXpAwarded" INTEGER NOT NULL DEFAULT 0,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "glyphAwarded" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "quest_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questAttemptId" TEXT,
    "wordId" TEXT NOT NULL,
    "challengeType" "ChallengeType" NOT NULL DEFAULT 'LETTER_OMISSION',
    "displayPattern" TEXT,
    "missingIndexes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "presentedOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submittedAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "responseTimeMs" INTEGER,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_in_the_wild_missions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "status" "WordInTheWildMissionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_in_the_wild_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_in_the_wild_submissions" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "evidenceType" "WordInTheWildEvidenceType" NOT NULL,
    "evidenceText" TEXT,
    "photoKey" TEXT,
    "assessmentStatus" "WordInTheWildAssessmentStatus" NOT NULL DEFAULT 'PENDING',
    "assessmentReasoning" TEXT,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "challengeAttemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "word_in_the_wild_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_battles" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "scheduledStartUtc" TIMESTAMP(3) NOT NULL,
    "scheduledEndUtc" TIMESTAMP(3) NOT NULL,
    "status" "BossBattleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "boss_battles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_battle_groups" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "groupNumber" INTEGER NOT NULL,
    "status" "BossBattleGroupStatus" NOT NULL DEFAULT 'FORMING',
    "playerCount" INTEGER NOT NULL DEFAULT 0,
    "sharedWordIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boss_battle_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_battle_players" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "battleXp" INTEGER NOT NULL DEFAULT 0,
    "correctAnswers" INTEGER NOT NULL DEFAULT 0,
    "incorrectAnswers" INTEGER NOT NULL DEFAULT 0,
    "lastXpAt" TIMESTAMP(3),
    "finalRank" INTEGER,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "questionIndex" INTEGER NOT NULL DEFAULT 0,
    "currentWordId" TEXT,
    "currentDisplayPattern" TEXT,
    "currentMissingIndexes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],

    CONSTRAINT "boss_battle_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_battle_events" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "submittedAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "xpAwarded" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boss_battle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_selections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "order" "OrderName" NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_unlocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_cards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "QuestCardSource" NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "playerDisplayNameSnapshot" TEXT NOT NULL,
    "artwork" TEXT,
    "rarity" "QuestCardRarity" NOT NULL DEFAULT 'COMMON',
    "journeyStageKey" TEXT,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quest_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_profiles" (
    "userId" TEXT NOT NULL,
    "calibrated" BOOLEAN NOT NULL DEFAULT false,
    "calibrationWordsCompleted" INTEGER NOT NULL DEFAULT 0,
    "currentDifficulty" "WordDifficulty" NOT NULL DEFAULT 'BEGINNER',
    "recommendedDifficulty" "WordDifficulty",
    "recommendedDifficultyAcceptedAt" TIMESTAMP(3),
    "initialCefrEstimate" TEXT,
    "weaknessAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avgGuessAccuracy" DOUBLE PRECISION DEFAULT 0,
    "avgResponseSpeedMs" INTEGER DEFAULT 0,
    "hintDependencyRate" DOUBLE PRECISION DEFAULT 0,
    "learningConsistency" DOUBLE PRECISION DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "cefr_assessments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "CefrAssessmentSource" NOT NULL,
    "level" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "dimensions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cefr_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deepLink" TEXT,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" TEXT NOT NULL,
    "dailyQuestsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "learningRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "progressEnabled" BOOLEAN NOT NULL DEFAULT true,
    "competitionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursStartHour" INTEGER,
    "quietHoursEndHour" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SecurityEventType" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_items" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priceGlyphs" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "priceGlyphs" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ali_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "AliEventType" NOT NULL,
    "eventContext" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "recommendation" TEXT,
    "tone" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ali_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_master_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "status" "MasterChallengeStatus" NOT NULL DEFAULT 'LOCKED',
    "paragraphText" TEXT,
    "scores" JSONB,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_master_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_clanId_idx" ON "users"("clanId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "clans_name_key" ON "clans"("name");

-- CreateIndex
CREATE INDEX "xp_transactions_userId_createdAt_idx" ON "xp_transactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "glyph_transactions_userId_createdAt_idx" ON "glyph_transactions"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "words_word_key" ON "words"("word");

-- CreateIndex
CREATE INDEX "words_baseDifficulty_idx" ON "words"("baseDifficulty");

-- CreateIndex
CREATE INDEX "words_cefrLevel_idx" ON "words"("cefrLevel");

-- CreateIndex
CREATE INDEX "words_category_idx" ON "words"("category");

-- CreateIndex
CREATE INDEX "example_sentences_wordId_idx" ON "example_sentences"("wordId");

-- CreateIndex
CREATE INDEX "masteries_userId_currentLevel_idx" ON "masteries"("userId", "currentLevel");

-- CreateIndex
CREATE INDEX "masteries_userId_nextReviewDueAt_idx" ON "masteries"("userId", "nextReviewDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "masteries_userId_wordId_key" ON "masteries"("userId", "wordId");

-- CreateIndex
CREATE UNIQUE INDEX "quests_key_key" ON "quests"("key");

-- CreateIndex
CREATE INDEX "quest_attempts_userId_status_idx" ON "quest_attempts"("userId", "status");

-- CreateIndex
CREATE INDEX "quest_attempts_userId_questId_localDate_idx" ON "quest_attempts"("userId", "questId", "localDate");

-- CreateIndex
CREATE INDEX "challenge_attempts_questAttemptId_idx" ON "challenge_attempts"("questAttemptId");

-- CreateIndex
CREATE INDEX "challenge_attempts_userId_idx" ON "challenge_attempts"("userId");

-- CreateIndex
CREATE INDEX "word_in_the_wild_missions_userId_status_idx" ON "word_in_the_wild_missions"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "word_in_the_wild_submissions_missionId_key" ON "word_in_the_wild_submissions"("missionId");

-- CreateIndex
CREATE UNIQUE INDEX "word_in_the_wild_submissions_challengeAttemptId_key" ON "word_in_the_wild_submissions"("challengeAttemptId");

-- CreateIndex
CREATE INDEX "word_in_the_wild_submissions_userId_idx" ON "word_in_the_wild_submissions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "boss_battles_weekId_key" ON "boss_battles"("weekId");

-- CreateIndex
CREATE INDEX "boss_battle_groups_battleId_status_idx" ON "boss_battle_groups"("battleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "boss_battle_groups_battleId_groupNumber_key" ON "boss_battle_groups"("battleId", "groupNumber");

-- CreateIndex
CREATE INDEX "boss_battle_players_groupId_battleXp_idx" ON "boss_battle_players"("groupId", "battleXp");

-- CreateIndex
CREATE UNIQUE INDEX "boss_battle_players_groupId_userId_key" ON "boss_battle_players"("groupId", "userId");

-- CreateIndex
CREATE INDEX "boss_battle_events_playerId_idx" ON "boss_battle_events"("playerId");

-- CreateIndex
CREATE INDEX "order_selections_userId_selectedAt_idx" ON "order_selections"("userId", "selectedAt");

-- CreateIndex
CREATE INDEX "achievement_unlocks_userId_idx" ON "achievement_unlocks"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "achievement_unlocks_userId_achievementId_key" ON "achievement_unlocks"("userId", "achievementId");

-- CreateIndex
CREATE INDEX "quest_cards_userId_idx" ON "quest_cards"("userId");

-- CreateIndex
CREATE INDEX "cefr_assessments_userId_createdAt_idx" ON "cefr_assessments"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_userId_idx" ON "push_tokens"("userId");

-- CreateIndex
CREATE INDEX "security_events_userId_createdAt_idx" ON "security_events"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "shop_items_key_key" ON "shop_items"("key");

-- CreateIndex
CREATE INDEX "shop_purchases_userId_purchasedAt_idx" ON "shop_purchases"("userId", "purchasedAt");

-- CreateIndex
CREATE INDEX "ali_messages_userId_createdAt_idx" ON "ali_messages"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "daily_master_challenges_userId_localDate_key" ON "daily_master_challenges"("userId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_userId_key_endpoint_key" ON "idempotency_keys"("userId", "key", "endpoint");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_progression" ADD CONSTRAINT "user_progression_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "glyph_transactions" ADD CONSTRAINT "glyph_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "example_sentences" ADD CONSTRAINT "example_sentences_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "masteries" ADD CONSTRAINT "masteries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "masteries" ADD CONSTRAINT "masteries_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_attempts" ADD CONSTRAINT "quest_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_attempts" ADD CONSTRAINT "quest_attempts_questId_fkey" FOREIGN KEY ("questId") REFERENCES "quests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_questAttemptId_fkey" FOREIGN KEY ("questAttemptId") REFERENCES "quest_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_in_the_wild_missions" ADD CONSTRAINT "word_in_the_wild_missions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_in_the_wild_missions" ADD CONSTRAINT "word_in_the_wild_missions_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_in_the_wild_submissions" ADD CONSTRAINT "word_in_the_wild_submissions_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "word_in_the_wild_missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_in_the_wild_submissions" ADD CONSTRAINT "word_in_the_wild_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_in_the_wild_submissions" ADD CONSTRAINT "word_in_the_wild_submissions_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_in_the_wild_submissions" ADD CONSTRAINT "word_in_the_wild_submissions_challengeAttemptId_fkey" FOREIGN KEY ("challengeAttemptId") REFERENCES "challenge_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_battle_groups" ADD CONSTRAINT "boss_battle_groups_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "boss_battles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_battle_players" ADD CONSTRAINT "boss_battle_players_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "boss_battle_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_battle_players" ADD CONSTRAINT "boss_battle_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_battle_players" ADD CONSTRAINT "boss_battle_players_currentWordId_fkey" FOREIGN KEY ("currentWordId") REFERENCES "words"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_battle_events" ADD CONSTRAINT "boss_battle_events_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "boss_battle_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_battle_events" ADD CONSTRAINT "boss_battle_events_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_selections" ADD CONSTRAINT "order_selections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_unlocks" ADD CONSTRAINT "achievement_unlocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_cards" ADD CONSTRAINT "quest_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_profiles" ADD CONSTRAINT "learning_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cefr_assessments" ADD CONSTRAINT "cefr_assessments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "shop_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ali_messages" ADD CONSTRAINT "ali_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_master_challenges" ADD CONSTRAINT "daily_master_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
