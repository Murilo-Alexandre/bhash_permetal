import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class ChatEventsService {
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  emitMessageNew(conversationId: string, message: unknown) {
    this.server?.to(`conv:${conversationId}`).emit('message:new', message);
  }

  emitMessageUpdated(conversationId: string, message: unknown) {
    this.server?.to(`conv:${conversationId}`).emit('message:updated', message);
  }

  emitMessageHidden(conversationId: string, payload: { messageId: string; userId: string }) {
    this.server?.to(`user:${payload.userId}`).emit('message:hidden', {
      conversationId,
      messageId: payload.messageId,
    });
  }

  emitMessagesHidden(conversationId: string, payload: { messageIds: string[]; userId: string }) {
    this.server?.to(`user:${payload.userId}`).emit('messages:hidden', {
      conversationId,
      messageIds: payload.messageIds,
    });
  }

  emitConversationCleared(conversationId: string, payload: { userId: string }) {
    this.server?.to(`user:${payload.userId}`).emit('conversation:cleared', { conversationId });
  }

  emitConversationHidden(conversationId: string, payload: { userId: string }) {
    this.server?.to(`user:${payload.userId}`).emit('conversation:hidden', { conversationId });
  }

  emitConversationsSync(userId: string) {
    this.server?.to(`user:${userId}`).emit('conversations:sync', { ok: true });
  }

  emitMessageDeleted(conversationId: string, payload: { id: string; deletedAt: string }) {
    this.server?.to(`conv:${conversationId}`).emit('message:deleted', payload);
  }
}
