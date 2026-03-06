import {
  Body,
  Controller,
  Get,
  Put,
  Post,
  Req,
  UseGuards,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';

import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

function validatePassword(pw: string) {
  if (!pw || pw.length < 8) return 'Senha deve ter pelo menos 8 caracteres';
  return null;
}

function safeImageExt(original: string) {
  const ext = path.extname(original || '').toLowerCase();
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') return ext;
  return '.png';
}

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getMe(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) throw new BadRequestException('Usuário inválido');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        extension: true,
        avatarUrl: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        lastLoginAt: true,
        company: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    return { ok: true, user };
  }

  @Put('password')
  async updateMyPassword(@Req() req: any, @Body() body: { password: string }) {
    const me = req.user;
    const userId = me?.id || me?.sub;
    if (!userId) throw new BadRequestException('Usuário inválido');

    const password = String(body?.password ?? '');
    const pwErr = validatePassword(password);
    if (pwErr) throw new BadRequestException(pwErr);

    const passwordHash = await argon2.hash(password);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false, isActive: true },
    });

    return { ok: true };
  }

  @Put('profile')
  async updateMyProfile(
    @Req() req: any,
    @Body() body: { name?: string; email?: string | null; extension?: string | null },
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) throw new BadRequestException('Usuário inválido');

    const data: Record<string, unknown> = {};

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (name.length < 2) throw new BadRequestException('Nome inválido');
      data.name = name;
    }

    if (body.email !== undefined) {
      data.email = body.email ? String(body.email).trim() : null;
    }

    if (body.extension !== undefined) {
      data.extension = body.extension ? String(body.extension).trim() : null;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        extension: true,
        avatarUrl: true,
        company: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    return { ok: true, user };
  }

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: path.join(process.cwd(), 'public', 'uploads', 'avatars'),
        filename: (_req, file, cb) => {
          const ext = safeImageExt(file.originalname);
          cb(null, `avatar_${Date.now()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /image\/(png|jpeg|jpg|webp)/.test(file.mimetype);
        if (!ok) return cb(new BadRequestException('Envie PNG/JPG/WEBP'), false);
        cb(null, true);
      },
    }),
  )
  async uploadMyAvatar(@Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) throw new BadRequestException('Usuário inválido');
    if (!file) throw new BadRequestException('Arquivo não recebido');

    const avatarUrl = `/static/uploads/avatars/${file.filename}`;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        extension: true,
        avatarUrl: true,
      },
    });

    return { ok: true, avatarUrl, user };
  }
}
