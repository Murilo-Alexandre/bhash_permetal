import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from './auth/auth.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { AdminMeController } from './admin/admin-me.controller';

import { UsersModule } from './users/users.module';
import { AdminController } from './admin/admin.controller';

import { RolesGuard } from './auth/roles.guard';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { ChatModule } from './chat/chat.module';

import { AppConfigModule } from './app-config/app-config.module';
import { PrismaModule } from './prisma/prisma.module';

import { AdminMePasswordController } from './admin/admin-me-password.controller';
import { MeController } from './me/me.controller';
import { AdminOrgController } from './admin/admin-org.controller';
import { AdminUsersController } from './admin/admin-users.controller';
import { AdminHistoryModule } from './admin-history/admin-history.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    PrismaModule,

    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/static',
    }),

    AuthModule,
    AdminAuthModule,
    UsersModule,
    ConversationsModule,
    MessagesModule,
    ChatModule,
    AppConfigModule,
    AdminHistoryModule,
  ],
  controllers: [
    AppController,
    AdminController,
    AdminMeController,
    AdminUsersController,
    AdminOrgController,
    AdminMePasswordController,
    MeController,
  ],
  providers: [AppService, Reflector, RolesGuard],
})
export class AppModule {}
