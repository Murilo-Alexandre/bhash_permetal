import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MediaRetentionInterval, MessageContentType } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import {
  attachmentRemovalNoticeByType,
  computeNextMediaRetentionRun,
  isAttachmentRemovalNoticeText,
  listMediaRetentionIntervals,
  mediaRetentionIntervalLabel,
  mediaRetentionUnitFromInterval,
  normalizeMediaRetentionRunTime,
} from './media-retention.util';
import { isLikelyMediaFile, isLikelyVideoFile, normalizeUploadedFileName } from '../common/upload-filename.util';

function toDateOrNull(v?: string) {
  const s = (v ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function norm(v?: string) {
  const s = (v ?? '').trim();
  return s ? s : '';
}

type AdminConvRow = {
  id: string;
  updatedAt: Date;
  userA: { id: string; username: string; name: string; avatarUrl?: string | null };
  userB: { id: string; username: string; name: string; avatarUrl?: string | null };
  messages: {
    id: string;
    createdAt: Date;
    body: string | null;
    senderId: string;
    contentType: MessageContentType;
    attachmentName: string | null;
    deletedAt: Date | null;
  }[];
};

type RetentionConfigRow = {
  id: string;
  mediaRetentionEnabled: boolean;
  mediaRetentionInterval: MediaRetentionInterval;
  mediaRetentionIntervalCount: number;
  mediaRetentionRunHour: number;
  mediaRetentionRunMinute: number;
  mediaRetentionShowToUsers: boolean;
  mediaRetentionNextRunAt: Date | null;
  mediaRetentionLastRunAt: Date | null;
  mediaRetentionLastMediaCount: number;
  mediaRetentionLastFileCount: number;
  mediaRetentionLastSummary: string | null;
};

@Injectable()
export class AdminHistoryService {
  private readonly logger = new Logger(AdminHistoryService.name);
  private retentionRunInProgress = false;

  constructor(private readonly prisma: PrismaService) {}

  private normalizeAttachmentName(value?: string | null) {
    const normalized = normalizeUploadedFileName(value);
    return normalized || null;
  }

  private isMediaAttachment(message: {
    contentType?: MessageContentType | 'IMAGE' | 'FILE' | string | null;
    attachmentMime?: string | null;
    attachmentName?: string | null;
    attachmentUrl?: string | null;
  }) {
    if (message.contentType === 'IMAGE') return true;
    return isLikelyMediaFile(message);
  }

  private mapMessage(message: any) {
    return {
      id: message.id,
      createdAt: message.createdAt,
      conversationId: message.conversationId,
      senderId: message.senderId,
      body: message.body ?? '',
      contentType: this.isMediaAttachment(message) ? 'IMAGE' : message.contentType,
      attachmentUrl: message.attachmentUrl ?? null,
      attachmentName: this.normalizeAttachmentName(message.attachmentName),
      attachmentMime: message.attachmentMime ?? null,
      attachmentSize: message.attachmentSize ?? null,
      deletedAt: message.deletedAt ?? null,
      sender: message.sender
        ? {
            id: message.sender.id,
            username: message.sender.username,
            name: message.sender.name,
          }
        : null,
    };
  }

  private messagePreview(message: {
    body: string | null;
    contentType: MessageContentType;
    attachmentName: string | null;
    attachmentUrl?: string | null;
    attachmentMime?: string | null;
  }) {
    const body = (message.body ?? '').trim();
    const attachmentName = this.normalizeAttachmentName(message.attachmentName);
    const isVideo = isLikelyVideoFile(message);
    const isMedia = this.isMediaAttachment(message);
    if (body) return body.slice(0, 160);
    if (isMedia) return isVideo ? '[Vídeo]' : '[Imagem]';
    if (message.contentType === 'FILE') return attachmentName ? `[Arquivo] ${attachmentName}` : '[Arquivo]';
    return '';
  }

  private searchPreview(message: {
    body: string | null;
    contentType: MessageContentType;
    attachmentName: string | null;
    attachmentUrl?: string | null;
    attachmentMime?: string | null;
  }) {
    const body = (message.body ?? '').trim();
    const attachmentName = this.normalizeAttachmentName(message.attachmentName);
    const isVideo = isLikelyVideoFile(message);
    const isMedia = this.isMediaAttachment(message);
    if (body) return body.slice(0, 220);
    if (isMedia) return isVideo ? 'Vídeo' : 'Imagem';
    if (message.contentType === 'FILE') return attachmentName ? `Arquivo: ${attachmentName}` : 'Arquivo';
    return '';
  }

  private safeUploadPathFromUrl(attachmentUrl?: string | null) {
    const raw = (attachmentUrl ?? '').trim();
    if (!raw || !raw.startsWith('/static/uploads/')) return null;

    const relative = raw.slice('/static/uploads/'.length).replace(/\\/g, '/');
    const normalized = path.posix.normalize(relative);
    if (!normalized || normalized === '.' || normalized.startsWith('..')) return null;

    const root = path.resolve(process.cwd(), 'public', 'uploads');
    const absolute = path.resolve(root, normalized);
    if (!absolute.startsWith(root)) return null;
    return absolute;
  }

  private async unlinkAttachmentFile(attachmentUrl?: string | null) {
    const absolute = this.safeUploadPathFromUrl(attachmentUrl);
    if (!absolute) return;
    try {
      await fs.unlink(absolute);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        this.logger.warn(`Falha ao remover arquivo físico: ${absolute} (${err?.message ?? 'erro desconhecido'})`);
      }
    }
  }

  private deletedAttachmentBody(
    existingBody: string | null | undefined,
    contentType: MessageContentType | 'IMAGE' | 'FILE',
  ) {
    const kind = contentType === 'IMAGE' ? 'IMAGE' : 'FILE';
    const notice = attachmentRemovalNoticeByType(kind);
    const current = (existingBody ?? '').trim();
    if (!current) return notice;
    if (isAttachmentRemovalNoticeText(current)) return notice;
    return `${current}\n\n${notice}`;
  }

  private async ensureRetentionConfigRow(): Promise<RetentionConfigRow> {
    const cfg = (await this.prisma.appConfig.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
      select: {
        id: true,
        mediaRetentionEnabled: true,
        mediaRetentionInterval: true,
        mediaRetentionIntervalCount: true,
        mediaRetentionRunHour: true,
        mediaRetentionRunMinute: true,
        mediaRetentionShowToUsers: true,
        mediaRetentionNextRunAt: true,
        mediaRetentionLastRunAt: true,
        mediaRetentionLastMediaCount: true,
        mediaRetentionLastFileCount: true,
        mediaRetentionLastSummary: true,
      },
    })) as RetentionConfigRow;

    if (cfg.mediaRetentionNextRunAt) return cfg;

    const nextRunAt = computeNextMediaRetentionRun(
      cfg.mediaRetentionInterval,
      cfg.mediaRetentionIntervalCount,
      new Date(),
      {
      hour: cfg.mediaRetentionRunHour,
      minute: cfg.mediaRetentionRunMinute,
      },
    );
    const updated = (await this.prisma.appConfig.update({
      where: { id: 'default' },
      data: { mediaRetentionNextRunAt: nextRunAt },
      select: {
        id: true,
        mediaRetentionEnabled: true,
        mediaRetentionInterval: true,
        mediaRetentionIntervalCount: true,
        mediaRetentionRunHour: true,
        mediaRetentionRunMinute: true,
        mediaRetentionShowToUsers: true,
        mediaRetentionNextRunAt: true,
        mediaRetentionLastRunAt: true,
        mediaRetentionLastMediaCount: true,
        mediaRetentionLastFileCount: true,
        mediaRetentionLastSummary: true,
      },
    })) as RetentionConfigRow;

    return updated;
  }

  private async getCurrentRetentionCounts() {
    const [nextMediaCount, nextFileCount] = await Promise.all([
      this.prisma.message.count({
        where: {
          deletedAt: null,
          attachmentUrl: { not: null },
          contentType: 'IMAGE',
        },
      }),
      this.prisma.message.count({
        where: {
          deletedAt: null,
          attachmentUrl: { not: null },
          contentType: 'FILE',
        },
      }),
    ]);

    return { nextMediaCount, nextFileCount };
  }

  private async formatRetentionPolicy(cfg: RetentionConfigRow) {
    const mapped = mediaRetentionUnitFromInterval(cfg.mediaRetentionInterval);
    const intervalCount =
      cfg.mediaRetentionInterval === 'DAILY' ||
      cfg.mediaRetentionInterval === 'MONTHLY' ||
      cfg.mediaRetentionInterval === 'YEARLY'
        ? Math.max(1, cfg.mediaRetentionIntervalCount || 1)
        : mapped.count;
    const { nextMediaCount, nextFileCount } = await this.getCurrentRetentionCounts();

    return {
      enabled: cfg.mediaRetentionEnabled,
      interval: cfg.mediaRetentionInterval,
      intervalLabel: mediaRetentionIntervalLabel(cfg.mediaRetentionInterval, intervalCount),
      intervalCount,
      intervalUnit: mapped.unit,
      runHour: cfg.mediaRetentionRunHour,
      runMinute: cfg.mediaRetentionRunMinute,
      showToUsers: cfg.mediaRetentionShowToUsers,
      nextRunAt: cfg.mediaRetentionNextRunAt,
      lastRunAt: cfg.mediaRetentionLastRunAt,
      lastMediaCount: cfg.mediaRetentionLastMediaCount ?? 0,
      lastFileCount: cfg.mediaRetentionLastFileCount ?? 0,
      nextMediaCount,
      nextFileCount,
      lastSummary: cfg.mediaRetentionLastSummary,
    };
  }

  private async runRetentionCleanup(reason: 'automatic' | 'manual') {
    if (this.retentionRunInProgress) {
      return {
        ok: true,
        removedCount: 0,
        details: 'Execução já em andamento',
      };
    }

    this.retentionRunInProgress = true;

    try {
      const cfg = await this.ensureRetentionConfigRow();
      const now = new Date();

      const targets = await this.prisma.message.findMany({
        where: {
          contentType: { in: ['IMAGE', 'FILE'] },
          attachmentUrl: { not: null },
          deletedAt: null,
        },
        select: {
          id: true,
          conversationId: true,
          body: true,
          contentType: true,
          attachmentUrl: true,
        },
      });

      const removedMediaCount = targets.filter((msg) => msg.contentType === 'IMAGE').length;
      const removedFileCount = targets.length - removedMediaCount;

      for (const msg of targets) {
        await this.unlinkAttachmentFile(msg.attachmentUrl);
        await this.prisma.message.update({
          where: { id: msg.id },
          data: {
            contentType: msg.contentType,
            attachmentUrl: null,
            attachmentName: null,
            attachmentMime: null,
            attachmentSize: null,
            body: this.deletedAttachmentBody(msg.body, msg.contentType),
            deletedAt: now,
          },
        });
      }

      const summary = `${removedMediaCount} mídia(s) e ${removedFileCount} arquivo(s) removido(s) (${reason})`;
      await this.prisma.appConfig.update({
        where: { id: 'default' },
        data: {
          mediaRetentionLastRunAt: now,
          mediaRetentionLastMediaCount: removedMediaCount,
          mediaRetentionLastFileCount: removedFileCount,
          mediaRetentionLastSummary: summary,
          mediaRetentionNextRunAt: computeNextMediaRetentionRun(
            cfg.mediaRetentionInterval,
            cfg.mediaRetentionIntervalCount,
            now,
            {
              hour: cfg.mediaRetentionRunHour,
              minute: cfg.mediaRetentionRunMinute,
            },
          ),
        },
      });

      return {
        ok: true,
        removedCount: targets.length,
        details: summary,
      };
    } catch (err: any) {
      const now = new Date();
      const cfg = await this.ensureRetentionConfigRow();
      await this.prisma.appConfig.update({
        where: { id: 'default' },
        data: {
          mediaRetentionLastRunAt: now,
          mediaRetentionLastMediaCount: 0,
          mediaRetentionLastFileCount: 0,
          mediaRetentionLastSummary: `Erro na política automática: ${err?.message ?? 'erro desconhecido'}`,
          mediaRetentionNextRunAt: computeNextMediaRetentionRun(
            cfg.mediaRetentionInterval,
            cfg.mediaRetentionIntervalCount,
            now,
            {
              hour: cfg.mediaRetentionRunHour,
              minute: cfg.mediaRetentionRunMinute,
            },
          ),
        },
      });

      throw err;
    } finally {
      this.retentionRunInProgress = false;
    }
  }

  async getMediaRetentionPolicy() {
    let cfg = await this.ensureRetentionConfigRow();
    const now = Date.now();

    if (
      cfg.mediaRetentionEnabled &&
      cfg.mediaRetentionNextRunAt &&
      cfg.mediaRetentionNextRunAt.getTime() <= now
    ) {
      try {
        await this.runDueMediaRetentionPolicy();
      } catch (err: any) {
        this.logger.warn(
          `Falha ao executar retenção vencida durante leitura da política: ${err?.message ?? 'erro desconhecido'}`,
        );
      }
      cfg = await this.ensureRetentionConfigRow();
    }

    return { ok: true, policy: await this.formatRetentionPolicy(cfg) };
  }

  async updateMediaRetentionPolicy(input: {
    enabled?: boolean;
    interval?: string;
    intervalCount?: number;
    showToUsers?: boolean;
    runHour?: number;
    runMinute?: number;
  }) {
    const cfg = await this.ensureRetentionConfigRow();

    const nextIntervalRaw = norm(input.interval).toUpperCase();
    const allowed = new Set(listMediaRetentionIntervals());
    const nextInterval =
      nextIntervalRaw && allowed.has(nextIntervalRaw as MediaRetentionInterval)
        ? (nextIntervalRaw as MediaRetentionInterval)
        : null;

    if (nextIntervalRaw && !nextInterval) {
      throw new BadRequestException('Intervalo de exclusão inválido');
    }
    const hasIntervalCount = input.intervalCount !== undefined;
    const parsedIntervalCount = hasIntervalCount ? Number(input.intervalCount) : null;
    if (
      hasIntervalCount &&
      (!Number.isInteger(parsedIntervalCount) || parsedIntervalCount! < 1 || parsedIntervalCount! > 999)
    ) {
      throw new BadRequestException('Periodicidade inválida. Use um número entre 1 e 999');
    }
    const hasRunHour = input.runHour !== undefined;
    const hasRunMinute = input.runMinute !== undefined;

    const parsedRunHour = hasRunHour ? Number(input.runHour) : null;
    if (hasRunHour && (!Number.isInteger(parsedRunHour) || parsedRunHour! < 0 || parsedRunHour! > 23)) {
      throw new BadRequestException('Hora inválida. Use 00-23');
    }

    const parsedRunMinute = hasRunMinute ? Number(input.runMinute) : null;
    if (
      hasRunMinute &&
      (!Number.isInteger(parsedRunMinute) || parsedRunMinute! < 0 || parsedRunMinute! > 59)
    ) {
      throw new BadRequestException('Minuto inválido. Use 00-59');
    }

    const nextRunTime = normalizeMediaRetentionRunTime({
      hour: hasRunHour ? parsedRunHour! : cfg.mediaRetentionRunHour,
      minute: hasRunMinute ? parsedRunMinute! : cfg.mediaRetentionRunMinute,
    });

    const data: any = {};
    if (typeof input.enabled === 'boolean') data.mediaRetentionEnabled = input.enabled;
    if (nextInterval) data.mediaRetentionInterval = nextInterval;
    if (hasIntervalCount) data.mediaRetentionIntervalCount = parsedIntervalCount!;
    if (hasRunHour) data.mediaRetentionRunHour = nextRunTime.hour;
    if (hasRunMinute) data.mediaRetentionRunMinute = nextRunTime.minute;
    if (typeof input.showToUsers === 'boolean') data.mediaRetentionShowToUsers = input.showToUsers;

    const enabledAfter =
      typeof input.enabled === 'boolean' ? input.enabled : cfg.mediaRetentionEnabled;
    const intervalAfter = nextInterval ?? cfg.mediaRetentionInterval;
    const intervalCountAfter = hasIntervalCount ? parsedIntervalCount! : cfg.mediaRetentionIntervalCount;
    const intervalChanged = !!nextInterval && nextInterval !== cfg.mediaRetentionInterval;
    const intervalCountChanged = hasIntervalCount && parsedIntervalCount! !== cfg.mediaRetentionIntervalCount;
    const runHourChanged = hasRunHour && nextRunTime.hour !== cfg.mediaRetentionRunHour;
    const runMinuteChanged = hasRunMinute && nextRunTime.minute !== cfg.mediaRetentionRunMinute;
    const runTimeChanged = runHourChanged || runMinuteChanged;
    const enabledWasTurnedOn = input.enabled === true && !cfg.mediaRetentionEnabled;
    const nextRunIsPastOrNow =
      !!cfg.mediaRetentionNextRunAt && cfg.mediaRetentionNextRunAt.getTime() <= Date.now();

    if (
      !cfg.mediaRetentionNextRunAt ||
      intervalChanged ||
      intervalCountChanged ||
      runTimeChanged ||
      enabledWasTurnedOn ||
      nextRunIsPastOrNow
    ) {
      data.mediaRetentionNextRunAt = computeNextMediaRetentionRun(
        intervalAfter,
        intervalCountAfter,
        new Date(),
        {
          hour: nextRunTime.hour,
          minute: nextRunTime.minute,
        },
      );
    }

    const updated = (await this.prisma.appConfig.update({
      where: { id: 'default' },
      data,
      select: {
        id: true,
        mediaRetentionEnabled: true,
        mediaRetentionInterval: true,
        mediaRetentionIntervalCount: true,
        mediaRetentionRunHour: true,
        mediaRetentionRunMinute: true,
        mediaRetentionShowToUsers: true,
        mediaRetentionNextRunAt: true,
        mediaRetentionLastRunAt: true,
        mediaRetentionLastMediaCount: true,
        mediaRetentionLastFileCount: true,
        mediaRetentionLastSummary: true,
      },
    })) as RetentionConfigRow;

    if (!enabledAfter && !updated.mediaRetentionNextRunAt) {
      const nextRunAt = computeNextMediaRetentionRun(
        intervalAfter,
        updated.mediaRetentionIntervalCount,
        new Date(),
        {
          hour: updated.mediaRetentionRunHour,
          minute: updated.mediaRetentionRunMinute,
        },
      );
      await this.prisma.appConfig.update({
        where: { id: 'default' },
        data: { mediaRetentionNextRunAt: nextRunAt },
      });
      updated.mediaRetentionNextRunAt = nextRunAt;
    }

    return { ok: true, policy: await this.formatRetentionPolicy(updated) };
  }

  async runDueMediaRetentionPolicy() {
    const cfg = await this.ensureRetentionConfigRow();
    const now = new Date();
    if (!cfg.mediaRetentionEnabled) {
      return { ok: true, skipped: true, reason: 'disabled' };
    }
    if (cfg.mediaRetentionNextRunAt && cfg.mediaRetentionNextRunAt > now) {
      return { ok: true, skipped: true, reason: 'not-due' };
    }
    return this.runRetentionCleanup('automatic');
  }

  async getUserVisibleMediaRetentionPolicy(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userAId: true, userBId: true },
    });

    if (!conv) throw new BadRequestException('Conversa não encontrada');
    if (conv.userAId !== userId && conv.userBId !== userId) {
      throw new BadRequestException('Conversa inválida para este usuário');
    }

    const cfg = await this.ensureRetentionConfigRow();
    const policy = await this.formatRetentionPolicy(cfg);

    if (!policy.showToUsers) {
      return { ok: true, visible: false };
    }

    return {
      ok: true,
      visible: true,
      enabled: policy.enabled,
      interval: policy.interval,
      intervalLabel: policy.intervalLabel,
      runHour: policy.runHour,
      runMinute: policy.runMinute,
      nextRunAt: policy.nextRunAt,
    };
  }

  // =========================
  // A) CONTATOS (usuários do chat)
  // =========================
  async listContacts(input: {
    q?: string;
    companyId?: string;
    departmentId?: string;
    pageStr?: string;
    pageSizeStr?: string;
  }) {
    const page = Math.max(1, Number(input.pageStr ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(input.pageSizeStr ?? 30) || 30));
    const skip = (page - 1) * pageSize;

    const q = norm(input.q);
    const companyId = norm(input.companyId);
    const departmentId = norm(input.departmentId);

    const and: any[] = [];
    if (companyId) and.push({ companyId });
    if (departmentId) and.push({ departmentId });

    const where: any = {};
    if (and.length) where.AND = and;

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { extension: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ name: 'asc' }],
        skip,
        take: pageSize,
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          extension: true,
          avatarUrl: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
          company: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        } as any,
      }),
    ]);

    return { ok: true, page, pageSize, total, items };
  }

  // =========================
  // B) CONVERSAS do usuário selecionado
  // =========================
  async listUserConversations(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new BadRequestException('Usuário não encontrado');

    const convs = (await this.prisma.conversation.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        updatedAt: true,
        userA: { select: { id: true, username: true, name: true, avatarUrl: true } },
        userB: { select: { id: true, username: true, name: true, avatarUrl: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            createdAt: true,
            body: true,
            senderId: true,
            contentType: true,
            attachmentName: true,
            attachmentMime: true,
            deletedAt: true,
          },
        },
      } as any,
    })) as unknown as AdminConvRow[];

    const items = convs.map((c) => {
      const other = c.userA.id === userId ? c.userB : c.userA;
      const last = c.messages?.[0] ?? null;

      return {
        id: c.id,
        updatedAt: c.updatedAt,
        otherUser: other,
        lastMessage: last
          ? {
              id: last.id,
              createdAt: last.createdAt,
              bodyPreview: this.messagePreview(last),
              senderId: last.senderId,
            }
          : null,
      };
    });

    return { ok: true, items };
  }

  // =========================
  // C) MENSAGENS da conversa (scroll/cursor + busca)
  // =========================
  async listConversationMessages(input: {
    conversationId: string;
    cursor?: string;
    take?: string;
    from?: string;
    to?: string;
    q?: string;
  }) {
    const pageSize = Math.min(Math.max(parseInt(input.take ?? '50', 10) || 50, 1), 200);

    const fromDate = toDateOrNull(input.from);
    const toDate = toDateOrNull(input.to);
    const q = norm(input.q);

    const where: any = { conversationId: input.conversationId };

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }

    if (q) {
      where.OR = [
        { body: { contains: q, mode: 'insensitive' } },
        { attachmentName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const messages = await this.prisma.message.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize,
      ...(input.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
      include: { sender: { select: { id: true, username: true, name: true } } },
    });

    const nextCursor = messages.length === pageSize ? messages[messages.length - 1].id : null;
    const items = messages.reverse().map((m) => this.mapMessage(m));

    return { ok: true, items, nextCursor };
  }

  async listConversationMedia(input: {
    conversationId: string;
    kind?: string;
    take?: string;
  }) {
    const takeN = Math.min(Math.max(parseInt(input.take ?? '300', 10) || 300, 1), 1000);
    const kind = norm(input.kind).toLowerCase();

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: input.conversationId,
        deletedAt: null,
        attachmentUrl: { not: null },
        contentType: { in: ['IMAGE', 'FILE'] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: takeN,
      include: { sender: { select: { id: true, username: true, name: true } } },
    });

    return {
      ok: true,
      items: rows
        .map((m) => this.mapMessage(m))
        .filter((item) => {
          const isMedia = this.isMediaAttachment(item);
          if (kind === 'image') return isMedia;
          if (kind === 'file') return !isMedia;
          return true;
        }),
    };
  }

  async deleteMessageAttachmentByAdmin(messageId: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        body: true,
        contentType: true,
        attachmentUrl: true,
        conversation: {
          select: {
            userAId: true,
            userBId: true,
          },
        },
      },
    });

    if (!msg) throw new BadRequestException('Mensagem não encontrada');
    if (!msg.attachmentUrl || (msg.contentType !== 'IMAGE' && msg.contentType !== 'FILE')) {
      throw new BadRequestException('Mensagem não possui anexo para exclusão');
    }

    const now = new Date();
    await this.unlinkAttachmentFile(msg.attachmentUrl);

    const updated = await this.prisma.message.update({
      where: { id: msg.id },
      data: {
        contentType: msg.contentType,
        attachmentUrl: null,
        attachmentName: null,
        attachmentMime: null,
        attachmentSize: null,
        body: this.deletedAttachmentBody(msg.body, msg.contentType),
        deletedAt: now,
      },
      include: { sender: { select: { id: true, username: true, name: true } } },
    });

    return {
      ok: true,
      conversationId: msg.conversationId,
      participantIds: [msg.conversation.userAId, msg.conversation.userBId],
      message: this.mapMessage(updated),
    };
  }

  // =========================
  // Busca dentro da conversa
  // =========================
  async searchInConversation(input: {
    conversationId: string;
    q?: string;
    take?: string;
  }) {
    const q = norm(input.q);
    if (!q || q.length < 1) throw new BadRequestException('Informe 1 caractere ou mais');

    const takeN = Math.min(Math.max(parseInt(input.take ?? '200', 10) || 200, 1), 500);

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: input.conversationId,
        OR: [
          { body: { contains: q, mode: 'insensitive' } },
          { attachmentName: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: takeN,
      select: {
        id: true,
        createdAt: true,
        body: true,
        senderId: true,
        contentType: true,
        attachmentName: true,
        attachmentMime: true,
      },
    });

    return {
      ok: true,
      q,
      total: rows.length,
      items: rows.map((m) => ({
        messageId: m.id,
        createdAt: m.createdAt,
        senderId: m.senderId,
        bodyPreview: this.searchPreview(m),
      })),
    };
  }

  // =========================
  // Mensagens ao redor de âncora
  // =========================
  async messagesAround(input: {
    conversationId: string;
    messageId: string;
    take?: string;
  }) {
    const conversationId = norm(input.conversationId);
    const messageId = norm(input.messageId);
    if (!conversationId) throw new BadRequestException('conversationId inválido');
    if (!messageId) throw new BadRequestException('messageId inválido');

    const takeN = Math.min(Math.max(parseInt(input.take ?? '60', 10) || 60, 3), 200);
    const half = Math.floor((takeN - 1) / 2);

    const anchor = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, createdAt: true },
    });

    if (!anchor || anchor.conversationId !== conversationId) {
      throw new BadRequestException('Mensagem âncora não encontrada nesta conversa');
    }

    const before = await this.prisma.message.findMany({
      where: {
        conversationId,
        OR: [
          { createdAt: { lt: anchor.createdAt } },
          {
            AND: [{ createdAt: { equals: anchor.createdAt } }, { id: { lt: anchor.id } }],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: half,
      include: { sender: { select: { id: true, username: true, name: true } } },
    });

    const after = await this.prisma.message.findMany({
      where: {
        conversationId,
        OR: [
          { createdAt: { gt: anchor.createdAt } },
          {
            AND: [{ createdAt: { equals: anchor.createdAt } }, { id: { gt: anchor.id } }],
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: takeN - 1 - before.length,
      include: { sender: { select: { id: true, username: true, name: true } } },
    });

    const anchorFull = await this.prisma.message.findUnique({
      where: { id: anchor.id },
      include: { sender: { select: { id: true, username: true, name: true } } },
    });

    if (!anchorFull) {
      throw new BadRequestException('Mensagem âncora não encontrada nesta conversa');
    }

    return {
      ok: true,
      anchorId: anchor.id,
      items: [...before.reverse(), anchorFull, ...after].map((m) => this.mapMessage(m)),
    };
  }

  // =========================
  // D) BUSCA GLOBAL (todas as conversas)
  // =========================
  async globalSearch(input: {
    q?: string;
    from?: string;
    to?: string;
    companyId?: string;
    departmentId?: string;
    pageStr?: string;
    pageSizeStr?: string;
  }) {
    const q = norm(input.q);
    if (!q || q.length < 1) throw new BadRequestException('Informe 1 caractere ou mais');

    const page = Math.max(1, Number(input.pageStr ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(input.pageSizeStr ?? 50) || 50));
    const skip = (page - 1) * pageSize;

    const fromDate = toDateOrNull(input.from);
    const toDate = toDateOrNull(input.to);
    const companyId = norm(input.companyId);
    const departmentId = norm(input.departmentId);

    const where: any = {
      OR: [
        { body: { contains: q, mode: 'insensitive' } },
        { attachmentName: { contains: q, mode: 'insensitive' } },
      ],
    };

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }

    if (companyId || departmentId) {
      where.conversation = {
        OR: [
          { userA: { ...(companyId ? { companyId } : {}), ...(departmentId ? { departmentId } : {}) } },
          { userB: { ...(companyId ? { companyId } : {}), ...(departmentId ? { departmentId } : {}) } },
        ],
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.message.count({ where }),
      this.prisma.message.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          body: true,
          contentType: true,
          attachmentName: true,
          conversationId: true,
          sender: { select: { id: true, username: true, name: true } },
          conversation: {
            select: {
              id: true,
              userA: { select: { id: true, username: true, name: true } },
              userB: { select: { id: true, username: true, name: true } },
            },
          },
        },
      }),
    ]);

    return {
      ok: true,
      q,
      page,
      pageSize,
      total,
      items: items.map((m) => ({
        id: m.id,
        createdAt: m.createdAt,
        bodyPreview: this.searchPreview(m),
        conversationId: m.conversationId,
        sender: m.sender,
        conversation: m.conversation,
      })),
    };
  }
}
