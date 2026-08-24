-- AlterEnum
ALTER TYPE "CefrAssessmentSource" ADD VALUE 'UNIFIED_ASSESSMENT';

-- AlterTable
ALTER TABLE "boss_battle_players" ADD COLUMN     "rewardGlyphs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rewardXp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "quest_cards" ADD COLUMN     "isShowcased" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showcaseOrder" INTEGER;

-- AlterTable
ALTER TABLE "user_progression" ADD COLUMN     "estimatedCefrConfidence" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "shop_purchases_userId_itemId_key" ON "shop_purchases"("userId", "itemId");
