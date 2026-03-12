import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminHistoryService } from './admin-history.service';

@Controller('admin/history')
@UseGuards(AdminJwtAuthGuard)
export class AdminHistoryController {
  constructor(private readonly svc: AdminHistoryService) {}

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
