import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  Query,
  Patch,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { ChatEventsService } from '../chat/chat-events.service';
import {
  conversationAvatarFileBase,
  deleteConversationAvatarFileSafe,
  deleteConversationAvatarVariantsByBase,
  ensureConversationAvatarUploadsDir,
  safeConversationAvatarPathFromUrl,
  safeConversationImageExt,
} from '../common/conversation-avatar.util';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly events: ChatEventsService,
  ) {}

  @Get()
  listMine(@Req() req: any, @Query('q') q?: string) {
    return this.conversations.listMine(req.user.sub, q);
  }

  @Post('direct')
  getOrCreateDirect(@Req() req: any, @Body() body: { otherUserId: string }) {
    return this.conversations.getOrCreateDirect(req.user.sub, body.otherUserId);
  }

  @Post('group')
  async createGroup(
    @Req() req: any,
    @Body()
    body: {
      title?: string;
      memberIds?: string[];
      automaticRules?: Array<{ companyId?: string | null; departmentId?: string | null }>;
      companyIds?: string[];
      departmentIds?: string[];
      includeAllUsers?: boolean;
    },
  ) {
    const result = await this.conversations.createGroup(req.user.sub, body ?? {});
    for (const participantId of result.participantIds ?? []) {
      this.events.emitConversationsSync(participantId, {
        conversationId: result.conversation.id,
        force: true,
      });
    }
    return result;
  }

  @Post('broadcast')
  createBroadcastList(
    @Req() req: any,
    @Body()
    body: {
      title?: string;
      targetUserIds?: string[];
      automaticRules?: Array<{ companyId?: string | null; departmentId?: string | null }>;
      companyIds?: string[];
      departmentIds?: string[];
      excludedUserIds?: string[];
      includeAllUsers?: boolean;
    },
  ) {
    return this.conversations.createBroadcastList(req.user.sub, body ?? {});
  }

  @Get(':id/details')
  getDetails(@Req() req: any, @Param('id') conversationId: string) {
    return this.conversations.getDetails(req.user.sub, conversationId);
  }

  @Patch(':id/broadcast')
  async updateBroadcastList(
    @Req() req: any,
    @Param('id') conversationId: string,
    @Body()
    body: {
      title?: string;
      targetUserIds?: string[];
      automaticRules?: Array<{ companyId?: string | null; departmentId?: string | null }>;
      companyIds?: string[];
      departmentIds?: string[];
      excludedUserIds?: string[];
      includeAllUsers?: boolean;
    },
  ) {
    const result = await this.conversations.updateBroadcastList(req.user.sub, conversationId, body ?? {});
    this.events.emitConversationsSync(req.user.sub, { conversationId, force: true });
    return result;
  }

  @Delete(':id/broadcast')
  async deleteBroadcastList(@Req() req: any, @Param('id') conversationId: string) {
    const result = await this.conversations.deleteBroadcastList(req.user.sub, conversationId);
    this.events.emitConversationsSync(req.user.sub, { conversationId, force: true });
    return result;
  }

  @Post(':id/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, ensureConversationAvatarUploadsDir());
        },
        filename: (req: any, file, cb) => {
          const ext = safeConversationImageExt(file.originalname);
          const base = conversationAvatarFileBase(req?.params?.id ?? 'conversation', 'conversation');
          cb(null, `${base}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /image\/(png|jpeg|jpg|webp)/.test(file.mimetype);
        if (!ok) return cb(new BadRequestException('Envie PNG/JPG/WEBP'), false);
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(
    @Req() req: any,
    @Param('id') conversationId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo não recebido');

    const current = await this.conversations.assertCurrentParticipant(req.user.sub, conversationId);
    const avatarUrl = `/static/uploads/conversation-avatars/${file.filename}`;
    const oldAvatarPath = safeConversationAvatarPathFromUrl(current.avatarUrl);
    const newAvatarPath = safeConversationAvatarPathFromUrl(avatarUrl);
    const base = conversationAvatarFileBase(conversationId, 'conversation');

    if (oldAvatarPath && (!newAvatarPath || path.resolve(oldAvatarPath) !== path.resolve(newAvatarPath))) {
      await deleteConversationAvatarFileSafe(oldAvatarPath);
    }
    await deleteConversationAvatarVariantsByBase(base, file.filename);

    let result: any;
    try {
      result = await this.conversations.setConversationAvatar(req.user.sub, conversationId, avatarUrl);
    } catch (error) {
      await deleteConversationAvatarFileSafe(newAvatarPath);
      throw error;
    }
    for (const participantId of (current.participants ?? []).map((item: any) => item.userId ?? item.user?.id).filter(Boolean)) {
      this.events.emitConversationsSync(participantId, { conversationId, force: true });
    }
    if (current.userAId) this.events.emitConversationsSync(current.userAId, { conversationId, force: true });
    if (current.userBId) this.events.emitConversationsSync(current.userBId, { conversationId, force: true });
    return result;
  }

  @Delete(':id/avatar')
  async removeAvatar(@Req() req: any, @Param('id') conversationId: string) {
    const current = await this.conversations.assertCurrentParticipant(req.user.sub, conversationId);
    const result = await this.conversations.setConversationAvatar(req.user.sub, conversationId, null);
    await deleteConversationAvatarFileSafe(safeConversationAvatarPathFromUrl(current.avatarUrl));
    await deleteConversationAvatarVariantsByBase(
      conversationAvatarFileBase(conversationId, 'conversation'),
    );
    for (const participantId of (current.participants ?? []).map((item: any) => item.userId ?? item.user?.id).filter(Boolean)) {
      this.events.emitConversationsSync(participantId, { conversationId, force: true });
    }
    if (current.userAId) this.events.emitConversationsSync(current.userAId, { conversationId, force: true });
    if (current.userBId) this.events.emitConversationsSync(current.userBId, { conversationId, force: true });
    return result;
  }

  @Post(':id/participants')
  async addParticipants(
    @Req() req: any,
    @Param('id') conversationId: string,
    @Body()
    body: {
      userIds?: string[];
      automaticRules?: Array<{ companyId?: string | null; departmentId?: string | null }>;
      companyIds?: string[];
      departmentIds?: string[];
      includeAllUsers?: boolean;
    },
  ) {
    const result = await this.conversations.addGroupParticipants(
      req.user.sub,
      conversationId,
      body ?? {},
    );
    for (const participantId of result.participantIds ?? []) {
      this.events.emitConversationsSync(participantId, {
        conversationId,
        force: true,
      });
    }
    return result;
  }

  @Patch(':id/participants/:userId/admin')
  async setGroupAdmin(
    @Req() req: any,
    @Param('id') conversationId: string,
    @Param('userId') targetUserId: string,
    @Body() body: { value?: boolean },
  ) {
    const result = await this.conversations.setGroupAdmin(
      req.user.sub,
      conversationId,
      targetUserId,
      !!body?.value,
    );
    for (const participantId of result.participantIds ?? []) {
      this.events.emitConversationsSync(participantId, { conversationId, force: true });
    }
    return result;
  }

  @Delete(':id/participants/:userId')
  async removeParticipant(
    @Req() req: any,
    @Param('id') conversationId: string,
    @Param('userId') targetUserId: string,
  ) {
    const result = await this.conversations.removeGroupParticipant(req.user.sub, conversationId, targetUserId);
    for (const participantId of new Set([...(result.participantIds ?? []), result.removedUserId].filter(Boolean))) {
      this.events.emitConversationsSync(String(participantId), { conversationId, force: true });
    }
    return result;
  }

  @Post(':id/leave')
  async leaveGroup(@Req() req: any, @Param('id') conversationId: string) {
    const result = await this.conversations.leaveGroup(req.user.sub, conversationId);
    this.events.emitConversationsSync(req.user.sub, { conversationId, force: true });
    for (const participantId of result.remainingParticipantIds ?? []) {
      this.events.emitConversationsSync(participantId, {
        conversationId,
        force: true,
      });
    }
    return result;
  }

  @Delete(':id/group')
  async deleteGroup(@Req() req: any, @Param('id') conversationId: string) {
    const result = await this.conversations.deleteGroup(req.user.sub, conversationId);
    for (const participantId of result.participantIds ?? []) {
      this.events.emitConversationsSync(participantId, { conversationId, force: true });
    }
    return result;
  }

  @Patch(':id/read')
  async markAsRead(@Req() req: any, @Param('id') conversationId: string) {
    const userId = req.user.sub;
    return this.conversations.markAsRead(userId, conversationId);
  }

  @Patch(':id/pin')
  async setPinned(
    @Req() req: any,
    @Param('id') conversationId: string,
    @Body() body: { value?: boolean },
  ) {
    const userId = req.user.sub;
    const result = await this.conversations.setPinned(userId, conversationId, !!body?.value);
    this.events.emitConversationsSync(userId, { conversationId, force: true });
    return result;
  }

  @Delete(':id')
  async hideConversation(@Req() req: any, @Param('id') conversationId: string) {
    const userId = req.user.sub;
    const result = await this.conversations.hideConversation(userId, conversationId);
    this.events.emitConversationHidden(conversationId, { userId });
    this.events.emitConversationsSync(userId, { conversationId, force: true });
    return result;
  }
}

