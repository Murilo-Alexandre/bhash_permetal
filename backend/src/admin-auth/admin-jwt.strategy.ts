import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { getOptionalJwtSecret } from '../common/security-config';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getOptionalJwtSecret(config),
    });
  }

  async validate(payload: any) {
    // ✅ Só aceita token de ADMIN
    if (payload?.type !== 'admin') {
      throw new UnauthorizedException('Token inválido');
    }

    const id = payload?.sub;
    if (!id) throw new UnauthorizedException('Token inválido');

    const admin = await this.prisma.adminAccount.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        name: true,
        isActive: true,
        isSuperAdmin: true,
        mustChangeCredentials: true,
        mustChangePassword: true,
      },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Conta desativada');
    }

    // req.user vira esse objeto
    return { type: 'admin', ...admin };
  }
}
