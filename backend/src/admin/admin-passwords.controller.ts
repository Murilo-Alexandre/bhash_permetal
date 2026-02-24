import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';

@Controller('admin/users')
@UseGuards(AdminJwtAuthGuard)
export class AdminPasswordsController {
  constructor(private readonly prisma: PrismaService) {}

  // ✅ Criar usuário do chat
  @Post()
  async createUser(
    @Body()
    body: {
      username: string;
      name: string;
      password: string;
      mustChangePassword?: boolean;
      sector?: string | null;
      company?: string | null;
    },
  ) {
    const username = (body?.username ?? '').trim();
    const name = (body?.name ?? '').trim(); // Nome Completo
    const password = String(body?.password ?? '');

    const sector = (body?.sector ?? '').toString().trim();
    const company = (body?.company ?? '').toString().trim();

    const mustChangePassword =
      typeof body?.mustChangePassword === 'boolean' ? body.mustChangePassword : true;

    if (!username || username.length < 3) throw new BadRequestException('Username inválido (mín. 3)');
    if (!name || name.length < 2) throw new BadRequestException('Nome inválido (mín. 2)');
    if (!password || password.length < 4) throw new BadRequestException('Senha inválida (mín. 4)');

    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw new BadRequestException('Username já existe');

    const passwordHash = await argon2.hash(password);

    const user = await this.prisma.user.create({
      data: {
        username,
        name,
        passwordHash,
        isActive: true,
        mustChangePassword,
        // ✅ novos campos (precisam existir no Prisma)
        sector: sector || null,
        company: company || null,
      } as any,
      select: {
        id: true,
        username: true,
        name: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        lastLoginAt: true,
        sector: true,
        company: true,
      } as any,
    });

    return { ok: true, user };
  }

  // ✅ Listar usuários (busca + paginação)
  @Get()
  async listUsers(
    @Query('q') q?: string,
    @Query('active') active?: string, // "true" | "false" | undefined
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const page = Math.max(1, Number(pageStr ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(pageSizeStr ?? 20) || 20));
    const skip = (page - 1) * pageSize;

    const qTrim = (q ?? '').trim();
    const where: any = {};

    if (qTrim) {
      where.OR = [
        { username: { contains: qTrim, mode: 'insensitive' } },
        { name: { contains: qTrim, mode: 'insensitive' } },
        { sector: { contains: qTrim, mode: 'insensitive' } },
        { company: { contains: qTrim, mode: 'insensitive' } },
      ];
    }

    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: pageSize,
        select: {
          id: true,
          username: true,
          name: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
          lastLoginAt: true,
          sector: true,
          company: true,
        } as any,
      }),
    ]);

    return {
      ok: true,
      page,
      pageSize,
      total,
      items,
    };
  }

  // ✅ Editar dados
  @Patch(':id')
  async updateUser(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      username: string;
      name: string;
      isActive: boolean;
      mustChangePassword: boolean;
      sector: string | null;
      company: string | null;
    }>,
  ) {
    if (!id) throw new BadRequestException('ID inválido');

    const data: any = {};

    if (typeof body.username === 'string') {
      const username = body.username.trim();
      if (!username || username.length < 3) throw new BadRequestException('Username inválido (mín. 3)');

      const exists = await this.prisma.user.findUnique({ where: { username } });
      if (exists && exists.id !== id) throw new BadRequestException('Esse username já está em uso');

      data.username = username;
    }

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name || name.length < 2) throw new BadRequestException('Nome inválido (mín. 2)');
      data.name = name;
    }

    if (body.sector !== undefined) data.sector = body.sector ? String(body.sector).trim() : null;
    if (body.company !== undefined) data.company = body.company ? String(body.company).trim() : null;

    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
    if (typeof body.mustChangePassword === 'boolean') data.mustChangePassword = body.mustChangePassword;

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        name: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        lastLoginAt: true,
        sector: true,
        company: true,
      } as any,
    });

    return { ok: true, user: updated };
  }

  // ✅ Alterar senha (não “lê” senha antiga; apenas define nova)
  @Put(':id/password')
  async setUserPassword(
    @Param('id') id: string,
    @Body() body: { password: string; mustChangePassword?: boolean },
  ) {
    if (!id) throw new BadRequestException('ID inválido');

    const password = String(body?.password ?? '');
    if (!password || password.length < 4) throw new BadRequestException('Senha inválida (mín. 4)');

    const passwordHash = await argon2.hash(password);

    const mustChangePassword =
      typeof body?.mustChangePassword === 'boolean' ? body.mustChangePassword : true;

    const updated = await this.prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword },
      select: {
        id: true,
        username: true,
        name: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        lastLoginAt: true,
        sector: true,
        company: true,
      } as any,
    });

    return { ok: true, user: updated };
  }

  // ✅ Excluir usuário (lixeira)
  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    if (!id) throw new BadRequestException('ID inválido');
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }
}