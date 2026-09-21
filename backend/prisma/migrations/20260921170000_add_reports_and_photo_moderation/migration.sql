-- Trust & safety: user reporting + photo review queue (moderation).

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'CLAN', 'WORD_IN_THE_WILD_SUBMISSION');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "WordInTheWildModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: photo review queue status on evidence submissions.
ALTER TABLE "word_in_the_wild_submissions" ADD COLUMN "moderationStatus" "WordInTheWildModerationStatus";

-- CreateIndex
CREATE INDEX "word_in_the_wild_submissions_moderationStatus_idx" ON "word_in_the_wild_submissions"("moderationStatus");
