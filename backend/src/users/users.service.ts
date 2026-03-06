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
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        extension: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
      },
    });

    return user;
  }

  async listActiveExcluding(
    myId: string,
    filters?: { q?: string; companyId?: string; departmentId?: string },
  ) {
    const id = (myId ?? '').trim();
    if (!id) throw new BadRequestException('myId inválido');

    const q = (filters?.q ?? '').trim();
    const companyId = (filters?.companyId ?? '').trim();
    const departmentId = (filters?.departmentId ?? '').trim();

    const and: any[] = [{ isActive: true }, { NOT: { id } }];

    if (companyId) and.push({ companyId });
    if (departmentId) and.push({ departmentId });

    const where: any = { AND: and };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { extension: { contains: q, mode: 'insensitive' } },
        { company: { name: { contains: q, mode: 'insensitive' } } },
        { department: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const items = await this.prisma.user.findMany({
      where,
      orderBy: [{ company: { name: 'asc' } }, { department: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        extension: true,
        avatarUrl: true,
        isActive: true,
        company: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    return { ok: true, items };
  }

  async getProfile(myId: string, targetUserId: string) {
    if (!myId?.trim()) throw new BadRequestException('myId inválido');
    if (!targetUserId?.trim()) throw new BadRequestException('targetUserId inválido');

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        extension: true,
        avatarUrl: true,
        company: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) throw new BadRequestException('Usuário não encontrado');

    return { ok: true, user };
  }
}
