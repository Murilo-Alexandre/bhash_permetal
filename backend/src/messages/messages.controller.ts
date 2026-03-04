// C:\dev\bhash\backend\src\messages\messages.controller.ts
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesService } from './messages.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversations/:id/messages')
  list(
    @Req() req: any,
    @Param('id') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string
  ) {
    return this.messages.list(req.user.sub, conversationId, cursor, take);
  }

  // ✅ NOVO: contexto ao redor de uma mensagem (para “Abrir conversa completa” + scroll)
  @Get('conversations/:id/messages/around')
  around(
    @Req() req: any,
    @Param('id') conversationId: string,
    @Query('messageId') messageId?: string,
    @Query('take') take?: string,
  ) {
    if (!messageId) throw new BadRequestException('messageId obrigatório');
    return this.messages.around(req.user.sub, conversationId, messageId, take);
  }

  @Post('conversations/:id/messages')
  send(@Req() req: any, @Param('id') conversationId: string, @Body() body: { body: string }) {
    return this.messages.send(req.user.sub, conversationId, body.body);
  }
}
