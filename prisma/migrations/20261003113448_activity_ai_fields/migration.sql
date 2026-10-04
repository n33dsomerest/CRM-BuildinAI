-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sentiment" TEXT,
ADD COLUMN     "summary" TEXT;
