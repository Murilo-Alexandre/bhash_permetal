import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return { ok: true, conversation: conv };
  }

  async listMine(myId: string, q?: string) {
    const query = (q ?? '').trim();

    const rows = await this.prisma.conversation.findMany({
      where: {
        OR: [{ userAId: myId }, { userBId: myId }],
        ...(query
          ? {
              OR: [
                { userA: { name: { contains: query, mode: 'insensitive' } } },
                { userA: { username: { contains: query, mode: 'insensitive' } } },
                { userA: { email: { contains: query, mode: 'insensitive' } } },
                { userB: { name: { contains: query, mode: 'insensitive' } } },
                { userB: { username: { contains: query, mode: 'insensitive' } } },
                { userB: { email: { contains: query, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
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
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: this.messageSelect(myId),
        },
      },
    });

    const items = rows.map((conv) => {
      const otherUser = conv.userA.id === myId ? conv.userB : conv.userA;
      const lastMessage = conv.messages[0] ?? null;

      return {
        id: conv.id,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        otherUser,
        lastMessage: lastMessage
          ? {
              ...lastMessage,
              isFavorited: lastMessage.favorites.length > 0,
            }
          : null,
      };
    });

    return { ok: true, items };
  }
}
