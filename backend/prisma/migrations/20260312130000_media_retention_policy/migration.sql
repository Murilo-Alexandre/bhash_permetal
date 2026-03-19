-- CreateEnum
CREATE TYPE "MediaRetentionInterval" AS ENUM (
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'YEARLY'
);

-- AlterTable
ALTER TABLE "app_config"
ADD COLUMN "mediaRetentionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mediaRetentionInterval" "MediaRetentionInterval" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN "mediaRetentionShowToUsers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mediaRetentionNextRunAt" TIMESTAMP(3),
ADD COLUMN "mediaRetentionLastRunAt" TIMESTAMP(3),
ADD COLUMN "mediaRetentionLastSummary" TEXT;
