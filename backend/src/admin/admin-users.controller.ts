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
export class AdminUsersController {
  constructor(private readonly prisma: PrismaService) {}

  // =========================
  // CREATE
  // =========================
  @Post()
  async createUser(
    @Body()
    body: {
      username: string;
      name: string;
      password: string;
      mustChangePassword?: boolean;

      // ✅ novos
      email?: string | null;
      extension?: string | null;

      companyId?: string | null;
      departmentId?: string | null;
    },
  ) {
    const username = (body?.username ?? '').trim();
    const name = (body?.name ?? '').trim();
    const password = String(body?.password ?? '');

    const mustChangePassword =
      typeof body?.mustChangePassword === 'boolean' ? body.mustChangePassword : true;

    const companyId = body?.companyId ? String(body.companyId).trim() : null;
    const departmentId = body?.departmentId ? String(body.departmentId).trim() : null;

    // ✅ email/ramal
    const email = body?.email ? String(body.email).trim() : null;
    const extension = body?.extension ? String(body.extension).trim() : null;

    if (!username || username.length < 3) throw new BadRequestException('Username inválido (mín. 3)');
    if (!name || name.length < 2) throw new BadRequestException('Nome inválido (mín. 2)');
    if (!password || password.length < 4) throw new BadRequestException('Senha inválida (mín. 4)');

    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw new BadRequestException('Username já existe');

    // valida IDs (se vierem)
    if (companyId) {
      const c = await this.prisma.company.findUnique({ where: { id: companyId } });
      if (!c) throw new BadRequestException('companyId inválido');
    }
    if (departmentId) {
      const d = await this.prisma.department.findUnique({ where: { id: departmentId } });
      if (!d) throw new BadRequestException('departmentId inválido');
    }

    const passwordHash = await argon2.hash(password);

    const user = await this.prisma.user.create({
      data: {
        username,
        name,
        passwordHash,
        isActive: true,
        mustChangePassword,
        companyId,
        departmentId,

        // ✅ grava email/ramal
        email,
        extension,
      } as any,
      select: {
        id: true,
        username: true,
        name: true,

        // ✅ retorna email/ramal
        email: true,
        extension: true,

        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        lastLoginAt: true,
        companyId: true,
        departmentId: true,
        company: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      } as any,
    });

    return { ok: true, user };
  }

  // =========================
  // LIST (busca + paginação + filtros)
  // =========================
  @Get()
  async listUsers(
    @Query('q') q?: string,
    @Query('active') active?: string, // "true" | "false" | undefined
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,

    // ✅ filtros
    @Query('companyId') companyId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const page = Math.max(1, Number(pageStr ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(pageSizeStr ?? 20) || 20));
    const skip = (page - 1) * pageSize;

    const qTrim = (q ?? '').trim();
    const companyIdTrim = (companyId ?? '').trim();
    const departmentIdTrim = (departmentId ?? '').trim();

    const and: any[] = [];

    if (companyIdTrim) and.push({ companyId: companyIdTrim });
    if (departmentIdTrim) and.push({ departmentId: departmentIdTrim });

    if (active === 'true') and.push({ isActive: true });
    if (active === 'false') and.push({ isActive: false });

    const where: any = {};
    if (and.length) where.AND = and;

    if (qTrim) {
      // ✅ inclui email/ramal na busca também
      where.OR = [
        { username: { contains: qTrim, mode: 'insensitive' } },
        { name: { contains: qTrim, mode: 'insensitive' } },
        { email: { contains: qTrim, mode: 'insensitive' } },
        { extension: { contains: qTrim, mode: 'insensitive' } },
      ];
    }

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

          // ✅ retorna email/ramal
          email: true,
          extension: true,

          isActive: true,
          mustChangePassword: true,
          createdAt: true,
          lastLoginAt: true,
          companyId: true,
          departmentId: true,
          company: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
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

  // =========================
  // UPDATE (dados)
  // =========================
  @Patch(':id')
  async updateUser(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      username: string;
      name: string;

      // ✅ novos
      email: string | null;
      extension: string | null;

      isActive: boolean;
      mustChangePassword: boolean;
      companyId: string | null;
      departmentId: string | null;
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

    // ✅ salva email/ramal
    if (body.email !== undefined) {
      const v = body.email ? String(body.email).trim() : null;
      data.email = v;
    }
    if (body.extension !== undefined) {
      const v = body.extension ? String(body.extension).trim() : null;
      data.extension = v;
    }

    if (body.companyId !== undefined) {
      const v = body.companyId ? String(body.companyId).trim() : null;
      if (v) {
        const c = await this.prisma.company.findUnique({ where: { id: v } });
        if (!c) throw new BadRequestException('companyId inválido');
      }
      data.companyId = v;
    }

    if (body.departmentId !== undefined) {
      const v = body.departmentId ? String(body.departmentId).trim() : null;
      if (v) {
        const d = await this.prisma.department.findUnique({ where: { id: v } });
        if (!d) throw new BadRequestException('departmentId inválido');
      }
      data.departmentId = v;
    }

    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
    if (typeof body.mustChangePassword === 'boolean') data.mustChangePassword = body.mustChangePassword;

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        name: true,

        // ✅ retorna email/ramal
        email: true,
        extension: true,

        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        lastLoginAt: true,
        companyId: true,
        departmentId: true,
        company: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      } as any,
    });

    return { ok: true, user: updated };
  }

  // =========================
  // SET PASSWORD
  // =========================
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

        email: true,
        extension: true,

        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        lastLoginAt: true,
        companyId: true,
        departmentId: true,
        company: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      } as any,
    });

    return { ok: true, user: updated };
  }

  // =========================
  // DELETE
  // =========================
  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    if (!id) throw new BadRequestException('ID inválido');
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }
}