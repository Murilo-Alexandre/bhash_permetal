// C:\dev\bhash\backend\src\users\users.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(input: { username: string; name: string; password: string }) {
    const username = (input.username ?? '').trim();
    const name = (input.name ?? '').trim();
    const password = input.password ?? '';

    if (!username || username.length < 3) throw new BadRequestException('username inválido');
    if (!name) throw new BadRequestException('name inválido');
    if (!password || password.length < 6) throw new BadRequestException('password muito curta (mín 6)');

    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw new BadRequestException('username já existe');

    const passwordHash = await argon2.hash(password);

    const user = await this.prisma.user.create({
      data: {
        username,
        name,
        passwordHash,
        isActive: true,
      },
      select: { id: true, username: true, name: true, isActive: true, createdAt: true },
    });

    return user;
  }

  // ✅ NOVO: lista ativos excluindo o próprio usuário
  async listActiveExcluding(myId: string) {
    const id = (myId ?? '').trim();
    if (!id) throw new BadRequestException('myId inválido');

    return this.prisma.user.findMany({
      where: { isActive: true, NOT: { id } },
      orderBy: { name: 'asc' },
      select: { id: true, username: true, name: true, isActive: true },
    });
  }
}
