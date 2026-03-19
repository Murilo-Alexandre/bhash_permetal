import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mediaRetentionIntervalLabel } from '../admin-history/media-retention.util';
import {
  isLikelyMediaFile,
  normalizeUploadedFileName,
} from '../common/upload-filename.util';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeAttachmentName(value?: string | null) {
    const normalized = normalizeUploadedFileName(value);
    return normalized || null;
  }

  private isMediaAttachment(message: {
    contentType?: string | null;
    attachmentMime?: string | null;
    attachmentName?: string | null;
    attachmentUrl?: string | null;
  }) {
    if (message.contentType === 'IMAGE') return true;
    return isLikelyMediaFile(message);
  }

  private mapReplyTo(replyTo: any) {
    if (!replyTo) return null;
    return {
      id: replyTo.id,
      body: replyTo.body ?? '',
      contentType: this.isMediaAttachment(replyTo) ? 'IMAGE' : replyTo.contentType,
      attachmentUrl: replyTo.attachmentUrl ?? null,
      attachmentName: this.normalizeAttachmentName(replyTo.attachmentName),
      attachmentMime: replyTo.attachmentMime ?? null,
      sender: replyTo.sender
        ? {
            id: replyTo.sender.id,
            username: replyTo.sender.username,
            name: replyTo.sender.name,
            avatarUrl: replyTo.sender.avatarUrl ?? null,
          }
        : null,
    };
  }

  private serializeMessage(msg: any) {
    return {
      id: msg.id,
      createdAt: msg.createdAt,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      body: msg.body ?? '',
      contentType: this.isMediaAttachment(msg) ? 'IMAGE' : msg.contentType,
      attachmentUrl: msg.attachmentUrl ?? null,
      attachmentName: this.normalizeAttachmentName(msg.attachmentName),
      attachmentMime: msg.attachmentMime ?? null,
      attachmentSize: msg.attachmentSize ?? null,
      replyToId: msg.replyToId ?? null,
      deletedAt: msg.deletedAt ?? null,
      sender: msg.sender ?? null,
      replyTo: this.mapReplyTo(msg.replyTo),
      reactions: msg.reactions ?? [],
      isFavorited: Array.isArray(msg.favorites) ? msg.favorites.length > 0 : !!msg.isFavorited,
    };
  }

  private async assertMember(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userAId: true, userBId: true },
    });

    if (!conv) throw new BadRequestException('Conversa não encontrada');

    const ok = conv.userAId === userId || conv.userBId === userId;
    if (!ok) throw new ForbiddenException('Você não participa dessa conversa');

    return conv;
  }

  private async getConversationState(userId: string, conversationId: string) {
    return this.prisma.conversationUserState.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { clearedAt: true },
    });
  }

  private messageInclude(currentUserId: string) {
    return {
      sender: {
        select: {
          id: true,
          username: true,
          name: true,
          avatarUrl: true,
        },
      },
      replyTo: {
        select: {
          id: true,
          body: true,
          contentType: true,
          attachmentUrl: true,
          attachmentName: true,
          attachmentMime: true,
          sender: {
            select: {
              id: true,
              username: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      },
      favorites: {
        where: { userId: currentUserId },
        select: { id: true },
      },
      reactions: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          emoji: true,
          userId: true,
          user: {
            select: {
              id: true,
              username: true,
              name: true,
            },
          },
        },
      },
      hiddenForUsers: {
        where: { userId: currentUserId },
        select: { id: true },
      },
    };
  }

  private async formatMessage(currentUserId: string, messageId: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: this.messageInclude(currentUserId),
    });

    if (!msg) throw new BadRequestException('Mensagem não encontrada');

    return this.serializeMessage(msg);
  }

  async send(input: {
    userId: string;
    conversationId: string;
    body?: string;
    replyToId?: string | null;
    file?: Express.Multer.File;
    uploadMode?: 'image' | 'file' | null;
  }) {
    const body = (input.body ?? '').trim();
    const file = input.file;

    const conv = await this.assertMember(input.userId, input.conversationId);

    if (!body && !file) {
      throw new BadRequestException('Mensagem vazia');
    }

    if (input.replyToId) {
      const replyMsg = await this.prisma.message.findUnique({
        where: { id: input.replyToId },
        select: { id: true, conversationId: true },
      });

      if (!replyMsg || replyMsg.conversationId !== input.conversationId) {
        throw new BadRequestException('Mensagem respondida inválida');
      }
    }

    let contentType: 'TEXT' | 'IMAGE' | 'FILE' = 'TEXT';
    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;
    let attachmentMime: string | null = null;
    let attachmentSize: number | null = null;

    if (file) {
      const treatAsMedia = input.uploadMode === 'image' && isLikelyMediaFile(file);

      contentType = treatAsMedia ? 'IMAGE' : 'FILE';
      attachmentUrl = treatAsMedia
        ? `/static/uploads/chat-media/${file.filename}`
        : `/static/uploads/chat-files/${file.filename}`;
      attachmentName = this.normalizeAttachmentName(file.originalname);
      attachmentMime = file.mimetype;
      attachmentSize = file.size;
    }

    const msg = await this.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        senderId: input.userId,
        body: body || null,
        contentType,
        attachmentUrl,
        attachmentName,
        attachmentMime,
        attachmentSize,
        replyToId: input.replyToId ?? null,
      },
      select: { id: true },
    });

    const now = new Date();
    const participantIds = [conv.userAId, conv.userBId];

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: input.conversationId },
        data: {},
      }),
      ...participantIds.map((participantId) =>
        this.prisma.conversationUserState.upsert({
          where: {
            conversationId_userId: {
              conversationId: input.conversationId,
              userId: participantId,
            },
          },
          update:
            participantId === input.userId
              ? { hidden: false, lastReadAt: now }
              : { hidden: false },
          create:
            participantId === input.userId
              ? {
                  conversationId: input.conversationId,
                  userId: participantId,
                  hidden: false,
                  lastReadAt: now,
                }
              : {
                  conversationId: input.conversationId,
                  userId: participantId,
                  hidden: false,
                },
        }),
      ),
    ]);

    return this.formatMessage(input.userId, msg.id);
  }

  async getConversationParticipantIds(conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { userAId: true, userBId: true },
    });
    if (!conv) return [];
    return [conv.userAId, conv.userBId];
  }

  async list(userId: string, conversationId: string, cursor?: string, take?: string) {
    await this.assertMember(userId, conversationId);
    const state = await this.getConversationState(userId, conversationId);

    const pageSize = Math.min(Math.max(parseInt(take ?? '30', 10) || 30, 1), 100);

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        hiddenForUsers: {
          none: { userId },
        },
        ...(state?.clearedAt ? { createdAt: { gt: state.clearedAt } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: this.messageInclude(userId),
    });

    const nextCursor = rows.length === pageSize ? rows[rows.length - 1].id : null;

    const items = rows.reverse().map((msg) => this.serializeMessage(msg));

    return { ok: true, items, nextCursor };
  }

  async around(userId: string, conversationId: string, messageId: string, take?: string) {
    await this.assertMember(userId, conversationId);
    const state = await this.getConversationState(userId, conversationId);

    const takeN = Math.min(Math.max(parseInt(take ?? '60', 10) || 60, 3), 200);
    const half = Math.floor((takeN - 1) / 2);

    const anchor = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, createdAt: true },
    });

    if (!anchor || anchor.conversationId !== conversationId) {
      throw new BadRequestException('Mensagem âncora não encontrada nesta conversa');
    }

    if (state?.clearedAt && anchor.createdAt <= state.clearedAt) {
      throw new BadRequestException('Mensagem âncora não encontrada nesta conversa');
    }

    const hiddenAnchor = await this.prisma.messageVisibility.findUnique({
      where: { messageId_userId: { messageId, userId } },
      select: { id: true },
    });

    if (hiddenAnchor) {
      throw new BadRequestException('Mensagem âncora não encontrada nesta conversa');
    }

    const before = await this.prisma.message.findMany({
      where: {
        conversationId,
        hiddenForUsers: { none: { userId } },
        ...(state?.clearedAt ? { createdAt: { gt: state.clearedAt } } : {}),
        OR: [
          { createdAt: { lt: anchor.createdAt } },
          { AND: [{ createdAt: { equals: anchor.createdAt } }, { id: { lt: anchor.id } }] },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: half,
      select: { id: true },
    });

    const after = await this.prisma.message.findMany({
      where: {
        conversationId,
        hiddenForUsers: { none: { userId } },
        ...(state?.clearedAt ? { createdAt: { gt: state.clearedAt } } : {}),
        OR: [
          { createdAt: { gt: anchor.createdAt } },
          { AND: [{ createdAt: { equals: anchor.createdAt } }, { id: { gt: anchor.id } }] },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: takeN - 1 - before.length,
      select: { id: true },
    });

    const ids = [...before.reverse().map((x) => x.id), anchor.id, ...after.map((x) => x.id)];

    const items = await Promise.all(ids.map((id) => this.formatMessage(userId, id)));

    return { ok: true, anchorId: anchor.id, items };
  }

  async search(userId: string, conversationId: string, q?: string, take?: string) {
    await this.assertMember(userId, conversationId);
    const state = await this.getConversationState(userId, conversationId);

    const term = (q ?? '').trim();
    if (!term) throw new BadRequestException('Informe um termo para busca');

    const takeN = Math.min(Math.max(parseInt(take ?? '150', 10) || 150, 1), 500);

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        hiddenForUsers: { none: { userId } },
        ...(state?.clearedAt ? { createdAt: { gt: state.clearedAt } } : {}),
        OR: [
          { body: { contains: term, mode: 'insensitive' } },
          { attachmentName: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: takeN,
      include: this.messageInclude(userId),
    });

    const items = rows.map((msg) => this.serializeMessage(msg));

    return { ok: true, q: term, total: items.length, items };
  }

  async listMedia(
    userId: string,
    conversationId: string,
    kind?: 'image' | 'file',
    take?: string,
  ) {
    await this.assertMember(userId, conversationId);
    const state = await this.getConversationState(userId, conversationId);

    const takeN = Math.min(Math.max(parseInt(take ?? '300', 10) || 300, 1), 1000);

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        hiddenForUsers: { none: { userId } },
        ...(state?.clearedAt ? { createdAt: { gt: state.clearedAt } } : {}),
        contentType: { in: ['IMAGE', 'FILE'] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: takeN,
      include: this.messageInclude(userId),
    });

    const items = rows
      .map((msg) => this.serializeMessage(msg))
      .filter((msg) => {
        if (!msg.attachmentUrl) return false;
        const isMedia = this.isMediaAttachment(msg);
        if (kind === 'image') return isMedia;
        if (kind === 'file') return !isMedia;
        return true;
      });

    return { ok: true, items };
  }

  async getVisibleMediaRetentionPolicy(userId: string, conversationId: string) {
    await this.assertMember(userId, conversationId);

      const cfg = await this.prisma.appConfig.upsert({
        where: { id: 'default' },
        update: {},
        create: { id: 'default' },
        select: {
          mediaRetentionEnabled: true,
          mediaRetentionInterval: true,
          mediaRetentionIntervalCount: true,
          mediaRetentionShowToUsers: true,
          mediaRetentionNextRunAt: true,
        },
    });

    if (!cfg.mediaRetentionShowToUsers) {
      return { ok: true, visible: false };
    }

      return {
        ok: true,
        visible: true,
        enabled: cfg.mediaRetentionEnabled,
        interval: cfg.mediaRetentionInterval,
        intervalLabel: mediaRetentionIntervalLabel(
          cfg.mediaRetentionInterval,
          cfg.mediaRetentionIntervalCount,
        ),
        nextRunAt: cfg.mediaRetentionNextRunAt,
      };
  }

  async toggleFavorite(userId: string, messageId: string, value: boolean) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true },
    });

    if (!message) throw new BadRequestException('Mensagem não encontrada');

    await this.assertMember(userId, message.conversationId);

    if (value) {
      await this.prisma.messageFavorite.upsert({
        where: { messageId_userId: { messageId, userId } },
        update: {},
        create: { messageId, userId },
      });
    } else {
      await this.prisma.messageFavorite.deleteMany({
        where: { messageId, userId },
      });
    }

    return {
      conversationId: message.conversationId,
      message: await this.formatMessage(userId, messageId),
    };
  }

  async setReaction(userId: string, messageId: string, emoji: string | null) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true },
    });

    if (!message) throw new BadRequestException('Mensagem não encontrada');

    await this.assertMember(userId, message.conversationId);

    if (!emoji || !emoji.trim()) {
      await this.prisma.messageReaction.deleteMany({
        where: { messageId, userId },
      });
    } else {
      await this.prisma.messageReaction.upsert({
        where: { messageId_userId: { messageId, userId } },
        update: { emoji: emoji.trim() },
        create: { messageId, userId, emoji: emoji.trim() },
      });
    }

    return {
      conversationId: message.conversationId,
      message: await this.formatMessage(userId, messageId),
    };
  }

  async remove(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, senderId: true, deletedAt: true },
    });

    if (!message) throw new BadRequestException('Mensagem não encontrada');
    await this.assertMember(userId, message.conversationId);

    await this.prisma.messageVisibility.upsert({
      where: { messageId_userId: { messageId, userId } },
      update: { hiddenAt: new Date() },
      create: { messageId, userId },
    });

    return {
      conversationId: message.conversationId,
      messageId,
      deletedAt: new Date().toISOString(),
    };
  }

  async removeMany(userId: string, messageIds: string[]) {
    if (!messageIds.length) return { conversationId: null as string | null, messageIds: [] as string[] };

    const rows = await this.prisma.message.findMany({
      where: { id: { in: messageIds } },
      select: { id: true, conversationId: true },
    });

    if (!rows.length) return { conversationId: null as string | null, messageIds: [] as string[] };

    const conversationId = rows[0].conversationId;
    if (rows.some((r) => r.conversationId !== conversationId)) {
      throw new BadRequestException('As mensagens devem ser da mesma conversa');
    }

    await this.assertMember(userId, conversationId);

    await this.prisma.messageVisibility.createMany({
      data: rows.map((row) => ({ messageId: row.id, userId })),
      skipDuplicates: true,
    });

    return { conversationId, messageIds: rows.map((r) => r.id) };
  }

  async clearConversation(userId: string, conversationId: string) {
    await this.assertMember(userId, conversationId);

    await this.prisma.conversationUserState.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      update: { clearedAt: new Date(), hidden: false },
      create: { conversationId, userId, clearedAt: new Date(), hidden: false },
    });

    return { conversationId };
  }
}
