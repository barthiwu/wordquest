-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isGuest" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "users_isGuest_createdAt_idx" ON "users"("isGuest", "createdAt");
