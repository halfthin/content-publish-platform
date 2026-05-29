/*
  Warnings:

  - The `status` column on the `publish_plans` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('PENDING', 'PUBLISHING', 'DONE', 'FAILED');

-- DropIndex
DROP INDEX "publish_plans_contentId_idx";

-- AlterTable
ALTER TABLE "publish_plans" DROP COLUMN "status",
ADD COLUMN     "status" "PlanStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "publish_plans_contentId_status_idx" ON "publish_plans"("contentId", "status");

-- CreateIndex
CREATE INDEX "publish_plans_status_idx" ON "publish_plans"("status");
