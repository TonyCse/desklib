import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import {
  mondayOfIsoWeek,
  addDays,
  isoWeekKey,
  parseIsoDate,
} from '../bookings/domain/booking-rules.js';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/auth.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlanningQueryDto } from './dto/planning-query.dto.js';

const WEEK_DAYS = 5; // lundi à vendredi

@Controller('teams')
export class TeamsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Planning hebdomadaire d'une équipe : membres × jours ouvrés, avec poste et créneau.
   * Accès : les membres de l'équipe, et les admins. Le taux de présence est réservé aux managers.
   */
  @Get(':id/planning')
  async planning(
    @Param('id') teamId: string,
    @Query() query: PlanningQueryDto,
    @CurrentUser() viewer: AuthUser,
  ) {
    const isAdmin = viewer.role === 'ADMIN';
    if (!isAdmin && viewer.teamId !== teamId) {
      throw new ForbiddenException(
        'Vous ne pouvez consulter que le planning de votre équipe',
      );
    }

    const monday = mondayOfIsoWeek(query.week);
    if (!monday) throw new BadRequestException('Semaine invalide');
    const mondayDate = parseIsoDate(monday);
    const fridayDate = parseIsoDate(addDays(monday, WEEK_DAYS - 1));
    if (!mondayDate || !fridayDate)
      throw new BadRequestException('Semaine invalide');

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        color: true,
        users: {
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });
    if (!team) throw new BadRequestException('Équipe introuvable');

    const memberIds = team.users.map((u) => u.id);
    const slots = await this.prisma.bookingSlot.findMany({
      where: {
        userId: { in: memberIds },
        date: { gte: mondayDate, lte: fridayDate },
      },
      select: {
        userId: true,
        date: true,
        half: true,
        desk: { select: { label: true } },
      },
    });

    const days = Array.from({ length: WEEK_DAYS }, (_, i) =>
      addDays(monday, i),
    );
    const cell = new Map<string, { AM: string | null; PM: string | null }>();
    for (const slot of slots) {
      const key = `${slot.userId}:${slot.date.toISOString().slice(0, 10)}`;
      const entry = cell.get(key) ?? { AM: null, PM: null };
      entry[slot.half] = slot.desk.label;
      cell.set(key, entry);
    }

    const members = team.users.map((user) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
      days: days.map((day) => {
        const entry = cell.get(`${user.id}:${day}`) ?? { AM: null, PM: null };
        return { date: day, am: entry.AM, pm: entry.PM };
      }),
    }));

    // Présence : un salarié est présent un jour s'il a au moins un créneau ce jour-là.
    const presentDays = members.reduce(
      (total, m) =>
        total + m.days.filter((d) => d.am !== null || d.pm !== null).length,
      0,
    );
    const possibleDays = members.length * WEEK_DAYS;
    const canSeePresence = viewer.role === 'MANAGER' || viewer.role === 'ADMIN';

    return {
      week: isoWeekKey(monday),
      team: { id: team.id, name: team.name, color: team.color },
      days,
      members,
      presenceRate:
        canSeePresence && possibleDays > 0 ? presentDays / possibleDays : null,
    };
  }
}
