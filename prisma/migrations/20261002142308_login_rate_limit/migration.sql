-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginAttempt_windowStart_idx" ON "LoginAttempt"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "LoginAttempt_email_ip_key" ON "LoginAttempt"("email", "ip");
