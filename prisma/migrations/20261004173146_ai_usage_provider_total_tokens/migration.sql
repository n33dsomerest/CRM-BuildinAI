-- AlterTable
ALTER TABLE "AiUsage" ADD COLUMN     "provider" TEXT,
ADD COLUMN     "totalTokens" INTEGER NOT NULL DEFAULT 0;
