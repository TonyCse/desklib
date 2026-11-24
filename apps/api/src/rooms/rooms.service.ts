import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Half } from '@desklib/shared';
import { AuditService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../common/decorators/auth.decorators.js';
import {
  canCancelSlot,
  parisDateOf,
  parseIsoDate,
  validateBookingDate,
} from '../bookings/domain/booking-rules.js';
import { CreateRoomBookingDto } from './dto/room-booking.dto.js';

/**
 * Réservation des salles de fonction. Mêmes règles de dates et de créneaux que les postes,
 * mais un salarié peut avoir un poste et un salle le même matin : les contraintes sont séparées.
 */
@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Salles actifs pour une date, avec l'état de chaque demi-journée pour le visiteur. */
  async availability(date: string, floorId: string, viewer: AuthUser) {
    const day = parseIsoDate(date);
    if (!day) throw new BadRequestException('Date invalide');

    const [rooms, slots, mine] = await Promise.all([
      this.prisma.room.findMany({
        where: { isActive: true, floorId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, zoneName: true, capacity: true },
      }),
      this.prisma.roomSlot.findMany({
        where: { date: day },
        select: {
          roomId: true,
          half: true,
          userId: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.roomSlot.findMany({
        where: { userId: viewer.id, date: day },
        select: { half: true },
      }),
    ]);

    const byRoomHalf = new Map(slots.map((s) => [`${s.roomId}:${s.half}`, s]));
    const halfState = (roomId: string, half: Half) => {
      const slot = byRoomHalf.get(`${roomId}:${half}`);
      if (!slot) return { status: 'FREE' as const };
      const holder = `${slot.user.firstName} ${slot.user.lastName}`;
      return slot.userId === viewer.id
        ? { status: 'MINE' as const, holder }
        : { status: 'BOOKED' as const, holder };
    };

    return {
      date,
      viewer: {
        AM: mine.some((s) => s.half === 'AM'),
        PM: mine.some((s) => s.half === 'PM'),
      },
      rooms: rooms.map((v) => ({
        id: v.id,
        name: v.name,
        zoneName: v.zoneName,
        capacity: v.capacity,
        halves: { AM: halfState(v.id, 'AM'), PM: halfState(v.id, 'PM') },
      })),
    };
  }

  async book(actor: AuthUser, dto: CreateRoomBookingDto) {
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      select: { id: true, isActive: true },
    });
    if (!room) throw new NotFoundException('Salle introuvable');
    if (!room.isActive)
      throw new BadRequestException('Ce salle est indisponible');

    const settings = await this.prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    const dateError = validateBookingDate({
      date: dto.date,
      today: parisDateOf(new Date()),
      maxAdvanceDays: settings.maxAdvanceDays,
    });
    if (dateError) throw new BadRequestException(dateError);

    const date = parseIsoDate(dto.date);
    if (!date) throw new BadRequestException('Date invalide');
    const halves: Half[] = dto.half === 'FULL' ? ['AM', 'PM'] : [dto.half];

    const taken = await this.prisma.roomSlot.findMany({
      where: { userId: actor.id, date, half: { in: halves } },
      select: { half: true },
    });
    if (taken.length > 0) {
      throw new ConflictException('Vous avez déjà un salle sur ce créneau');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const booking = await tx.roomBooking.create({
          data: {
            roomId: room.id,
            userId: actor.id,
            date,
            createdById: actor.id,
            slots: {
              create: halves.map((half) => ({
                roomId: room.id,
                userId: actor.id,
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
            action: 'ROOM_BOOKING_CREATED',
            entityType: 'RoomBooking',
            entityId: booking.id,
            payload: { roomId: room.id, date: dto.date, halves },
          },
          tx,
        );
        return booking;
      });
    } catch (error) {
      throw toRoomConflict(error);
    }
  }

  async cancel(actor: AuthUser, bookingId: string) {
    const booking = await this.prisma.roomBooking.findUnique({
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
      await tx.roomSlot.deleteMany({ where: { bookingId: booking.id } });
      await tx.roomBooking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED' },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'ROOM_BOOKING_CANCELLED',
          entityType: 'RoomBooking',
          entityId: booking.id,
        },
        tx,
      );
    });
    return { id: booking.id, status: 'CANCELLED' as const };
  }

  /** Réservations de salles du salarié connecté, à venir ou passées. */
  async listMine(actor: AuthUser, scope: 'upcoming' | 'past' = 'upcoming') {
    const todayDate = parseIsoDate(parisDateOf(new Date()));
    if (!todayDate) throw new Error('Date du jour invalide');

    const bookings = await this.prisma.roomBooking.findMany({
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
        room: { select: { name: true, zoneName: true } },
        slots: { select: { half: true, date: true } },
      },
    });

    return bookings.map((b) => ({
      id: b.id,
      date: isoOf(b.date),
      status: b.status,
      roomName: b.room.name,
      roomZone: b.room.zoneName,
      halves: b.slots.map((s) => s.half).sort(),
      cancellable:
        b.status === 'ACTIVE' &&
        b.slots.every((s) =>
          canCancelSlot({ now: new Date(), date: isoOf(s.date), half: s.half }),
        ),
    }));
  }
}

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toRoomConflict(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const target = error.meta?.['target'];
    const text = Array.isArray(target)
      ? target.join(',')
      : typeof target === 'string'
        ? target
        : '';
    if (text.includes('roomId')) {
      return new ConflictException(
        'Ce salle vient d’être réservé par quelqu’un d’autre',
      );
    }
    return new ConflictException('Vous avez déjà un salle sur ce créneau');
  }
  return error instanceof Error ? error : new Error(String(error));
}
