import {
  Body,
  Controller,
  Put,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';

function validatePassword(pw: string) {
  if (!pw || pw.length < 8) {
    return 'Senha deve ter pelo menos 8 caracteres';
  }
  return null;
}

@Controller('admin/me')
@UseGuards(AdminJwtAuthGuard)
export class AdminMePasswordController {
  constructor(private readonly prisma: PrismaService) {}

  @Put('password')
  async updateMyPassword(
    @Req() req: any,
    @Body() body: { password: string },
  ) {
    const me = req.user;

    if (!me?.id) {
      throw new BadRequestException('Usuário inválido');
    }

    // ✅ SuperAdmin não usa este endpoint
    // (ele troca username+senha no /credentials)
    if (me.isSuperAdmin) {
      throw new ForbiddenException(
        'SuperAdmin deve alterar credenciais em /admin/me/credentials',
      );
    }

    const password = String(body?.password ?? '');
    const pwErr = validatePassword(password);

    if (pwErr) {
      throw new BadRequestException(pwErr);
    }

    const passwordHash = await argon2.hash(password);

    await this.prisma.adminAccount.update({
      where: { id: me.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      },
    });

    return { ok: true };
  }
}