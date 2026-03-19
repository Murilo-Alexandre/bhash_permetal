import {
  Body,
  Controller,
  Delete,
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
import * as fs from 'fs';
import { promises as fsp } from 'fs';

import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { normalizeUploadedFileName } from '../common/upload-filename.util';

function validatePassword(pw: string) {
  if (!pw || pw.length < 8) return 'Senha deve ter pelo menos 8 caracteres';
  return null;
}

function safeImageExt(original: string) {
  const ext = path.extname(normalizeUploadedFileName(original) || '').toLowerCase();
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') return ext;
  return '.png';
}

function avatarSlug(value?: string | null) {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'user';
}

function avatarFileBase(username?: string | null) {
  return `${avatarSlug(username)}_avatar`;
}

function avatarUploadsDir() {
  return path.join(process.cwd(), 'public', 'uploads', 'avatars');
}

function safeAvatarPathFromUrl(raw?: string | null) {
  const value = String(raw ?? '').trim();
  if (!value.startsWith('/static/uploads/avatars/')) return null;
  const filename = value.slice('/static/uploads/avatars/'.length).replace(/\\/g, '/');
  const normalized = path.posix.normalize(filename);
  if (!normalized || normalized === '.' || normalized.startsWith('..')) return null;
  return path.join(avatarUploadsDir(), normalized);
}

async function deleteFileSafe(filePath?: string | null) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      throw err;
    }
  }
}

async function deleteAvatarVariantsByBase(base: string, keepFilename?: string) {
  const dir = avatarUploadsDir();
  let files: string[] = [];
  try {
    files = await fsp.readdir(dir);
  } catch (err: any) {
    if (err?.code === 'ENOENT') return;
    throw err;
  }

  const keep = String(keepFilename ?? '').toLowerCase();
  const allowedExt = new Set(['.png', '.jpg', '.jpeg', '.webp']);

  await Promise.all(
    files
      .filter((name) => {
        if (!name.toLowerCase().startsWith(base.toLowerCase())) return false;
        const ext = path.extname(name).toLowerCase();
        if (!allowedExt.has(ext)) return false;
        if (keep && name.toLowerCase() === keep) return false;
        return true;
      })
      .map((name) => deleteFileSafe(path.join(dir, name))),
  );
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
        destination: (_req, _file, cb) => {
          const dir = avatarUploadsDir();
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req: any, file, cb) => {
          const ext = safeImageExt(file.originalname);
          const base = avatarFileBase(req?.user?.username ?? req?.user?.id ?? 'user');
          cb(null, `${base}${ext}`);
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

    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (!current) throw new BadRequestException('Usuário não encontrado');

    const avatarUrl = `/static/uploads/avatars/${file.filename}`;
    const oldAvatarPath = safeAvatarPathFromUrl(current.avatarUrl);
    const newAvatarPath = safeAvatarPathFromUrl(avatarUrl);
    const base = avatarFileBase(current.username);

    if (oldAvatarPath && (!newAvatarPath || path.resolve(oldAvatarPath) !== path.resolve(newAvatarPath))) {
      await deleteFileSafe(oldAvatarPath);
    }
    await deleteAvatarVariantsByBase(base, file.filename);

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

  @Delete('avatar')
  async removeMyAvatar(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) throw new BadRequestException('Usuário inválido');

    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
      },
    });
    if (!current) throw new BadRequestException('Usuário não encontrado');

    await deleteFileSafe(safeAvatarPathFromUrl(current.avatarUrl));
    await deleteAvatarVariantsByBase(avatarFileBase(current.username));

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        extension: true,
        avatarUrl: true,
      },
    });

    return { ok: true, user };
  }
}
