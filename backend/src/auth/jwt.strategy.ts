import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { getOptionalJwtSecret } from '../common/security-config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getOptionalJwtSecret(config),
    });
  }

  async validate(payload: any) {
    if (payload?.type !== 'user') {
      throw new UnauthorizedException('Token inválido');
    }

    const userId = payload?.sub as string | undefined;
    if (!userId) throw new UnauthorizedException('Token inválido');

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
        companyId: true,
        departmentId: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Conta desativada');
    }

    return {
      type: 'user',
      sub: user.id,
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email ?? null,
      extension: user.extension ?? null,
      avatarUrl: user.avatarUrl ?? null,
      mustChangePassword: !!user.mustChangePassword,
      role: 'USER',
      companyId: user.companyId ?? null,
      departmentId: user.departmentId ?? null,
    };
  }
}
