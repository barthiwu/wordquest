-- AlterTable
ALTER TABLE "words" ADD COLUMN     "frequencyLevel" TEXT,
ADD COLUMN     "wordFamily" TEXT[] DEFAULT ARRAY[]::TEXT[];
