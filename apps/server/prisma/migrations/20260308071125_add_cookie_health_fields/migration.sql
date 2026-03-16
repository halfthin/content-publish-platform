-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "cookieExpiryWarning" BOOLEAN DEFAULT false,
ADD COLUMN     "cookieHealthScore" INTEGER DEFAULT 100,
ADD COLUMN     "cookieLastRefreshAt" TIMESTAMP(3),
ADD COLUMN     "cookieRefreshAttempts" INTEGER DEFAULT 0,
ADD COLUMN     "lastCookieCheckAt" TIMESTAMP(3);
