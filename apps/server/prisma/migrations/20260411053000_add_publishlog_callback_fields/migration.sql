-- AlterTable
ALTER TABLE "PublishLog"
ADD COLUMN "jobId" TEXT,
ADD COLUMN "externalTaskId" TEXT,
ADD COLUMN "callbackPayload" JSONB;

-- CreateIndex
CREATE INDEX "PublishLog_jobId_idx" ON "PublishLog"("jobId");

-- CreateIndex
CREATE INDEX "PublishLog_externalTaskId_idx" ON "PublishLog"("externalTaskId");
