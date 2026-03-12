import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MessagesService } from '../messages/messages.service';
import { ChatEventsService } from './chat-events.service';
import { parseCorsOrigins } from '../common/cors-origins';
import { getRequiredJwtSecret } from '../common/security-config';

@WebSocketGateway({
  cors: {
    origin: parseCorsOrigins(process.env.CORS_ORIGINS),
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly jwtSecret: string;
  private readonly onlineUserConnectionCount = new Map<string, number>();
  private readonly userLastLoginAt = new Map<string, string>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly messages: MessagesService,
    private readonly events: ChatEventsService,
  ) {
    this.jwtSecret = getRequiredJwtSecret(this.config);
  }

  afterInit(server: Server) {
    this.events.setServer(server);
  }

  private emitPresenceSnapshotToAdmin(client: Socket) {
    const onlineUserIds = [...this.onlineUserConnectionCount.entries()]
      .filter(([, count]) => count > 0)
      .map(([userId]) => userId);

    const lastLoginByUserId: Record<string, string> = {};
    for (const [userId, lastLoginAt] of this.userLastLoginAt.entries()) {
      lastLoginByUserId[userId] = lastLoginAt;
    }

    client.emit('presence:snapshot', { onlineUserIds, lastLoginByUserId });
  }

  private markUserOnline(userId: string) {
    const prev = this.onlineUserConnectionCount.get(userId) ?? 0;
    const next = prev + 1;
    this.onlineUserConnectionCount.set(userId, next);

    if (prev === 0) {
      const nowIso = new Date().toISOString();
      this.userLastLoginAt.set(userId, nowIso);
      this.server.to('admins').emit('presence:user', {
        userId,
        online: true,
        lastLoginAt: nowIso,
      });
    }
  }

  private markUserOffline(userId: string) {
    const prev = this.onlineUserConnectionCount.get(userId) ?? 0;
    if (prev <= 1) {
      this.onlineUserConnectionCount.delete(userId);
      this.server.to('admins').emit('presence:user', {
        userId,
        online: false,
        lastLoginAt: this.userLastLoginAt.get(userId) ?? null,
      });
      return;
    }

    this.onlineUserConnectionCount.set(userId, prev - 1);
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) throw new Error('missing token');

      const payload = await this.jwt.verifyAsync(token, { secret: this.jwtSecret });
      const type = payload?.type;

      if (type !== 'user' && type !== 'admin') throw new Error('invalid token type');

      const sub = payload?.sub as string;
      if (!sub) throw new Error('missing sub');

      client.data.authType = type;

      if (type === 'user') {
        client.data.userId = sub;
        client.join(`user:${sub}`);
        this.markUserOnline(sub);
        client.emit('connected', { ok: true, type: 'user', userId: sub });
        return;
      }

      client.data.adminId = sub;
      client.join(`admin:${sub}`);
      client.join('admins');
      this.emitPresenceSnapshotToAdmin(client);
      client.emit('connected', { ok: true, type: 'admin', adminId: sub });
    } catch (e: any) {
      client.emit('connected', { ok: false, reason: e?.message ?? 'unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data?.authType !== 'user') return;
    const userId = client.data?.userId as string | undefined;
    if (!userId) return;
    this.markUserOffline(userId);
  }

  @SubscribeMessage('conversation:join')
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    const authType = client.data.authType as string | undefined;
    if (!authType) return { ok: false, reason: 'unauthenticated' };
    if (!body?.conversationId) return { ok: false, reason: 'missing conversationId' };

    if (authType === 'user') {
      const userId = client.data.userId as string;
      await this.messages.list(userId, body.conversationId, undefined, '1');
      client.join(`conv:${body.conversationId}`);
      return { ok: true };
    }

    client.join(`conv:${body.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('message:send')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: string; body?: string; replyToId?: string | null },
  ) {
    const authType = client.data.authType as string | undefined;
    if (authType !== 'user') return { ok: false, reason: 'forbidden' };

    const userId = client.data.userId as string;
    if (!userId) return { ok: false, reason: 'unauthenticated' };
    if (!data?.conversationId) return { ok: false, reason: 'missing conversationId' };

    const body = (data.body ?? '').trim();
    if (!body) return { ok: false, reason: 'empty body' };

    const msg = await this.messages.send({
      userId,
      conversationId: data.conversationId,
      body,
      replyToId: data.replyToId ?? null,
    });

    this.events.emitMessageNew(data.conversationId, msg);
    const participantIds = await this.messages.getConversationParticipantIds(data.conversationId);
    for (const participantId of participantIds) {
      this.events.emitUserMessageNew(participantId, msg);
      this.events.emitConversationsSync(participantId, { conversationId: data.conversationId });
    }

    return { ok: true, id: msg.id };
  }
}
