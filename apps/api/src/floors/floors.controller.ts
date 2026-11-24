import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import type { Half } from '@ilot/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseIsoDate } from '../bookings/domain/booking-rules.js';
import { AvailabilityQueryDto } from './dto/availability-query.dto.js';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/auth.decorators.js';

type HalfState =
  | { status: 'FREE' }
  | { status: 'MINE'; holder: string }
  | { status: 'BOOKED'; holder: string };

@Controller('floors')
export class FloorsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const floors = await this.prisma.floor.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        _count: { select: { desks: { where: { isActive: true } } } },
      },
    });
    return floors.map((f) => ({
      id: f.id,
      name: f.name,
      deskCount: f._count.desks,
    }));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const floor = await this.prisma.floor.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        width: true,
        height: true,
        zones: true,
        desks: {
          orderBy: { label: 'asc' },
          select: {
            id: true,
            label: true,
            x: true,
            y: true,
            width: true,
            height: true,
            features: true,
            isActive: true,
            reservedTeam: { select: { id: true, name: true, color: true } },
          },
        },
      },
    });
    if (!floor) throw new NotFoundException('Étage introuvable');
    return floor;
  }

  /**
   * État de chaque poste pour une date donnée, du point de vue de l'utilisateur connecté.
   * Le nom du titulaire est renvoyé pour l'info-bulle ; aucune donnée sensible n'est exposée.
   */
  @Get(':id/availability')
  async availability(
    @Param('id') id: string,
    @Query() query: AvailabilityQueryDto,
    @CurrentUser() viewer: AuthUser,
  ) {
    const date = parseIsoDate(query.date);
    if (!date) throw new NotFoundException('Date invalide');

    const floor = await this.prisma.floor.findUnique({
      where: { id },
      select: {
        id: true,
        desks: {
          orderBy: { label: 'asc' },
          select: {
            id: true,
            label: true,
            features: true,
            isActive: true,
            reservedTeam: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!floor) throw new NotFoundException('Étage introuvable');

    const slots = await this.prisma.bookingSlot.findMany({
      where: { date, desk: { floorId: id } },
      select: {
        deskId: true,
        half: true,
        userId: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    const byDeskHalf = new Map<string, (typeof slots)[number]>();
    for (const slot of slots)
      byDeskHalf.set(`${slot.deskId}:${slot.half}`, slot);

    const halfState = (deskId: string, half: Half): HalfState => {
      const slot = byDeskHalf.get(`${deskId}:${half}`);
      if (!slot) return { status: 'FREE' };
      const holder = `${slot.user.firstName} ${slot.user.lastName}`;
      return slot.userId === viewer.id
        ? { status: 'MINE', holder }
        : { status: 'BOOKED', holder };
    };

    // Demi-journées déjà prises par le visiteur ce jour-là, tous étages confondus.
    const mine = await this.prisma.bookingSlot.findMany({
      where: { userId: viewer.id, date },
      select: { half: true },
    });
    const viewerHalves = {
      AM: mine.some((s) => s.half === 'AM'),
      PM: mine.some((s) => s.half === 'PM'),
    };

    return {
      date: query.date,
      viewer: viewerHalves,
      desks: floor.desks.map((desk) => ({
        id: desk.id,
        label: desk.label,
        features: desk.features,
        isActive: desk.isActive,
        reservedTeam: desk.reservedTeam,
        // "Réservé à une autre équipe" : le poste est réservé et le viewer n'en est pas membre.
        reservedForOtherTeam:
          desk.reservedTeam !== null && desk.reservedTeam.id !== viewer.teamId,
        halves: {
          AM: halfState(desk.id, 'AM'),
          PM: halfState(desk.id, 'PM'),
        },
      })),
    };
  }
}
