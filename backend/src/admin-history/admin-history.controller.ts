import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminHistoryService } from './admin-history.service';
import { AdminHistoryRetentionSchedulerService } from './admin-history-retention-scheduler.service';
import { ChatEventsService } from '../chat/chat-events.service';

@Controller('admin/history')
@UseGuards(AdminJwtAuthGuard)
export class AdminHistoryController {
  constructor(
    private readonly svc: AdminHistoryService,
    private readonly scheduler: AdminHistoryRetentionSchedulerService,
    private readonly events: ChatEventsService,
  ) {}

  // A) contatos (usuários do chat)
  @Get('contacts')
  listContacts(
    @Query('q') q?: string,
    @Query('companyId') companyId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    return this.svc.listContacts({ q, companyId, departmentId, pageStr, pageSizeStr });
  }

  // B) todos os chats do usuário selecionado
  @Get('users/:id/conversations')
  listUserConversations(@Param('id') userId: string) {
    if (!userId) throw new BadRequestException('userId inválido');
    return this.svc.listUserConversations(userId);
  }

  // C) mensagens (scroll + busca dentro da conversa)
  @Get('conversations/:id/messages')
  listConversationMessages(
    @Param('id') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    if (!conversationId) throw new BadRequestException('conversationId inválido');

    return this.svc.listConversationMessages({
      conversationId,
      cursor,
      take,
      from,
      to,
      q,
    });
  }

  @Get('conversations/:id/media')
  listConversationMedia(
    @Param('id') conversationId: string,
    @Query('kind') kind?: string,
    @Query('take') take?: string,
  ) {
    if (!conversationId) throw new BadRequestException('conversationId inválido');
    return this.svc.listConversationMedia({ conversationId, kind, take });
  }

  @Delete('messages/:id/attachment')
  async deleteMessageAttachment(@Param('id') messageId: string) {
    if (!messageId) throw new BadRequestException('messageId inválido');

    const result = await this.svc.deleteMessageAttachmentByAdmin(messageId);
    this.events.emitMessageUpdated(result.conversationId, result.message);
    for (const participantId of result.participantIds) {
      this.events.emitConversationsSync(participantId, {
        conversationId: result.conversationId,
        force: true,
      });
    }

    return { ok: true, message: result.message };
  }

  @Get('retention-policy')
  getRetentionPolicy() {
    return this.svc.getMediaRetentionPolicy();
  }

  @Put('retention-policy')
  async updateRetentionPolicy(
    @Body()
    body: {
      enabled?: boolean;
      interval?: string;
      intervalCount?: number | string;
      showToUsers?: boolean;
      runHour?: number | string;
      runMinute?: number | string;
    },
  ) {
    const parsedRunHour =
      body?.runHour === undefined || body?.runHour === null || body?.runHour === ''
        ? undefined
        : Number(body.runHour);
    const parsedRunMinute =
      body?.runMinute === undefined || body?.runMinute === null || body?.runMinute === ''
        ? undefined
        : Number(body.runMinute);
    const parsedIntervalCount =
      body?.intervalCount === undefined || body?.intervalCount === null || body?.intervalCount === ''
        ? undefined
        : Number(body.intervalCount);

    const updated = await this.svc.updateMediaRetentionPolicy({
      enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
      interval: body?.interval,
      intervalCount: parsedIntervalCount,
      showToUsers: typeof body?.showToUsers === 'boolean' ? body.showToUsers : undefined,
      runHour: parsedRunHour,
      runMinute: parsedRunMinute,
    });
    await this.scheduler.refresh('policy-update');
    return updated;
  }

  // ✅ NOVO: busca estilo WhatsApp dentro da conversa (lista ocorrências)
  @Get('conversations/:id/search')
  searchInConversation(
    @Param('id') conversationId: string,
    @Query('q') q?: string,
    @Query('take') take?: string,
  ) {
    if (!conversationId) throw new BadRequestException('conversationId inválido');
    return this.svc.searchInConversation({ conversationId, q, take });
  }

  // ✅ NOVO: abre conversa completa e já traz contexto em torno da msg âncora
  @Get('conversations/:id/messages/around')
  messagesAround(
    @Param('id') conversationId: string,
    @Query('messageId') messageId?: string,
    @Query('take') take?: string,
  ) {
    if (!conversationId) throw new BadRequestException('conversationId inválido');
    if (!messageId) throw new BadRequestException('messageId obrigatório');

    return this.svc.messagesAround({ conversationId, messageId, take });
  }

  // D) busca global (todas as conversas)
  @Get('search')
  globalSearch(
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('companyId') companyId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    return this.svc.globalSearch({ q, from, to, companyId, departmentId, pageStr, pageSizeStr });
  }
}
