-- ALI Character & Animation Bible v1 §12: persist the deterministic
-- visual reaction cue (ali-expression.ts) alongside each AliMessage.

-- AlterTable
ALTER TABLE "ali_messages" ADD COLUMN     "expression" TEXT NOT NULL DEFAULT 'NEUTRAL',
ADD COLUMN     "pose" TEXT NOT NULL DEFAULT 'PERCHED',
ADD COLUMN     "intensity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "durationMs" INTEGER NOT NULL DEFAULT 0;
