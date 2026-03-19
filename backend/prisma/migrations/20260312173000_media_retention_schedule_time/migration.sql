-- AlterTable
ALTER TABLE "app_config"
ADD COLUMN "mediaRetentionRunHour" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "mediaRetentionRunMinute" INTEGER NOT NULL DEFAULT 0;
