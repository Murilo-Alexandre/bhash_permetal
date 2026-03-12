import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

/**
 * ✅ Tipagem explícita para o retorno do listUserConversations
 * (evita o TS inferir union maluco envolvendo arrays)
 */
type AdminConvRow = {
  id: string;
  updatedAt: Date;
  userA: { id: string; username: string; name: string };
  userB: { id: string; username: string; name: string };
  messages: { id: string; createdAt: Date; body: string | null; senderId: string }[];
};

@Injectable()
export class AdminHistoryService {
  constructor(private readonly prisma: PrismaService) {}

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
        userA: { select: { id: true, username: true, name: true } },
        userB: { select: { id: true, username: true, name: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, createdAt: true, body: true, senderId: true },
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
              bodyPreview: (last.body ?? '').slice(0, 160),
              senderId: last.senderId,
            }
          : null,
      };
    });

    return { ok: true, items };
  }

  // =========================
  // C) MENSAGENS da conversa (scroll/cursor + busca simples)
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
      where.body = { contains: q, mode: 'insensitive' };
    }

    const messages = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      ...(input.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
      include: { sender: { select: { id: true, username: true, name: true } } },
    });

    const nextCursor = messages.length === pageSize ? messages[messages.length - 1].id : null;
    const items = messages.reverse().map((m) => ({ ...m, body: m.body ?? '' }));

    return { ok: true, items, nextCursor };
  }

  // =========================
  // ✅ NOVO: Busca WhatsApp-style (lista de ocorrências) dentro de 1 conversa
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
        body: { contains: q, mode: 'insensitive' },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: takeN,
      select: {
        id: true,
        createdAt: true,
        body: true,
        senderId: true,
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
        bodyPreview: (m.body ?? '').slice(0, 220),
      })),
    };
  }

  // =========================
  // ✅ NOVO: Mensagens ao redor de uma mensagem (para clicar e scrollar + destacar)
  // Admin pode ver tudo
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

    // antes (mais antigos -> vamos buscar DESC e depois inverter)
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

    const normalizeBody = <T extends { body: string | null }>(message: T) => ({
      ...message,
      body: message.body ?? '',
    });

    return {
      ok: true,
      anchorId: anchor.id,
      items: [...before.reverse(), anchorFull, ...after].map(normalizeBody),
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

    // ✅ AGORA aceita 1 caractere
    if (!q || q.length < 1) throw new BadRequestException('Informe 1 caractere ou mais');

    const page = Math.max(1, Number(input.pageStr ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(input.pageSizeStr ?? 50) || 50));
    const skip = (page - 1) * pageSize;

    const fromDate = toDateOrNull(input.from);
    const toDate = toDateOrNull(input.to);
    const companyId = norm(input.companyId);
    const departmentId = norm(input.departmentId);

    const where: any = {
      body: { contains: q, mode: 'insensitive' },
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
        bodyPreview: (m.body ?? '').slice(0, 220),
        conversationId: m.conversationId,
        sender: m.sender,
        conversation: m.conversation,
      })),
    };
  }
}
