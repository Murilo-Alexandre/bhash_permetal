// C:\dev\bhash\backend\src\messages\messages.service.ts
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

  async send(userId: string, conversationId: string, text: string) {
    const body = (text ?? '').trim();
    if (!body) throw new BadRequestException('Mensagem vazia');

    await this.assertMember(userId, conversationId);

    const msg = await this.prisma.message.create({
      data: { conversationId, senderId: userId, body },
      include: { sender: { select: { id: true, username: true, name: true } } },
    });

    // força o updatedAt da conversa atualizar
    await this.prisma.conversation.update({ where: { id: conversationId }, data: {} });

    return msg;
  }

  async list(userId: string, conversationId: string, cursor?: string, take?: string) {
    await this.assertMember(userId, conversationId);

    const pageSize = Math.min(Math.max(parseInt(take ?? '30', 10) || 30, 1), 100);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { sender: { select: { id: true, username: true, name: true } } },
    });

    const nextCursor = messages.length === pageSize ? messages[messages.length - 1].id : null;

    return { items: messages.reverse(), nextCursor };
  }

  // ✅ NOVO: mensagens ao redor de uma âncora (user precisa ser membro)
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

    const before = await this.prisma.message.findMany({
      where: {
        conversationId,
        OR: [
          { createdAt: { lt: anchor.createdAt } },
          { AND: [{ createdAt: { equals: anchor.createdAt } }, { id: { lt: anchor.id } }] },
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
          { AND: [{ createdAt: { equals: anchor.createdAt } }, { id: { gt: anchor.id } }] },
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

    return {
      ok: true,
      anchorId: anchor.id,
      items: [...before.reverse(), anchorFull, ...after],
    };
  }
}
