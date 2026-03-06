import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MessagesService } from '../messages/messages.service';
import { ChatEventsService } from './chat-events.service';

function parseOrigins(v?: string) {
  return (v ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

@WebSocketGateway({
  cors: {
    origin: parseOrigins(process.env.CORS_ORIGINS),
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  private readonly jwtSecret: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly messages: MessagesService,
    private readonly events: ChatEventsService,
  ) {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET não definido no .env');
    this.jwtSecret = secret;
  }

  afterInit(server: Server) {
    this.events.setServer(server);
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
        client.emit('connected', { ok: true, type: 'user', userId: sub });
        return;
      }

      client.data.adminId = sub;
      client.join(`admin:${sub}`);
      client.emit('connected', { ok: true, type: 'admin', adminId: sub });
    } catch (e: any) {
      client.emit('connected', { ok: false, reason: e?.message ?? 'unauthorized' });
      client.disconnect(true);
    }
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

    return { ok: true, id: msg.id };
  }
}
