import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Règles lisibles par tout utilisateur connecté (le front adapte le sélecteur de dates). */
@Controller('settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    const settings = await this.prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
      select: { maxAdvanceDays: true, weeklyQuota: true },
    });
    return settings;
  }
}
