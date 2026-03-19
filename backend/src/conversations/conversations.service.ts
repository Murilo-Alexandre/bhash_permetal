import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeUploadedFileName } from '../common/upload-filename.util';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeAttachmentName(value?: string | null) {
    const normalized = normalizeUploadedFileName(value);
    return normalized || null;
  }

  private normalizePair(a: string, b: string) {
    return a < b ? [a, b] : [b, a];
  }

  private messageSelect(currentUserId: string) {
    return {
      id: true,
      createdAt: true,
      senderId: true,
      body: true,
      contentType: true,
      attachmentUrl: true,
      attachmentName: true,
      attachmentMime: true,
      attachmentSize: true,
      deletedAt: true,
      sender: { select: { id: true, username: true, name: true, avatarUrl: true } },
      favorites: {
        where: { userId: currentUserId },
        select: { id: true },
      },
      reactions: {
        select: {
          id: true,
          emoji: true,
          userId: true,
          user: { select: { id: true, name: true, username: true } },
        },
      },
    };
  }

  private async assertMember(myId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, OR: [{ userAId: myId }, { userBId: myId }] },
      select: { id: true },
    });

    if (!conv) throw new BadRequestException('Conversa não encontrada');
    return conv;
  }

  private rankTimestamp(conv: { updatedAt?: string | Date; createdAt?: string | Date }) {
    const updated = conv.updatedAt ? new Date(conv.updatedAt).getTime() : 0;
    const created = conv.createdAt ? new Date(conv.createdAt).getTime() : 0;
    return Number.isFinite(updated) && updated > 0 ? updated : created;
  }

  async getOrCreateDirect(myId: string, otherUserId: string) {
    if (!otherUserId || otherUserId === myId) {
      throw new BadRequestException('otherUserId inválido');
    }

    const other = await this.prisma.user.findUnique({ where: { id: otherUserId } });
    if (!other || !other.isActive) throw new BadRequestException('Usuário não encontrado/inativo');

    const [userAId, userBId] = this.normalizePair(myId, otherUserId);

    const conv = await this.prisma.conversation.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      update: {},
      create: { userAId, userBId },
      include: {
        userA: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            extension: true,
            avatarUrl: true,
            company: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
          },
        },
        userB: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            extension: true,
            avatarUrl: true,
            company: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    await this.prisma.conversationUserState.upsert({
      where: { conversationId_userId: { conversationId: conv.id, userId: myId } },
      update: { hidden: false },
      create: { conversationId: conv.id, userId: myId, hidden: false },
    });

    return { ok: true, conversation: conv };
  }

  async listMine(myId: string, q?: string) {
    const query = (q ?? '').trim();
    const membershipFilter = { OR: [{ userAId: myId }, { userBId: myId }] };
    const queryFilter = query
      ? {
          OR: [
            { userA: { name: { contains: query, mode: 'insensitive' as const } } },
            { userA: { username: { contains: query, mode: 'insensitive' as const } } },
            { userA: { email: { contains: query, mode: 'insensitive' as const } } },
            { userB: { name: { contains: query, mode: 'insensitive' as const } } },
            { userB: { username: { contains: query, mode: 'insensitive' as const } } },
            { userB: { email: { contains: query, mode: 'insensitive' as const } } },
          ],
        }
      : null;

    const rows = await this.prisma.conversation.findMany({
      where: {
        AND: [membershipFilter, ...(queryFilter ? [queryFilter] : [])],
        states: { none: { userId: myId, hidden: true } },
      },
      include: {
        userA: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            extension: true,
            avatarUrl: true,
            company: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
          },
        },
        userB: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            extension: true,
            avatarUrl: true,
            company: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
          },
        },
        states: {
          where: { userId: myId },
          take: 1,
        },
      },
    });

    const items = await Promise.all(
      rows.map(async (conv) => {
        const otherUser = conv.userA.id === myId ? conv.userB : conv.userA;
        const state = (conv.states[0] as any) ?? null;
        const pinned = !!state?.pinned;

        const lastMessage = await this.prisma.message.findFirst({
          where: {
            conversationId: conv.id,
            hiddenForUsers: { none: { userId: myId } },
            ...(state?.clearedAt ? { createdAt: { gt: state.clearedAt } } : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: this.messageSelect(myId),
        });

        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: myId },
            hiddenForUsers: { none: { userId: myId } },
            ...(state?.lastReadAt ? { createdAt: { gt: state.lastReadAt } } : {}),
            ...(state?.clearedAt ? { createdAt: { gt: state.clearedAt } } : {}),
          },
        });

        return {
          id: conv.id,
          createdAt: conv.createdAt,
          updatedAt: lastMessage?.createdAt ?? conv.updatedAt,
          otherUser,
          pinned,
          unreadCount,
          lastMessage: lastMessage
            ? {
                ...lastMessage,
                attachmentName: this.normalizeAttachmentName(lastMessage.attachmentName),
                isFavorited: lastMessage.favorites.length > 0,
              }
            : null,
        };
      }),
    );

    items.sort((a, b) => {
      const pinDiff = Number(!!b.pinned) - Number(!!a.pinned);
      if (pinDiff !== 0) return pinDiff;
      return this.rankTimestamp(b) - this.rankTimestamp(a);
    });

    return { ok: true, items };
  }

  async markAsRead(myId: string, conversationId: string) {
    await this.assertMember(myId, conversationId);

    await this.prisma.conversationUserState.upsert({
      where: { conversationId_userId: { conversationId, userId: myId } },
      update: { lastReadAt: new Date(), hidden: false },
      create: { conversationId, userId: myId, lastReadAt: new Date(), hidden: false },
    });

    return { ok: true };
  }

  async hideConversation(myId: string, conversationId: string) {
    await this.markAsRead(myId, conversationId);

    await this.prisma.conversationUserState.update({
      where: { conversationId_userId: { conversationId, userId: myId } },
      data: { hidden: true },
    });

    return { ok: true };
  }

  async setPinned(myId: string, conversationId: string, value: boolean) {
    await this.assertMember(myId, conversationId);

    await this.prisma.conversationUserState.upsert({
      where: { conversationId_userId: { conversationId, userId: myId } },
      update: { pinned: !!value, hidden: false } as any,
      create: {
        conversationId,
        userId: myId,
        pinned: !!value,
        hidden: false,
      } as any,
    });

    return { ok: true, pinned: !!value };
  }
}
