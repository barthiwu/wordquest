-- AlterEnum
ALTER TYPE "BossBattleGroupStatus" ADD VALUE 'FINALIZING';

-- AlterTable
ALTER TABLE "boss_battle_groups" ADD COLUMN     "finalizingAt" TIMESTAMP(3);
