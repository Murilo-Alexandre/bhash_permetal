import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AppConfigShape = {
  id: string;
  primaryColor: string;
  primaryTextColor: string;
  logoUrl: string | null;
};

@Injectable()
export class AppConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicConfig(): Promise<Pick<AppConfigShape, 'primaryColor' | 'primaryTextColor' | 'logoUrl'>> {
    const cfg = await this.prisma.appConfig.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' }, // usa defaults do schema
      select: { primaryColor: true, primaryTextColor: true, logoUrl: true },
    });

    return cfg;
  }

  async updateConfig(input: { primaryColor?: string; primaryTextColor?: string; logoUrl?: string | null }) {
    const data: any = {};
    if (typeof input.primaryColor === 'string' && input.primaryColor.trim()) {
      data.primaryColor = input.primaryColor.trim();
    }
    if (typeof input.primaryTextColor === 'string' && input.primaryTextColor.trim()) {
      data.primaryTextColor = input.primaryTextColor.trim();
    }
    if (input.logoUrl !== undefined) {
      data.logoUrl = input.logoUrl;
    }

    const cfg = await this.prisma.appConfig.upsert({
      where: { id: 'default' },
      update: data,
      create: {
        id: 'default',
        ...(data.primaryColor ? { primaryColor: data.primaryColor } : {}),
        ...(data.primaryTextColor ? { primaryTextColor: data.primaryTextColor } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      },
      select: { id: true, primaryColor: true, primaryTextColor: true, logoUrl: true },
    });

    return cfg;
  }

  async setLogoUrl(url: string | null) {
    return this.updateConfig({ logoUrl: url });
  }
}
