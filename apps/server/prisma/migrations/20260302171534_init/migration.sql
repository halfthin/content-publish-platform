-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "LoginStatus" AS ENUM ('LOGGED_IN', 'EXPIRED', 'UNKNOWN', 'CHECKING');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('IMAGE', 'VIDEO', 'MIXED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PUBLISHING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'NEEDS_AUTH', 'USER_INTERVENING', 'RESUMED', 'SUCCESS', 'FAILED', 'CANCELLED', 'RETRYING');

-- CreateEnum
CREATE TYPE "ScheduledStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'EXECUTING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "AccountGroup" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "groupId" TEXT NOT NULL,
    "encryptedCookies" TEXT,
    "cookiePassword" TEXT,
    "cookieUpdatedAt" TIMESTAMP(3),
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "loginStatus" "LoginStatus" NOT NULL DEFAULT 'UNKNOWN',
    "dailyLimit" INTEGER NOT NULL DEFAULT 10,
    "todayPublished" INTEGER NOT NULL DEFAULT 0,
    "lastPublishedAt" TIMESTAMP(3),
    "healthScore" INTEGER NOT NULL DEFAULT 100,
    "warningFlags" TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ContentType" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "basePath" TEXT NOT NULL,
    "images" TEXT[],
    "video" TEXT,
    "mdFile" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "tags" TEXT[],
    "category" TEXT,
    "publishCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishLog" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'PENDING',
    "publishedUrl" TEXT,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledStatus" NOT NULL DEFAULT 'SCHEDULED',
    "bullJobId" TEXT,
    "executedAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountGroup_platform_idx" ON "AccountGroup"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "AccountGroup_platform_name_key" ON "AccountGroup"("platform", "name");

-- CreateIndex
CREATE INDEX "Account_platform_status_idx" ON "Account"("platform", "status");

-- CreateIndex
CREATE INDEX "Account_groupId_idx" ON "Account"("groupId");

-- CreateIndex
CREATE INDEX "Content_status_idx" ON "Content"("status");

-- CreateIndex
CREATE INDEX "Content_createdAt_idx" ON "Content"("createdAt");

-- CreateIndex
CREATE INDEX "PublishLog_contentId_idx" ON "PublishLog"("contentId");

-- CreateIndex
CREATE INDEX "PublishLog_accountId_idx" ON "PublishLog"("accountId");

-- CreateIndex
CREATE INDEX "PublishLog_status_idx" ON "PublishLog"("status");

-- CreateIndex
CREATE INDEX "PublishLog_createdAt_idx" ON "PublishLog"("createdAt");

-- CreateIndex
CREATE INDEX "ScheduledJob_scheduledAt_idx" ON "ScheduledJob"("scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledJob_status_idx" ON "ScheduledJob"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AccountGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishLog" ADD CONSTRAINT "PublishLog_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishLog" ADD CONSTRAINT "PublishLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledJob" ADD CONSTRAINT "ScheduledJob_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledJob" ADD CONSTRAINT "ScheduledJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
