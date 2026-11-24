import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../common/decorators/auth.decorators.js';
import {
  parseIsoDate,
  isWeekend,
  addDays,
} from '../bookings/domain/booking-rules.js';
import {
  AuditQueryDto,
  CreateDeskDto,
  CreateVehicleDto,
  UpdateVehicleDto,
  RangeQueryDto,
  UpdateDeskDto,
  UpdateSettingsDto,
  UpdateUserDto,
} from './dto/admin.dto.js';

const MAX_STATS_RANGE_DAYS = 90;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ----- Postes -------------------------------------------------------------

  listDesks() {
    return this.prisma.desk.findMany({
      orderBy: [{ floor: { name: 'asc' } }, { label: 'asc' }],
      select: {
        id: true,
        label: true,
        x: true,
        y: true,
        width: true,
        height: true,
        features: true,
        isActive: true,
        reservedTeamId: true,
        floor: { select: { id: true, name: true } },
        reservedTeam: { select: { id: true, name: true } },
      },
    });
  }

  async createDesk(actor: AuthUser, dto: CreateDeskDto) {
    await this.assertFloorAndTeam(dto.floorId, dto.reservedTeamId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const desk = await tx.desk.create({
          data: dto,
          select: { id: true, label: true },
        });
        await this.audit.record(
          {
            actorId: actor.id,
            action: 'DESK_CREATED',
            entityType: 'Desk',
            entityId: desk.id,
            payload: { ...dto },
          },
          tx,
        );
        return desk;
      });
    } catch (error) {
      throw toLabelConflict(error);
    }
  }

  async updateDesk(actor: AuthUser, id: string, dto: UpdateDeskDto) {
    const before = await this.prisma.desk.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Poste introuvable');
    if (dto.reservedTeamId !== undefined)
      await this.assertFloorAndTeam(null, dto.reservedTeamId);

    const data: Prisma.DeskUpdateInput = { ...dto };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const after = await tx.desk.update({ where: { id }, data });
        await this.audit.record(
          {
            actorId: actor.id,
            action: 'DESK_UPDATED',
            entityType: 'Desk',
            entityId: id,
            payload: { before: pick(before, dto), after: pick(after, dto) },
          },
          tx,
        );
        return { id: after.id };
      });
    } catch (error) {
      throw toLabelConflict(error);
    }
  }

  // ----- Règles -------------------------------------------------------------

  getSettings() {
    return this.prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
      select: { maxAdvanceDays: true, weeklyQuota: true },
    });
  }

  async updateSettings(actor: AuthUser, dto: UpdateSettingsDto) {
    const before = await this.getSettings();
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.settings.update({
        where: { id: 1 },
        data: dto,
        select: { maxAdvanceDays: true, weeklyQuota: true },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'SETTINGS_UPDATED',
          entityType: 'Settings',
          entityId: '1',
          payload: { before, after },
        },
        tx,
      );
      return after;
    });
  }

  // ----- Utilisateurs -------------------------------------------------------

  listUsers() {
    return this.prisma.user.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        teamId: true,
        team: { select: { name: true, color: true } },
      },
    });
  }

  listTeams() {
    return this.prisma.team.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true },
    });
  }

  async updateUser(actor: AuthUser, id: string, dto: UpdateUserDto) {
    if (id === actor.id && dto.role !== undefined && dto.role !== actor.role) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier votre propre rôle',
      );
    }
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, teamId: true },
    });
    if (!before) throw new NotFoundException('Utilisateur introuvable');
    if (dto.teamId) await this.assertFloorAndTeam(null, dto.teamId);

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.user.update({
        where: { id },
        data: { role: dto.role, teamId: dto.teamId },
        select: { id: true, role: true, teamId: true },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'USER_UPDATED',
          entityType: 'User',
          entityId: id,
          payload: { before, after },
        },
        tx,
      );
      return after;
    });
  }

  // ----- Statistiques -------------------------------------------------------

  /**
   * Taux d'occupation par jour et par étage (demi-journées occupées / demi-journées disponibles),
   * et classement des postes par nombre de demi-journées réservées sur la période.
   */
  async stats(query: RangeQueryDto) {
    const from = parseIsoDate(query.from);
    const to = parseIsoDate(query.to);
    if (!from || !to || query.from > query.to) {
      throw new BadRequestException('Période invalide');
    }
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (days > MAX_STATS_RANGE_DAYS) {
      throw new BadRequestException(
        `Période limitée à ${MAX_STATS_RANGE_DAYS} jours`,
      );
    }
    const workdays: string[] = [];
    for (let i = 0; i < days; i++) {
      const iso = addDays(query.from, i);
      if (!isWeekend(iso)) workdays.push(iso);
    }

    const [floors, desks, grouped] = await Promise.all([
      this.prisma.floor.findMany({ select: { id: true, name: true } }),
      this.prisma.desk.findMany({
        select: { id: true, label: true, floorId: true, isActive: true },
      }),
      this.prisma.bookingSlot.groupBy({
        by: ['deskId', 'date'],
        where: { date: { gte: from, lte: to } },
        _count: { _all: true },
      }),
    ]);

    const activeByFloor = new Map<string, number>();
    for (const desk of desks) {
      if (desk.isActive)
        activeByFloor.set(
          desk.floorId,
          (activeByFloor.get(desk.floorId) ?? 0) + 1,
        );
    }
    const floorOfDesk = new Map(desks.map((d) => [d.id, d.floorId]));

    // Demi-journées occupées, par jour et par étage, et par poste.
    const occupiedByDayFloor = new Map<string, number>();
    const occupiedByDesk = new Map<string, number>();
    for (const row of grouped) {
      const day = row.date.toISOString().slice(0, 10);
      const floorId = floorOfDesk.get(row.deskId);
      if (floorId) {
        const key = `${day}|${floorId}`;
        occupiedByDayFloor.set(
          key,
          (occupiedByDayFloor.get(key) ?? 0) + row._count._all,
        );
      }
      occupiedByDesk.set(
        row.deskId,
        (occupiedByDesk.get(row.deskId) ?? 0) + row._count._all,
      );
    }

    const series = workdays.map((day) => {
      const rates: Record<string, number> = {};
      let occupied = 0;
      let available = 0;
      for (const floor of floors) {
        const active = activeByFloor.get(floor.id) ?? 0;
        const taken = occupiedByDayFloor.get(`${day}|${floor.id}`) ?? 0;
        rates[floor.id] = active ? taken / (active * 2) : 0;
        occupied += taken;
        available += active * 2;
      }
      return {
        date: day,
        rate: available ? occupied / available : 0,
        floors: rates,
      };
    });

    const activeDesks = desks.filter((d) => d.isActive);
    const ranking = activeDesks
      .map((d) => ({
        deskId: d.id,
        label: d.label,
        halves: occupiedByDesk.get(d.id) ?? 0,
      }))
      .sort((a, b) => b.halves - a.halves || a.label.localeCompare(b.label));

    const sessions = workdays.length * 2;
    const toRate = (halves: number) => (sessions ? halves / sessions : 0);
    return {
      from: query.from,
      to: query.to,
      floors,
      series,
      mostBooked: ranking
        .slice(0, 5)
        .map((r) => ({ ...r, rate: toRate(r.halves) })),
      leastBooked: ranking
        .slice(-5)
        .reverse()
        .map((r) => ({ ...r, rate: toRate(r.halves) })),
    };
  }

  // ----- Journal d'audit ----------------------------------------------------

  async auditLogs(query: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = query.action;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
        ...(query.to
          ? {
              lt: new Date(
                new Date(`${query.to}T00:00:00Z`).getTime() + 86_400_000,
              ),
            }
          : {}),
      };
    }
    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          payload: true,
          createdAt: true,
          actor: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items };
  }

  auditActors() {
    return this.prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      orderBy: { lastName: 'asc' },
      select: { id: true, firstName: true, lastName: true },
    });
  }

  // ----- Véhicules ----------------------------------------------------------

  listVehicles() {
    return this.prisma.vehicle.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, plate: true, isActive: true },
    });
  }

  async createVehicle(actor: AuthUser, dto: CreateVehicleDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const vehicle = await tx.vehicle.create({
          data: {
            name: dto.name,
            plate: dto.plate,
            isActive: dto.isActive ?? true,
          },
          select: { id: true, name: true, plate: true, isActive: true },
        });
        await this.audit.record(
          {
            actorId: actor.id,
            action: 'VEHICLE_CREATED',
            entityType: 'Vehicle',
            entityId: vehicle.id,
            payload: { name: dto.name, plate: dto.plate },
          },
          tx,
        );
        return vehicle;
      });
    } catch (error) {
      throw toPlateConflict(error);
    }
  }

  async updateVehicle(actor: AuthUser, id: string, dto: UpdateVehicleDto) {
    const before = await this.prisma.vehicle.findUnique({
      where: { id },
      select: { name: true, plate: true, isActive: true },
    });
    if (!before) throw new NotFoundException('Véhicule introuvable');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const after = await tx.vehicle.update({
          where: { id },
          data: dto,
          select: { id: true, name: true, plate: true, isActive: true },
        });
        await this.audit.record(
          {
            actorId: actor.id,
            action: 'VEHICLE_UPDATED',
            entityType: 'Vehicle',
            entityId: id,
            payload: {
              before,
              after: {
                name: after.name,
                plate: after.plate,
                isActive: after.isActive,
              },
            },
          },
          tx,
        );
        return after;
      });
    } catch (error) {
      throw toPlateConflict(error);
    }
  }

  // ----- Helpers  // ----- Helpers ------------------------------------------------------------

  private async assertFloorAndTeam(
    floorId: string | null,
    teamId: string | null | undefined,
  ) {
    if (floorId) {
      const floor = await this.prisma.floor.findUnique({
        where: { id: floorId },
        select: { id: true },
      });
      if (!floor) throw new BadRequestException('Étage inconnu');
    }
    if (teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true },
      });
      if (!team) throw new BadRequestException('Équipe inconnue');
    }
  }
}

function pick<T extends object>(source: T, dto: object): Partial<T> {
  const keys = Object.keys(dto) as (keyof T)[];
  return Object.fromEntries(
    keys.filter((k) => k in source).map((k) => [k, source[k]]),
  ) as Partial<T>;
}

function toPlateConflict(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new ConflictException('Cette plaque est déjà enregistrée');
  }
  return error instanceof Error ? error : new Error(String(error));
}

function toLabelConflict(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new ConflictException('Ce libellé existe déjà sur cet étage');
  }
  return error instanceof Error ? error : new Error(String(error));
}
