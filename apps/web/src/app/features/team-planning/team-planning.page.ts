import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, filter, map, startWith, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  addDaysIso,
  formatRangeFr,
  formatShortDayFr,
  isoWeekKey,
  mondayOfIso,
  todayIso,
} from '../../core/dates';
import type {
  Availability,
  DeskAvailability,
  FloorSummary,
  HalfInput,
  TeamPlanning,
} from '../../core/models';
import { ToastService } from '../../core/notifications/toast.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent, SkeletonComponent } from '../../shared/ui/feedback.components';
import { halfIsFree } from '../floor-plan/desk-status';

const HALF_OPTIONS: { value: HalfInput; label: string }[] = [
  { value: 'AM', label: 'Matin' },
  { value: 'PM', label: 'Après-midi' },
  { value: 'FULL', label: 'Journée' },
];

/**
 * Planning de l'équipe (semaine, lundi à vendredi) et, pour un manager, réservation
 * d'un poste au nom d'un membre. L'API vérifie tout : ce composant n'est qu'un guichet.
 */
@Component({
  selector: 'app-team-planning-page',
  imports: [DecimalPipe, ButtonComponent, EmptyStateComponent, SkeletonComponent],
  templateUrl: './team-planning.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPlanningPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = this.auth.user;
  protected readonly isManager = computed(() => this.auth.role() === 'MANAGER');
  protected readonly halfOptions = HALF_OPTIONS;

  // Semaine affichée (lundi) et chargement du planning.
  protected readonly monday = signal(mondayOfIso(todayIso()));
  protected readonly weekLabel = computed(() => formatRangeFr(this.monday()));
  protected readonly weekDays = computed(() =>
    Array.from({ length: 5 }, (_, i) => addDaysIso(this.monday(), i)),
  );
  protected readonly planning = signal<TeamPlanning | null>(null);
  protected readonly loadError = signal(false);
  private readonly refresh$ = new Subject<void>();

  // Formulaire manager : réserver pour un membre de l'équipe.
  protected readonly bookingOpen = signal(false);
  protected readonly bookingMemberId = signal('');
  protected readonly bookingDate = signal('');
  protected readonly bookingHalf = signal<HalfInput>('AM');
  protected readonly bookingFloorId = signal('');
  protected readonly bookingDeskId = signal('');
  protected readonly floors = signal<FloorSummary[]>([]);
  protected readonly floorDesks = signal<DeskAvailability[]>([]);
  protected readonly submitting = signal(false);

  /** Postes réservables pour le créneau choisi. */
  protected readonly freeDesks = computed(() =>
    this.floorDesks().filter((desk) => {
      const half = this.bookingHalf();
      return half === 'FULL'
        ? halfIsFree(desk, 'AM') && halfIsFree(desk, 'PM')
        : halfIsFree(desk, half);
    }),
  );

  /** Membres de l'équipe, sans soi-même. */
  protected readonly otherMembers = computed(() => {
    const me = this.user()?.id;
    return (this.planning()?.members ?? []).filter((m) => m.id !== me);
  });

  constructor() {
    this.refresh$
      .pipe(
        startWith(undefined),
        tap(() => {
          this.planning.set(null);
          this.loadError.set(false);
        }),
        switchMap(() => {
          const teamId = this.user()?.teamId;
          if (!teamId) return EMPTY;
          return this.http
            .get<TeamPlanning>(`/api/teams/${teamId}/planning`, {
              params: { week: isoWeekKey(this.monday()) },
            })
            .pipe(
              catchError(() => {
                this.loadError.set(true);
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((planning) => this.planning.set(planning));

    if (this.isManager()) {
      this.http.get<FloorSummary[]>('/api/floors').subscribe((floors) => {
        this.floors.set(floors);
        this.bookingFloorId.set(floors[0]?.id ?? '');
      });

      // Les postes disponibles dépendent de l'étage et de la date : on recharge à chaque changement.
      toObservable(computed(() => ({ floorId: this.bookingFloorId(), date: this.bookingDate() })))
        .pipe(
          filter((s) => s.floorId !== '' && s.date !== ''),
          switchMap((s) =>
            this.http
              .get<Availability>(`/api/floors/${s.floorId}/availability`, {
                params: { date: s.date },
              })
              .pipe(
                map((availability) => availability.desks),
                catchError(() => EMPTY),
              ),
          ),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((desks) => this.floorDesks.set(desks));
    }
  }

  protected previousWeek(): void {
    this.shiftWeek(-7);
  }

  protected nextWeek(): void {
    this.shiftWeek(7);
  }

  protected thisWeek(): void {
    this.monday.set(mondayOfIso(todayIso()));
    this.refresh$.next();
  }

  protected dayHeader(iso: string): string {
    return formatShortDayFr(iso);
  }

  protected slotText(am: string | null, pm: string | null): string {
    if (am && pm && am === pm) return `${am} · journée`;
    if (am && pm) return `${am} (matin) · ${pm} (après-midi)`;
    if (am) return `${am} · matin`;
    if (pm) return `${pm} · après-midi`;
    return '';
  }

  protected toggleBooking(): void {
    this.bookingOpen.update((open) => !open);
    if (!this.bookingDate()) {
      const today = todayIso();
      this.bookingDate.set(this.weekDays().find((d) => d >= today) ?? this.weekDays()[0] ?? '');
    }
  }

  protected submitBooking(): void {
    const memberId = this.bookingMemberId();
    const date = this.bookingDate();
    const deskId = this.bookingDeskId();
    if (!memberId || !date || !deskId) return;

    this.submitting.set(true);
    this.http
      .post('/api/bookings', { deskId, date, half: this.bookingHalf(), userId: memberId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.toast.success('Réservation enregistrée pour votre membre d’équipe.');
          this.bookingDeskId.set('');
          this.refresh$.next();
        },
        // L'intercepteur affiche le motif métier (quota, poste déjà pris…).
        error: () => this.submitting.set(false),
      });
  }

  private shiftWeek(days: number): void {
    this.monday.update((m) => addDaysIso(m, days));
    this.refresh$.next();
  }
}
