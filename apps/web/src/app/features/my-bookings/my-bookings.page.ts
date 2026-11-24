import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, map, startWith, switchMap, tap } from 'rxjs';
import { formatDayFr } from '../../core/dates';
import type { HalfKey, MyBooking, MyVehicleBooking } from '../../core/models';
import { ToastService } from '../../core/notifications/toast.service';
import { BadgeComponent } from '../../shared/ui/badge.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { EmptyStateComponent, SkeletonComponent } from '../../shared/ui/feedback.components';

type Scope = 'upcoming' | 'past';
type Kind = 'desks' | 'vehicles';

/** Ligne commune aux réservations de postes et de véhicules. */
interface BookingRow {
  id: string;
  date: string;
  status: 'ACTIVE' | 'CANCELLED';
  title: string;
  subtitle: string;
  halves: HalfKey[];
  cancellable: boolean;
  kind: Kind;
}

const HALF_LABEL: Record<HalfKey, string> = { AM: 'Matin', PM: 'Après-midi' };

@Component({
  selector: 'app-my-bookings-page',
  imports: [BadgeComponent, ButtonComponent, ConfirmDialogComponent, EmptyStateComponent, SkeletonComponent],
  templateUrl: './my-bookings.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyBookingsPage {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly scope = signal<Scope>('upcoming');
  protected readonly kind = signal<Kind>('desks');
  protected readonly rows = signal<BookingRow[] | null>(null);
  protected readonly loadError = signal(false);
  protected readonly pendingCancel = signal<BookingRow | null>(null);
  protected readonly cancelling = signal(false);

  protected readonly kindLabel = computed(() => (this.kind() === 'desks' ? 'postes' : 'véhicules'));

  private readonly reload$ = new Subject<void>();

  constructor() {
    this.reload$
      .pipe(
        startWith(undefined),
        tap(() => {
          this.rows.set(null);
          this.loadError.set(false);
        }),
        switchMap(() => this.fetchRows().pipe(catchError(() => {
          this.loadError.set(true);
          this.rows.set([]);
          return EMPTY;
        }))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((list) => this.rows.set(list));
  }

  protected selectScope(scope: Scope): void {
    if (scope === this.scope()) return;
    this.scope.set(scope);
    this.reload$.next();
  }

  protected selectKind(kind: Kind): void {
    if (kind === this.kind()) return;
    this.kind.set(kind);
    this.reload$.next();
  }

  protected dayLabel(iso: string): string {
    return formatDayFr(iso);
  }

  protected halvesLabel(halves: HalfKey[]): string {
    if (halves.length === 2) return 'Journée';
    return HALF_LABEL[halves[0] ?? 'AM'];
  }

  protected askCancel(row: BookingRow): void {
    this.pendingCancel.set(row);
  }

  protected dismissCancel(): void {
    this.pendingCancel.set(null);
  }

  protected confirmCancel(): void {
    const row = this.pendingCancel();
    if (!row) return;
    this.cancelling.set(true);
    const url = row.kind === 'desks' ? `/api/bookings/${row.id}` : `/api/vehicle-bookings/${row.id}`;
    this.http
      .delete(url)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cancelling.set(false);
          this.pendingCancel.set(null);
          this.toast.success(`Réservation annulée : ${row.title}.`);
          this.reload$.next();
        },
        error: () => {
          // L'intercepteur affiche le motif (créneau déjà commencé, etc.).
          this.cancelling.set(false);
          this.pendingCancel.set(null);
          this.reload$.next();
        },
      });
  }

  private fetchRows() {
    const params = { scope: this.scope() };
    if (this.kind() === 'desks') {
      return this.http
        .get<MyBooking[]>('/api/bookings/me', { params })
        .pipe(map((list) => list.map((b) => this.deskRow(b))));
    }
    return this.http
      .get<MyVehicleBooking[]>('/api/vehicle-bookings/me', { params })
      .pipe(map((list) => list.map((b) => this.vehicleRow(b))));
  }

  private deskRow(b: MyBooking): BookingRow {
    return {
      id: b.id,
      date: b.date,
      status: b.status,
      title: `Poste ${b.deskLabel}`,
      subtitle: `Poste ${b.deskLabel} · ${b.floorName}`,
      halves: b.halves,
      cancellable: b.cancellable,
      kind: 'desks',
    };
  }

  private vehicleRow(b: MyVehicleBooking): BookingRow {
    return {
      id: b.id,
      date: b.date,
      status: b.status,
      title: b.vehicleName,
      subtitle: `${b.vehicleName} · ${b.vehiclePlate}`,
      halves: b.halves,
      cancellable: b.cancellable,
      kind: 'vehicles',
    };
  }
}
