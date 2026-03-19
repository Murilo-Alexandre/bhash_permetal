import {
  Delete,
  Body,
  Controller,
  Get,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { promises as fs } from 'fs';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AppConfigService } from './app-config.service';
import { UpdateAppConfigDto } from './dto/update-app-config.dto';
import { normalizeUploadedFileName } from '../common/upload-filename.util';

function safeExt(original: string) {
  const ext = path.extname(normalizeUploadedFileName(original) || '').toLowerCase();
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') return ext;
  return '.png';
}

function normalizeLogoFileName(input: string) {
  const decoded = decodeURIComponent(input || '').trim();
  const base = path.basename(decoded);
  if (!base || base !== decoded) {
    throw new BadRequestException('Nome de arquivo inválido');
  }

  if (!/^logo_[a-zA-Z0-9._-]+\.(png|jpg|jpeg|webp)$/i.test(base)) {
    throw new BadRequestException('Arquivo de logo inválido');
  }

  return base;
}

function logoFileNameFromUrl(url?: string | null) {
  if (!url) return null;
  const marker = '/static/uploads/';
  if (!url.startsWith(marker)) return null;
  try {
    return normalizeLogoFileName(url.slice(marker.length));
  } catch {
    return null;
  }
}

const LOGOS_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

@Controller('admin/app-config')
@UseGuards(AdminJwtAuthGuard)
export class AdminAppConfigController {
  constructor(private readonly appConfig: AppConfigService) {}

  @Put()
  update(@Body() body: UpdateAppConfigDto) {
    return this.appConfig.updateConfig({
      primaryColor: body.primaryColor,
      primaryTextColor: body.primaryTextColor,
      logoUrl: body.logoUrl,
    });
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: path.join(process.cwd(), 'public', 'uploads'),
        filename: (req, file, cb) => {
          const ext = safeExt(file.originalname);
          const name = `logo_${Date.now()}${ext}`;
          cb(null, name);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
      fileFilter: (req, file, cb) => {
        const ok = /image\/(png|jpeg|jpg|webp)/.test(file.mimetype);
        if (!ok) return cb(new BadRequestException('Envie PNG/JPG/WEBP'), false);
        cb(null, true);
      },
    }),
  )
  async uploadLogo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Arquivo não recebido (campo "file")');

    // vai ser servido em /static/uploads/...
    const url = `/static/uploads/${file.filename}`;

    const cfg = await this.appConfig.setLogoUrl(url);

    return {
      ok: true,
      logoUrl: url,
      config: cfg,
    };
  }

  @Get('logos')
  async listLogos() {
    await fs.mkdir(LOGOS_UPLOAD_DIR, { recursive: true });
    const entries = await fs.readdir(LOGOS_UPLOAD_DIR, { withFileTypes: true });
    const files = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          /^logo_[a-zA-Z0-9._-]+\.(png|jpg|jpeg|webp)$/i.test(entry.name),
      )
      .map((entry) => entry.name);

    const currentConfig = await this.appConfig.getPublicConfig();
    const currentFile = logoFileNameFromUrl(currentConfig.logoUrl ?? null);

    const withMeta = await Promise.all(
      files.map(async (name) => {
        const stat = await fs.stat(path.join(LOGOS_UPLOAD_DIR, name));
        return {
          name,
          url: `/static/uploads/${name}`,
          size: stat.size,
          updatedAt: stat.mtime.toISOString(),
          isCurrent: !!currentFile && currentFile === name,
        };
      }),
    );

    withMeta.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    return {
      ok: true,
      currentLogoUrl: currentConfig.logoUrl ?? null,
      items: withMeta,
    };
  }

  @Delete('logos/:fileName')
  async deleteLogo(@Param('fileName') fileName: string) {
    const safeName = normalizeLogoFileName(fileName);
    const absolute = path.join(LOGOS_UPLOAD_DIR, safeName);

    await fs.mkdir(LOGOS_UPLOAD_DIR, { recursive: true });

    try {
      await fs.access(absolute);
    } catch {
      throw new NotFoundException('Logo não encontrada');
    }

    await fs.unlink(absolute);

    const removedUrl = `/static/uploads/${safeName}`;
    const cfg = await this.appConfig.getPublicConfig();
    let updatedConfig: { id: string; primaryColor: string; logoUrl: string | null } | null = null;

    if (cfg.logoUrl === removedUrl) {
      updatedConfig = await this.appConfig.setLogoUrl(null);
    }

    return {
      ok: true,
      removedUrl,
      config: updatedConfig,
    };
  }
}
