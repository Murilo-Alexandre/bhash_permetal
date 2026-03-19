import { Module } from '@nestjs/common';
import { AdminHistoryController } from './admin-history.controller';
import { AdminHistoryService } from './admin-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminHistoryRetentionSchedulerService } from './admin-history-retention-scheduler.service';

@Module({
  controllers: [AdminHistoryController],
  providers: [AdminHistoryService, AdminHistoryRetentionSchedulerService, PrismaService],
})
export class AdminHistoryModule {}
