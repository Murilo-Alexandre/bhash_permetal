import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import {
  isAttachmentRemovalNoticeText,
  mediaRetentionIntervalLabel,
} from '../admin-history/media-retention.util';
import {
  isLikelyAudioFile,
  isLikelyMediaFile,
  normalizeUploadedFileName,
} from '../common/upload-filename.util';
import {
  removeUploadedChatAttachment,
  validateUploadedChatAttachment,
} from '../common/upload-content.util';

type MessageDelivery = {
  conversationId: string;
  message: any;
  participantIds: string[];
  notifyUserIds?: string[];
  syncUserIds?: string[];
  emitToConversationRoom?: boolean;
};

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async moveUploadedAudioFile(file: Express.Multer.File) {
    if (!file?.path || !file.filename) return;

    const targetDir = path.join(process.cwd(), 'public', 'uploads', 'chat-audio');
    const targetPath = path.join(targetDir, file.filename);
    if (path.resolve(file.path) === path.resolve(targetPath)) return;

    await fs.mkdir(targetDir, { recursive: true });
    await fs.rename(file.path, targetPath);
    file.destination = targetDir;
    file.path = targetPath;
  }

  private attachmentStorageKind(attachmentUrl?: string | null) {
    const url = String(attachmentUrl ?? '').toLowerCase();
    if (url.includes('/chat-files/')) return 'file';
    if (url.includes('/chat-media/')) return 'media';
    if (url.includes('/chat-audio/')) return 'audio';
    return null;
  }

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
    const storageKind = this.attachmentStorageKind(message.attachmentUrl);
    if (storageKind === 'file') return false;
    if (storageKind === 'media') return true;
    if (storageKind === 'audio') return false;
    if (message.contentType === 'IMAGE') return true;
    if (message.contentType === 'FILE') return false;
    if (message.contentType === 'AUDIO') return false;
    return isLikelyMediaFile(message);
  }

  private isAudioAttachment(message: {
    contentType?: string | null;
    attachmentMime?: string | null;
    attachmentName?: string | null;
    attachmentUrl?: string | null;
  }) {
    const storageKind = this.attachmentStorageKind(message.attachmentUrl);
    if (storageKind === 'audio') return true;
    if (message.contentType === 'AUDIO') return true;
    return false;
  }

  private mapReplyTo(replyTo: any) {
    if (!replyTo) return null;
    return {
      id: replyTo.id,
      body: replyTo.body ?? '',
      contentType: this.isMediaAttachment(replyTo)
        ? 'IMAGE'
        : this.isAudioAttachment(replyTo)
        ? 'AUDIO'
        : replyTo.contentType,
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
      contentType: this.isMediaAttachment(msg) ? 'IMAGE' : this.isAudioAttachment(msg) ? 'AUDIO' : msg.contentType,
      attachmentUrl: msg.attachmentUrl ?? null,
      attachmentName: this.normalizeAttachmentName(msg.attachmentName),
      attachmentMime: msg.attachmentMime ?? null,
      attachmentSize: msg.attachmentSize ?? null,
      replyToId: msg.replyToId ?? null,
      deletedAt: msg.deletedAt ?? null,
      sender: msg.sender ?? null,
      broadcastSource:
        msg.broadcastListId && msg.broadcastListTitle
          ? {
              id: msg.broadcastListId,
              title: msg.broadcastListTitle,
            }
          : null,
      replyTo: this.mapReplyTo(msg.replyTo),
      reactions: msg.reactions ?? [],
      isFavorited: Array.isArray(msg.favorites) ? msg.favorites.length > 0 : !!msg.isFavorited,
    };
  }

  private async assertMember(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        kind: true,
        title: true,
        createdById: true,
        broadcastIncludeAllUsers: true,
        userAId: true,
        userBId: true,
        participants: {
          select: { userId: true },
        },
        broadcastTargets: {
          select: { userId: true },
        },
        broadcastCompanyTargets: {
          select: { companyId: true },
        },
        broadcastDepartmentTargets: {
          select: { departmentId: true },
        },
        broadcastExcludedUsers: {
          select: { userId: true },
        },
        states: {
          where: { userId },
          take: 1,
          select: {
            hidden: true,
            leftAt: true,
            clearedAt: true,
          },
        },
      },
    });

    if (!conv) throw new BadRequestException('Conversa não encontrada');

    const participantIds = this.participantIdsFromConversation(conv);
    const state = conv.states?.[0] ?? null;
    const ok =
      participantIds.includes(userId) ||
      ((conv.kind === 'GROUP' || conv.kind === 'BROADCAST') && !!state?.leftAt && !state?.hidden);
    if (!ok) throw new ForbiddenException('Você não participa dessa conversa');

    return conv;
  }

  private async assertCurrentParticipant(userId: string, conversationId: string) {
    const conv = await this.assertMember(userId, conversationId);
    const ok = this.participantIdsFromConversation(conv).includes(userId);
    if (!ok) throw new ForbiddenException('Você não participa mais dessa conversa');
    return conv;
  }

  private participantIdsFromConversation(conv: {
    userAId?: string | null;
    userBId?: string | null;
    participants?: Array<{ userId: string }>;
  }) {
    return Array.from(
      new Set(
        [
          ...(Array.isArray(conv?.participants) ? conv.participants.map((item) => item.userId) : []),
          conv?.userAId ?? null,
          conv?.userBId ?? null,
        ].filter((value): value is string => !!value),
      ),
    );
  }

  private async ensureVisibleStates(
    conversationId: string,
    participantIds: string[],
    currentUserId?: string | null,
  ) {
    const uniqueIds = Array.from(
      new Set(participantIds.map((value) => String(value ?? '').trim()).filter(Boolean)),
    );
    if (!uniqueIds.length) return;

    const now = new Date();
    await this.prisma.$transaction(
      uniqueIds.map((participantId) =>
        this.prisma.conversationUserState.upsert({
          where: {
            conversationId_userId: {
              conversationId,
              userId: participantId,
            },
          },
          update:
            participantId === currentUserId
              ? { hidden: false, leftAt: null, lastReadAt: now }
              : { hidden: false, leftAt: null },
          create:
            participantId === currentUserId
              ? {
                  conversationId,
                  userId: participantId,
                  hidden: false,
                  leftAt: null,
                  lastReadAt: now,
                }
              : {
                  conversationId,
                  userId: participantId,
                  hidden: false,
                  leftAt: null,
                },
        }),
      ),
    );
  }

  private async ensureBroadcastDirectStates(
    conversationId: string,
    senderUserId: string,
    recipientUserId: string,
    keepSenderHidden: boolean,
  ) {
    const now = new Date();
    const operations = [
      this.prisma.conversationUserState.upsert({
        where: {
          conversationId_userId: {
            conversationId,
            userId: recipientUserId,
          },
        },
        update: { hidden: false, leftAt: null },
        create: {
          conversationId,
          userId: recipientUserId,
          hidden: false,
          leftAt: null,
        },
      }),
    ];

    if (keepSenderHidden) {
      operations.push(
        this.prisma.conversationUserState.upsert({
          where: {
            conversationId_userId: {
              conversationId,
              userId: senderUserId,
            },
          },
          update: {
            hidden: true,
            leftAt: null,
            lastReadAt: now,
          },
          create: {
            conversationId,
            userId: senderUserId,
            hidden: true,
            leftAt: null,
            lastReadAt: now,
          },
        }),
      );
    }

    await this.prisma.$transaction(operations);
  }

  private async getOrCreateDirectConversation(userId: string, otherUserId: string) {
    const [userAId, userBId] = userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];
    const existing = await this.prisma.conversation.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
      select: { id: true },
    });

    const conv = await this.prisma.conversation.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      update: {
        kind: 'DIRECT',
        title: null,
        avatarUrl: null,
      },
      create: {
        id: randomUUID(),
        kind: 'DIRECT',
        userAId,
        userBId,
      },
      select: {
        id: true,
        kind: true,
        createdById: true,
        userAId: true,
        userBId: true,
        participants: {
          select: { userId: true },
        },
        automaticRules: {
          select: {
            companyId: true,
            departmentId: true,
          },
        },
        broadcastTargets: {
          select: { userId: true },
        },
        states: {
          where: {
            userId: {
              in: [userId, otherUserId],
            },
          },
          select: {
            userId: true,
            hidden: true,
          },
        },
      },
    });

    await this.prisma.conversationParticipant.createMany({
      data: [userAId, userBId].map((participantId) => ({
        id: randomUUID(),
        conversationId: conv.id,
        userId: participantId,
        addedById: userId,
      })),
      skipDuplicates: true,
    });

    const participants =
      conv.participants.length >= 2
        ? conv.participants
        : [{ userId: userAId }, { userId: userBId }];

    return {
      ...conv,
      participants,
      isNewConversation: !existing,
      senderHidden: conv.states.find((state) => state.userId === userId)?.hidden ?? null,
    };
  }
  private async getConversationState(userId: string, conversationId: string) {
    return this.prisma.conversationUserState.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { clearedAt: true, leftAt: true },
    });
  }

  private async visibleConversationMessagesWhere(userId: string, conversationId: string) {
    const state = await this.getConversationState(userId, conversationId);
    const createdAt: Record<string, Date> = {};
    if (state?.clearedAt) createdAt.gt = state.clearedAt;
    if (state?.leftAt) createdAt.lte = state.leftAt;
    return {
      conversationId,
      hiddenForUsers: { none: { userId } },
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
    };
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

  private async createStoredMessage(input: {
    conversationId: string;
    userId: string;
    body?: string | null;
    contentType: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO';
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    attachmentMime?: string | null;
    attachmentSize?: number | null;
    replyToId?: string | null;
    broadcastListId?: string | null;
    broadcastListTitle?: string | null;
  }) {
    return this.prisma.message.create({
      data: {
        id: randomUUID(),
        conversationId: input.conversationId,
        senderId: input.userId,
        body: input.body ?? null,
        contentType: input.contentType,
        attachmentUrl: input.attachmentUrl ?? null,
        attachmentName: input.attachmentName ?? null,
        attachmentMime: input.attachmentMime ?? null,
        attachmentSize: input.attachmentSize ?? null,
        replyToId: input.replyToId ?? null,
        broadcastListId: input.broadcastListId ?? null,
        broadcastListTitle: input.broadcastListTitle ?? null,
      },
      select: { id: true },
    });
  }

  private async resolveBroadcastTargetIds(conv: {
    createdById?: string | null;
    broadcastIncludeAllUsers?: boolean | null;
    automaticRules?: Array<{ companyId?: string | null; departmentId?: string | null }>;
    broadcastTargets?: Array<{ userId: string }>;
    broadcastCompanyTargets?: Array<{ companyId: string }>;
    broadcastDepartmentTargets?: Array<{ departmentId: string }>;
    broadcastExcludedUsers?: Array<{ userId: string }>;
  }) {
    const ownerId = String(conv.createdById ?? '').trim();
    const targetIds = new Set(
      (conv.broadcastTargets ?? [])
        .map((item) => String(item?.userId ?? '').trim())
        .filter((value) => !!value && value !== ownerId),
    );

    const companyIds = (conv.broadcastCompanyTargets ?? [])
      .map((item) => String(item?.companyId ?? '').trim())
      .filter(Boolean);
    const departmentIds = (conv.broadcastDepartmentTargets ?? [])
      .map((item) => String(item?.departmentId ?? '').trim())
      .filter(Boolean);
    const automaticRules = (conv.automaticRules ?? [])
      .map((rule) => ({
        companyId: rule?.companyId ? String(rule.companyId).trim() : null,
        departmentId: rule?.departmentId ? String(rule.departmentId).trim() : null,
      }))
      .filter((rule) => !!rule.companyId || !!rule.departmentId);

    if (conv.broadcastIncludeAllUsers || automaticRules.length || companyIds.length || departmentIds.length) {
      const dynamicUsers = await this.prisma.user.findMany({
        where: {
          isActive: true,
          id: { not: ownerId },
          OR: conv.broadcastIncludeAllUsers
            ? undefined
            : automaticRules.length
            ? automaticRules.map((rule) => ({
                ...(rule.companyId ? { companyId: rule.companyId } : null),
                ...(rule.departmentId ? { departmentId: rule.departmentId } : null),
              }))
            : [
                ...(companyIds.length ? [{ companyId: { in: companyIds } }] : []),
                ...(departmentIds.length ? [{ departmentId: { in: departmentIds } }] : []),
              ],
        },
        select: { id: true },
      });

      for (const user of dynamicUsers) targetIds.add(user.id);
    }

    for (const excluded of conv.broadcastExcludedUsers ?? []) {
      targetIds.delete(String(excluded?.userId ?? '').trim());
    }

    return Array.from(targetIds);
  }

  async send(input: {
    userId: string;
    conversationId: string;
    body?: string;
    replyToId?: string | null;
    file?: Express.Multer.File;
    uploadMode?: 'image' | 'file' | 'audio' | null;
  }): Promise<{ message: any; deliveries: MessageDelivery[] }> {
    const body = (input.body ?? '').trim();
    const file = input.file;

    const conv = await this.assertCurrentParticipant(input.userId, input.conversationId);

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

    let contentType: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' = 'TEXT';
    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;
    let attachmentMime: string | null = null;
    let attachmentSize: number | null = null;

    if (file) {
      const invalidAttachmentMessage = await validateUploadedChatAttachment(file);
      if (invalidAttachmentMessage) {
        await removeUploadedChatAttachment(file);
        throw new BadRequestException(invalidAttachmentMessage);
      }

      if (input.uploadMode === 'audio' && !isLikelyAudioFile(file)) {
        await removeUploadedChatAttachment(file);
        throw new BadRequestException('Selecione um arquivo de áudio válido.');
      }

      const treatAsMedia = input.uploadMode === 'image' && isLikelyMediaFile(file);
      const treatAsAudio = input.uploadMode === 'audio' && isLikelyAudioFile(file);

      if (treatAsAudio) {
        await this.moveUploadedAudioFile(file);
      }

      contentType = treatAsMedia ? 'IMAGE' : treatAsAudio ? 'AUDIO' : 'FILE';
      attachmentUrl = treatAsAudio
        ? `/static/uploads/chat-audio/${file.filename}`
        : `/static/uploads/chat/${file.filename}`;
      attachmentName = this.normalizeAttachmentName(file.originalname);
      attachmentMime = file.mimetype;
      attachmentSize = file.size;
    }

    const msg = await this.createStoredMessage({
      conversationId: input.conversationId,
      userId: input.userId,
      body: body || null,
      contentType,
      attachmentUrl,
      attachmentName,
      attachmentMime,
      attachmentSize,
      replyToId: input.replyToId ?? null,
      broadcastListId: conv.kind === 'BROADCAST' ? conv.id : null,
      broadcastListTitle: conv.kind === 'BROADCAST' ? conv.title ?? 'Lista de transmissão' : null,
    });

    await this.prisma.conversation.update({
      where: { id: input.conversationId },
      data: {},
    });

    const baseParticipantIds = this.participantIdsFromConversation(conv);
    await this.ensureVisibleStates(input.conversationId, baseParticipantIds, input.userId);

    const primaryMessage = await this.formatMessage(input.userId, msg.id);
    const deliveries: MessageDelivery[] = [
      {
        conversationId: input.conversationId,
        message: primaryMessage,
        participantIds: baseParticipantIds,
      },
    ];

    if (conv.kind === 'BROADCAST') {
      const targetIds = await this.resolveBroadcastTargetIds(conv);

      for (const targetId of targetIds) {
        const directConversation = await this.getOrCreateDirectConversation(input.userId, targetId);
        const directMessage = await this.createStoredMessage({
          conversationId: directConversation.id,
          userId: input.userId,
          body: body || null,
          contentType,
          attachmentUrl,
          attachmentName,
          attachmentMime,
          attachmentSize,
          replyToId: null,
          broadcastListId: conv.id,
          broadcastListTitle: conv.title ?? 'Lista de transmissão',
        });

        const directParticipantIds = this.participantIdsFromConversation(directConversation);
        await this.ensureBroadcastDirectStates(
          directConversation.id,
          input.userId,
          targetId,
          directConversation.isNewConversation || directConversation.senderHidden === true,
        );

        deliveries.push({
          conversationId: directConversation.id,
          message: await this.formatMessage(targetId, directMessage.id),
          participantIds: directParticipantIds,
          notifyUserIds: [targetId],
          syncUserIds: [targetId],
          emitToConversationRoom: false,
        });
      }
    }

    return {
      message: primaryMessage,
      deliveries,
    };
  }

  async getConversationParticipantIds(conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        userAId: true,
        userBId: true,
        participants: {
          select: { userId: true },
        },
      },
    });
    if (!conv) return [];
    return this.participantIdsFromConversation(conv);
  }

  async list(userId: string, conversationId: string, cursor?: string, take?: string) {
    await this.assertMember(userId, conversationId);
    const state = await this.getConversationState(userId, conversationId);
    const createdAt: Record<string, Date> = {};
    if (state?.clearedAt) createdAt.gt = state.clearedAt;
    if (state?.leftAt) createdAt.lte = state.leftAt;

    const pageSize = Math.min(Math.max(parseInt(take ?? '30', 10) || 30, 1), 100);

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        hiddenForUsers: {
          none: { userId },
        },
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
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
    const createdAtRange: Record<string, Date> = {};
    if (state?.clearedAt) createdAtRange.gt = state.clearedAt;
    if (state?.leftAt) createdAtRange.lte = state.leftAt;

    const takeN = Math.min(Math.max(parseInt(take ?? '60', 10) || 60, 3), 200);
    const half = Math.floor((takeN - 1) / 2);

    const anchor = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, createdAt: true },
    });

    if (!anchor || anchor.conversationId !== conversationId) {
      throw new BadRequestException('Mensagem âncora não encontrada nesta conversa');
    }

    if ((state?.clearedAt && anchor.createdAt <= state.clearedAt) || (state?.leftAt && anchor.createdAt > state.leftAt)) {
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
        ...(Object.keys(createdAtRange).length ? { createdAt: createdAtRange } : {}),
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
        ...(Object.keys(createdAtRange).length ? { createdAt: createdAtRange } : {}),
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

    const rows = await this.prisma.message.findMany({
      where: { id: { in: ids } },
      include: this.messageInclude(userId),
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => !!row)
      .map((row) => this.serializeMessage(row));

    return { ok: true, anchorId: anchor.id, items };
  }

  async search(userId: string, conversationId: string, q?: string, take?: string) {
    await this.assertMember(userId, conversationId);
    const state = await this.getConversationState(userId, conversationId);
    const createdAt: Record<string, Date> = {};
    if (state?.clearedAt) createdAt.gt = state.clearedAt;
    if (state?.leftAt) createdAt.lte = state.leftAt;

    const term = (q ?? '').trim();
    if (!term) throw new BadRequestException('Informe um termo para busca');

    const takeN = Math.min(Math.max(parseInt(take ?? '150', 10) || 150, 1), 500);

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        hiddenForUsers: { none: { userId } },
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
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
    const createdAt: Record<string, Date> = {};
    if (state?.clearedAt) createdAt.gt = state.clearedAt;
    if (state?.leftAt) createdAt.lte = state.leftAt;

    const takeN = Math.min(Math.max(parseInt(take ?? '300', 10) || 300, 1), 1000);

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        hiddenForUsers: { none: { userId } },
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
        contentType: { in: ['IMAGE', 'FILE', 'AUDIO'] },
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

  async removeRemovedAttachmentNotices(userId: string, conversationId: string) {
    await this.assertMember(userId, conversationId);
    const where = await this.visibleConversationMessagesWhere(userId, conversationId);

    const rows = await this.prisma.message.findMany({
      where: {
        ...where,
        deletedAt: { not: null },
      },
      select: { id: true, body: true },
    });

    const matchingIds = rows
      .filter((row) => isAttachmentRemovalNoticeText(row.body))
      .map((row) => row.id);

    if (!matchingIds.length) {
      return { conversationId, messageIds: [] as string[] };
    }

    await this.prisma.messageVisibility.createMany({
      data: matchingIds.map((messageId) => ({ messageId, userId })),
      skipDuplicates: true,
    });

    return { conversationId, messageIds: matchingIds };
  }

  async clearConversation(userId: string, conversationId: string) {
    await this.assertMember(userId, conversationId);

    await this.prisma.conversationUserState.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      update: { clearedAt: new Date(), hidden: false },
      create: { conversationId, userId, clearedAt: new Date(), hidden: false },
    });

    return { conversationId, keptFavorites: false as const, messageIds: [] as string[] };
  }

  async getClearConversationSummary(userId: string, conversationId: string) {
    await this.assertMember(userId, conversationId);
    const where = await this.visibleConversationMessagesWhere(userId, conversationId);

    const [totalCount, favoriteCount] = await Promise.all([
      this.prisma.message.count({ where }),
      this.prisma.message.count({
        where: {
          ...where,
          favorites: { some: { userId } },
        },
      }),
    ]);

    return { conversationId, totalCount, favoriteCount };
  }

  async clearConversationKeepingFavorites(userId: string, conversationId: string) {
    await this.assertMember(userId, conversationId);
    const where = await this.visibleConversationMessagesWhere(userId, conversationId);
    const messagesToHide = await this.prisma.message.findMany({
      where: {
        ...where,
        favorites: { none: { userId } },
      },
      select: { id: true },
    });

    if (messagesToHide.length) {
      await this.prisma.messageVisibility.createMany({
        data: messagesToHide.map((message) => ({ messageId: message.id, userId })),
        skipDuplicates: true,
      });
    }

    await this.prisma.conversationUserState.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      update: { hidden: false },
      create: { conversationId, userId, hidden: false },
    });

    return {
      conversationId,
      keptFavorites: true as const,
      messageIds: messagesToHide.map((message) => message.id),
    };
  }
}


