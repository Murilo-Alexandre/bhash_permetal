import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

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

    return {
      id: msg.id,
      createdAt: msg.createdAt,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      body: msg.body ?? '',
      contentType: msg.contentType,
      attachmentUrl: msg.attachmentUrl,
      attachmentName: msg.attachmentName,
      attachmentMime: msg.attachmentMime,
      attachmentSize: msg.attachmentSize,
      replyToId: msg.replyToId,
      deletedAt: msg.deletedAt,
      sender: msg.sender,
      replyTo: msg.replyTo,
      reactions: msg.reactions,
      isFavorited: msg.favorites.length > 0,
    };
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

    await this.assertMember(input.userId, input.conversationId);

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
      const treatAsImage =
        input.uploadMode === 'image' && /^image\//i.test(file.mimetype);

      contentType = treatAsImage ? 'IMAGE' : 'FILE';
      attachmentUrl = treatAsImage
        ? `/static/uploads/chat-images/${file.filename}`
        : `/static/uploads/chat-files/${file.filename}`;
      attachmentName = file.originalname;
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

    await this.prisma.conversation.update({
      where: { id: input.conversationId },
      data: {},
    });

    return this.formatMessage(input.userId, msg.id);
  }

  async list(userId: string, conversationId: string, cursor?: string, take?: string) {
    await this.assertMember(userId, conversationId);

    const pageSize = Math.min(Math.max(parseInt(take ?? '30', 10) || 30, 1), 100);

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        hiddenForUsers: {
          none: { userId },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: this.messageInclude(userId),
    });

    const nextCursor = rows.length === pageSize ? rows[rows.length - 1].id : null;

    const items = rows.reverse().map((msg) => ({
      id: msg.id,
      createdAt: msg.createdAt,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      body: msg.body ?? '',
      contentType: msg.contentType,
      attachmentUrl: msg.attachmentUrl,
      attachmentName: msg.attachmentName,
      attachmentMime: msg.attachmentMime,
      attachmentSize: msg.attachmentSize,
      replyToId: msg.replyToId,
      deletedAt: msg.deletedAt,
      sender: msg.sender,
      replyTo: msg.replyTo,
      reactions: msg.reactions,
      isFavorited: msg.favorites.length > 0,
    }));

    return { ok: true, items, nextCursor };
  }

  async around(userId: string, conversationId: string, messageId: string, take?: string) {
    await this.assertMember(userId, conversationId);

    const takeN = Math.min(Math.max(parseInt(take ?? '60', 10) || 60, 3), 200);
    const half = Math.floor((takeN - 1) / 2);

    const anchor = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, createdAt: true },
    });

    if (!anchor || anchor.conversationId !== conversationId) {
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

    const term = (q ?? '').trim();
    if (!term) throw new BadRequestException('Informe um termo para busca');

    const takeN = Math.min(Math.max(parseInt(take ?? '150', 10) || 150, 1), 500);

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        hiddenForUsers: { none: { userId } },
        OR: [
          { body: { contains: term, mode: 'insensitive' } },
          { attachmentName: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: takeN,
      include: this.messageInclude(userId),
    });

    const items = rows.map((msg) => ({
      id: msg.id,
      createdAt: msg.createdAt,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      body: msg.body ?? '',
      contentType: msg.contentType,
      attachmentUrl: msg.attachmentUrl,
      attachmentName: msg.attachmentName,
      attachmentMime: msg.attachmentMime,
      attachmentSize: msg.attachmentSize,
      replyToId: msg.replyToId,
      deletedAt: msg.deletedAt,
      sender: msg.sender,
      replyTo: msg.replyTo,
      reactions: msg.reactions,
      isFavorited: msg.favorites.length > 0,
    }));

    return { ok: true, q: term, total: items.length, items };
  }

  async listMedia(
    userId: string,
    conversationId: string,
    kind?: 'image' | 'file',
    take?: string,
  ) {
    await this.assertMember(userId, conversationId);

    const takeN = Math.min(Math.max(parseInt(take ?? '300', 10) || 300, 1), 1000);

    const contentType =
      kind === 'image' ? 'IMAGE' : kind === 'file' ? 'FILE' : undefined;

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(contentType ? { contentType } : { contentType: { in: ['IMAGE', 'FILE'] } }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: takeN,
      include: this.messageInclude(userId),
    });

    const items = rows.map((msg) => ({
      id: msg.id,
      createdAt: msg.createdAt,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      body: msg.body ?? '',
      contentType: msg.contentType,
      attachmentUrl: msg.attachmentUrl,
      attachmentName: msg.attachmentName,
      attachmentMime: msg.attachmentMime,
      attachmentSize: msg.attachmentSize,
      sender: msg.sender,
      isFavorited: msg.favorites.length > 0,
      reactions: msg.reactions,
    }));

    return { ok: true, items };
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
