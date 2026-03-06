import { Body, Controller, Get, Post, Req, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  listMine(@Req() req: any, @Query('q') q?: string) {
    return this.conversations.listMine(req.user.sub, q);
  }

  @Post('direct')
  getOrCreateDirect(@Req() req: any, @Body() body: { otherUserId: string }) {
    return this.conversations.getOrCreateDirect(req.user.sub, body.otherUserId);
  }
}
