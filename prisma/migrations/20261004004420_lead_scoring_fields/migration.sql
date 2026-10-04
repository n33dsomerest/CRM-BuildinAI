-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "score" INTEGER,
ADD COLUMN     "scoreReason" TEXT,
ADD COLUMN     "scoredAt" TIMESTAMP(3);
