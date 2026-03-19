import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AdminHistoryService } from './admin-history.service';

const MAX_TIMEOUT_MS = 2_147_000_000; // seguro para setTimeout em Node

@Injectable()
export class AdminHistoryRetentionSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AdminHistoryRetentionSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private running = false;

  constructor(private readonly history: AdminHistoryService) {}

  async onModuleInit() {
    await this.refresh('init');
  }

  onModuleDestroy() {
    this.stopped = true;
    this.clearTimer();
  }

  private clearTimer() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleIn(ms: number) {
    if (this.stopped) return;

    const safeMs = Math.max(1_000, ms);
    if (safeMs > MAX_TIMEOUT_MS) {
      this.timer = setTimeout(() => this.scheduleIn(safeMs - MAX_TIMEOUT_MS), MAX_TIMEOUT_MS);
      return;
    }

    this.timer = setTimeout(() => {
      void this.handleDueRun('timer');
    }, safeMs);
  }

  private async handleDueRun(reason: 'timer' | 'refresh') {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      await this.history.runDueMediaRetentionPolicy();
    } catch (err: any) {
      this.logger.warn(`Falha no agendador de retenção (${reason}): ${err?.message ?? 'erro desconhecido'}`);
    } finally {
      this.running = false;
      if (!this.stopped) {
        await this.refresh('post-run');
      }
    }
  }

  async refresh(reason: 'init' | 'policy-update' | 'post-run' = 'policy-update') {
    if (this.stopped) return;
    this.clearTimer();

    const policyResult = await this.history.getMediaRetentionPolicy();
    const policy = policyResult.policy;

    if (!policy.enabled || !policy.nextRunAt) return;

    const dueAt = new Date(policy.nextRunAt).getTime();
    const now = Date.now();
    const diff = dueAt - now;

    if (diff <= 0) {
      await this.handleDueRun(reason === 'post-run' ? 'timer' : 'refresh');
      return;
    }

    this.scheduleIn(diff);
  }
}
