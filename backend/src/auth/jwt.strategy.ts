import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
    });
  }

  async validate(payload: any) {
    // Só aceita token do CHAT
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
        isActive: true,
        mustChangePassword: true,
        // ✅ novos campos (precisam existir no Prisma)
        sector: true,
        company: true,
      } as any,
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Conta desativada');
    }

    // Isso vira req.user e é o que /auth/me retorna
    return {
      type: 'user',
      sub: user.id,
      id: user.id,
      username: user.username,
      name: user.name,
      mustChangePassword: !!user.mustChangePassword,
      role: 'USER',
      sector: (user as any).sector ?? null,
      company: (user as any).company ?? null,
    };
  }
}
