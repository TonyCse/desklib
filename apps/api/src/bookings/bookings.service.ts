import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Half } from '@ilot/shared';
import { AuditService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../common/decorators/auth.decorators.js';
import {
  canCancelSlot,
  checkWeeklyQuota,
  parisDateOf,
  validateBookingDate,
  parseIsoDate,
} from './domain/booking-rules.js';
import {
  BookingHalfInput,
  CreateBookingDto,
} from './dto/create-booking.dto.js';

/**
 * Cas d'usage de réservation. Les règles pures sont dans domain/ ; ici on charge les données,
 * on applique les règles, et on écrit dans une transaction avec sa trace d'audit.
 * Les contraintes uniques de BookingSlot restent la dernière barrière contre la double réservation.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthUser, dto: CreateBookingDto) {
    const targetId = dto.userId ?? actor.id;
    const onBehalf = targetId !== actor.id;

    // Un manager ne réserve que pour les membres de son équipe. Un salarié ne réserve que pour lui.
    if (onBehalf && !(actor.role === 'MANAGER' && actor.teamId)) {
      throw new ForbiddenException(
        'Seul un manager peut réserver pour un autre salarié',
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, teamId: true },
    });
    if (!target) throw new NotFoundException('Salarié introuvable');
    if (onBehalf && target.teamId !== actor.teamId) {
      throw new ForbiddenException(
        'Vous ne pouvez réserver que pour les membres de votre équipe',
      );
    }

    const desk = await this.prisma.desk.findUnique({
      where: { id: dto.deskId },
      select: { id: true, isActive: true, reservedTeamId: true },
    });
    if (!desk) throw new NotFoundException('Poste introuvable');
    if (!desk.isActive)
      throw new BadRequestException('Ce poste est indisponible');
    if (desk.reservedTeamId !== null && desk.reservedTeamId !== target.teamId) {
      throw new BadRequestException('Ce poste est réservé à une autre équipe');
    }

    const settings = await this.prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    const today = parisDateOf(new Date());
    const dateError = validateBookingDate({
      date: dto.date,
      today,
      maxAdvanceDays: settings.maxAdvanceDays,
    });
    if (dateError) throw new BadRequestException(dateError);

    const halves = toHalves(dto.half);
    await this.assertNoHalfAlreadyTaken(target.id, dto.date, halves);

    // Quota : jours distincts sur site dans la semaine ISO (lundi à dimanche, large pour couvrir la semaine).
    const date = parseIsoDate(dto.date);
    if (!date) throw new BadRequestException('Date invalide');
    const weekStart = new Date(date.getTime() - 6 * 86_400_000);
    const weekEnd = new Date(date.getTime() + 6 * 86_400_000);
    const weekSlots = await this.prisma.bookingSlot.findMany({
      where: { userId: target.id, date: { gte: weekStart, lte: weekEnd } },
      select: { date: true },
    });
    const existingDates = [
      ...new Set(weekSlots.map((s) => s.date.toISOString().slice(0, 10))),
    ];
    const quotaError = checkWeeklyQuota({
      date: dto.date,
      existingDates,
      weeklyQuota: settings.weeklyQuota,
    });
    if (quotaError) throw new BadRequestException(quotaError);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.create({
          data: {
            userId: target.id,
            deskId: desk.id,
            date,
            createdById: actor.id,
            slots: {
              create: halves.map((half) => ({
                deskId: desk.id,
                userId: target.id,
                date,
                half,
              })),
            },
          },
          select: { id: true, date: true, status: true },
        });
        await this.audit.record(
          {
            actorId: actor.id,
            action: 'BOOKING_CREATED',
            entityType: 'Booking',
            entityId: booking.id,
            payload: {
              deskId: desk.id,
              userId: target.id,
              date: dto.date,
              halves,
            },
          },
          tx,
        );
        return booking;
      });
    } catch (error) {
      throw toBusinessConflict(error);
    }
  }

  async cancel(actor: AuthUser, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        userId: true,
        user: { select: { teamId: true } },
        slots: { select: { date: true, half: true } },
      },
    });
    if (!booking) throw new NotFoundException('Réservation introuvable');

    // Propriété : on annule ses propres réservations, ou celles de son équipe (manager), ou tout (admin).
    const isOwner = booking.userId === actor.id;
    const isTeamManager =
      actor.role === 'MANAGER' &&
      actor.teamId !== null &&
      booking.user.teamId === actor.teamId;
    if (!isOwner && !isTeamManager && actor.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Vous ne pouvez pas annuler cette réservation',
      );
    }

    if (booking.status !== 'ACTIVE') {
      throw new BadRequestException('Cette réservation est déjà annulée');
    }

    const now = new Date();
    const blocked = booking.slots.some(
      (slot) =>
        !canCancelSlot({ now, date: isoOf(slot.date), half: slot.half }),
    );
    if (blocked) {
      throw new BadRequestException(
        'Annulation impossible : un créneau de cette réservation a déjà commencé',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingSlot.deleteMany({ where: { bookingId: booking.id } });
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED' },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'BOOKING_CANCELLED',
          entityType: 'Booking',
          entityId: booking.id,
        },
        tx,
      );
    });
    return { id: booking.id, status: 'CANCELLED' as const };
  }

  /** Réservations du salarié connecté, à venir ou passées (les annulées apparaissent dans les passées). */
  async listMine(actor: AuthUser, scope: 'upcoming' | 'past' = 'upcoming') {
    const today = parisDateOf(new Date());
    const todayDate = parseIsoDate(today);
    if (!todayDate) throw new Error('Date du jour invalide');

    const bookings = await this.prisma.booking.findMany({
      where:
        scope === 'upcoming'
          ? { userId: actor.id, status: 'ACTIVE', date: { gte: todayDate } }
          : {
              userId: actor.id,
              OR: [{ status: 'CANCELLED' }, { date: { lt: todayDate } }],
            },
      orderBy: [
        { date: scope === 'upcoming' ? 'asc' : 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        date: true,
        status: true,
        desk: { select: { label: true, floor: { select: { name: true } } } },
        slots: { select: { half: true, date: true } },
      },
    });

    return bookings.map((b) => {
      const halves = b.slots.map((s) => s.half).sort();
      const cancellable =
        b.status === 'ACTIVE' &&
        b.slots.every((s) =>
          canCancelSlot({ now: new Date(), date: isoOf(s.date), half: s.half }),
        );
      return {
        id: b.id,
        date: isoOf(b.date),
        status: b.status,
        deskLabel: b.desk.label,
        floorName: b.desk.floor.name,
        halves,
        cancellable,
      };
    });
  }

  private async assertNoHalfAlreadyTaken(
    userId: string,
    date: string,
    halves: Half[],
  ) {
    const parsed = parseIsoDate(date);
    if (!parsed) throw new BadRequestException('Date invalide');
    const existing = await this.prisma.bookingSlot.findMany({
      where: { userId, date: parsed, half: { in: halves } },
      select: { half: true },
    });
    if (existing.length > 0) {
      const labels = existing.map((s) =>
        s.half === 'AM' ? 'le matin' : "l'après-midi",
      );
      throw new ConflictException(
        `Un poste est déjà réservé ${labels.join(' et ')} ce jour-là`,
      );
    }
  }
}

function toHalves(input: BookingHalfInput): Half[] {
  return input === 'FULL' ? ['AM', 'PM'] : [input];
}

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Traduit une violation de contrainte unique en erreur métier lisible. */
function toBusinessConflict(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const rawTarget = error.meta?.['target'];
    const target = Array.isArray(rawTarget)
      ? rawTarget.join(',')
      : typeof rawTarget === 'string'
        ? rawTarget
        : '';
    if (target.includes('deskId')) {
      return new ConflictException(
        'Ce poste vient d’être réservé par quelqu’un d’autre',
      );
    }
    return new ConflictException('Vous avez déjà un poste sur ce créneau');
  }
  return error instanceof Error ? error : new Error(String(error));
}
