import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';

function normName(v: any) {
  return String(v ?? '').trim().replace(/\s+/g, ' ');
}

@Controller('admin/org')
@UseGuards(AdminJwtAuthGuard)
export class AdminOrgController {
  constructor(private readonly prisma: PrismaService) {}

  // =========================
  // Companies
  // =========================

  @Get('companies')
  async listCompanies(@Query('q') q?: string) {
    const qTrim = (q ?? '').trim();

    const where: any = {};
    if (qTrim) where.name = { contains: qTrim, mode: 'insensitive' };

    const items = await this.prisma.company.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, createdAt: true },
    });

    return { ok: true, items };
  }

  @Post('companies')
  async createCompany(@Body() body: { name: string }) {
    const name = normName(body?.name);

    if (!name || name.length < 2) {
      throw new BadRequestException('Nome da empresa inválido (mín. 2)');
    }

    // unique
    const exists = await this.prisma.company.findUnique({ where: { name } });
    if (exists) throw new BadRequestException('Empresa já existe');

    const created = await this.prisma.company.create({
      data: { name },
      select: { id: true, name: true, createdAt: true },
    });

    return { ok: true, company: created };
  }

  @Patch('companies/:id')
  async updateCompany(@Param('id') id: string, @Body() body: { name?: string }) {
    if (!id) throw new BadRequestException('ID inválido');

    const name = normName(body?.name);
    if (!name || name.length < 2) throw new BadRequestException('Nome da empresa inválido (mín. 2)');

    const exists = await this.prisma.company.findUnique({ where: { name } });
    if (exists && exists.id !== id) throw new BadRequestException('Já existe uma empresa com esse nome');

    const updated = await this.prisma.company.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, createdAt: true },
    });

    return { ok: true, company: updated };
  }

  @Delete('companies/:id')
  async deleteCompany(@Param('id') id: string) {
    if (!id) throw new BadRequestException('ID inválido');

    // Se tiver usuários apontando pra essa empresa, bloqueia (pra não “quebrar” user)
    const count = await this.prisma.user.count({ where: { companyId: id } });
    if (count > 0) {
      throw new BadRequestException('Não é possível excluir: existem usuários vinculados a essa empresa');
    }

    await this.prisma.company.delete({ where: { id } });
    return { ok: true };
  }

  // =========================
  // Departments
  // =========================

  @Get('departments')
  async listDepartments(@Query('q') q?: string) {
    const qTrim = (q ?? '').trim();

    const where: any = {};
    if (qTrim) where.name = { contains: qTrim, mode: 'insensitive' };

    const items = await this.prisma.department.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, createdAt: true },
    });

    return { ok: true, items };
  }

  @Post('departments')
  async createDepartment(@Body() body: { name: string }) {
    const name = normName(body?.name);

    if (!name || name.length < 2) {
      throw new BadRequestException('Nome do setor inválido (mín. 2)');
    }

    const exists = await this.prisma.department.findUnique({ where: { name } });
    if (exists) throw new BadRequestException('Setor já existe');

    const created = await this.prisma.department.create({
      data: { name },
      select: { id: true, name: true, createdAt: true },
    });

    return { ok: true, department: created };
  }

  @Patch('departments/:id')
  async updateDepartment(@Param('id') id: string, @Body() body: { name?: string }) {
    if (!id) throw new BadRequestException('ID inválido');

    const name = normName(body?.name);
    if (!name || name.length < 2) throw new BadRequestException('Nome do setor inválido (mín. 2)');

    const exists = await this.prisma.department.findUnique({ where: { name } });
    if (exists && exists.id !== id) throw new BadRequestException('Já existe um setor com esse nome');

    const updated = await this.prisma.department.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, createdAt: true },
    });

    return { ok: true, department: updated };
  }

  @Delete('departments/:id')
  async deleteDepartment(@Param('id') id: string) {
    if (!id) throw new BadRequestException('ID inválido');

    const count = await this.prisma.user.count({ where: { departmentId: id } });
    if (count > 0) {
      throw new BadRequestException('Não é possível excluir: existem usuários vinculados a esse setor');
    }

    await this.prisma.department.delete({ where: { id } });
    return { ok: true };
  }
}
