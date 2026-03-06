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

  emitMessageDeleted(conversationId: string, payload: { id: string; deletedAt: string }) {
    this.server?.to(`conv:${conversationId}`).emit('message:deleted', payload);
  }
}
