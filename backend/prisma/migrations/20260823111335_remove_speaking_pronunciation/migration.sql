-- AlterEnum
BEGIN;
CREATE TYPE "CefrAssessmentSource_new" AS ENUM ('PARAGRAPH_SUBMISSION', 'CALIBRATION');
ALTER TABLE "cefr_assessments" ALTER COLUMN "source" TYPE "CefrAssessmentSource_new" USING ("source"::text::"CefrAssessmentSource_new");
ALTER TYPE "CefrAssessmentSource" RENAME TO "CefrAssessmentSource_old";
ALTER TYPE "CefrAssessmentSource_new" RENAME TO "CefrAssessmentSource";
DROP TYPE "CefrAssessmentSource_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ChallengeType_new" AS ENUM ('LETTER_OMISSION', 'MULTIPLE_CHOICE', 'FILL_IN_BLANK', 'MEANING_SELECTION', 'CONTEXT_SELECTION', 'DEFINITION_TO_WORD', 'WORD_TO_DEFINITION', 'SYNONYM', 'ANTONYM', 'SENTENCE_CONSTRUCTION', 'WRITING', 'RECALL', 'WORD_IN_THE_WILD');
ALTER TABLE "challenge_attempts" ALTER COLUMN "challengeType" DROP DEFAULT;
ALTER TABLE "challenge_attempts" ALTER COLUMN "challengeType" TYPE "ChallengeType_new" USING ("challengeType"::text::"ChallengeType_new");
ALTER TYPE "ChallengeType" RENAME TO "ChallengeType_old";
ALTER TYPE "ChallengeType_new" RENAME TO "ChallengeType";
DROP TYPE "ChallengeType_old";
ALTER TABLE "challenge_attempts" ALTER COLUMN "challengeType" SET DEFAULT 'LETTER_OMISSION';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "WordStage_new" AS ENUM ('GUESSING', 'UNDERSTANDING', 'SENTENCE', 'PARAGRAPH', 'OPTIONAL_WILD', 'WORD_COMPLETE');
ALTER TABLE "quest_attempts" ALTER COLUMN "wordStage" DROP DEFAULT;
ALTER TABLE "quest_attempts" ALTER COLUMN "wordStage" TYPE "WordStage_new" USING ("wordStage"::text::"WordStage_new");
ALTER TYPE "WordStage" RENAME TO "WordStage_old";
ALTER TYPE "WordStage_new" RENAME TO "WordStage";
DROP TYPE "WordStage_old";
ALTER TABLE "quest_attempts" ALTER COLUMN "wordStage" SET DEFAULT 'GUESSING';
COMMIT;

-- AlterTable
ALTER TABLE "masteries" DROP COLUMN "pronunciationScore",
DROP COLUMN "speakingScore";

-- AlterTable
ALTER TABLE "quest_attempts" DROP COLUMN "speakingAudioKey",
DROP COLUMN "speakingScores",
DROP COLUMN "speakingTranscript",
DROP COLUMN "speakingXpAwarded";

