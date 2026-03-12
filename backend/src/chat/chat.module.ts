import { Global, Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatEventsService } from './chat-events.service';
import { getOptionalJwtSecret } from '../common/security-config';

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: getOptionalJwtSecret(cfg),
      }),
    }),
  ],
  providers: [ChatGateway, ChatEventsService, MessagesService, PrismaService],
  exports: [ChatEventsService],
})
export class ChatModule {}
