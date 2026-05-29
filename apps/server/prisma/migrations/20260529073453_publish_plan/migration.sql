/*
  Warnings:

  - You are about to drop the `Content` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ScheduledJob` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PublishLog" DROP CONSTRAINT "PublishLog_contentId_fkey";

-- DropForeignKey
ALTER TABLE "ScheduledJob" DROP CONSTRAINT "ScheduledJob_accountId_fkey";

-- DropForeignKey
ALTER TABLE "ScheduledJob" DROP CONSTRAINT "ScheduledJob_contentId_fkey";

-- AlterTable
ALTER TABLE "PublishLog" ADD COLUMN     "publishPlanId" TEXT;

-- DropTable
DROP TABLE "Content";

-- DropTable
DROP TABLE "ScheduledJob";

-- DropEnum
DROP TYPE "ContentType";

-- DropEnum
DROP TYPE "ScheduledStatus";

-- CreateTable
CREATE TABLE "contents" (
    "id" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_plans" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "title" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "externalTaskId" TEXT,
    "publishedUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "publish_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contents_relativePath_key" ON "contents"("relativePath");

-- CreateIndex
CREATE INDEX "contents_status_createdAt_idx" ON "contents"("status", "createdAt");

-- CreateIndex
CREATE INDEX "publish_plans_contentId_idx" ON "publish_plans"("contentId");

-- CreateIndex
CREATE INDEX "publish_plans_contentId_status_idx" ON "publish_plans"("contentId", "status");

-- CreateIndex
CREATE INDEX "publish_plans_status_idx" ON "publish_plans"("status");

-- AddForeignKey
ALTER TABLE "publish_plans" ADD CONSTRAINT "publish_plans_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishLog" ADD CONSTRAINT "PublishLog_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
