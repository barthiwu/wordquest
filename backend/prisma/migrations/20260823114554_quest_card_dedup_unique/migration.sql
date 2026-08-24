-- DropIndex
DROP INDEX "quest_cards_userId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "quest_cards_userId_source_sourceEventId_key" ON "quest_cards"("userId", "source", "sourceEventId");

