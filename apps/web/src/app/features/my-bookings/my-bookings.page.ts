import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, switchMap, tap, Subject, startWith } from 'rxjs';
import { formatDayFr } from '../../core/dates';
import type { HalfKey, MyBooking } from '../../core/models';
import { ToastService } from '../../core/notifications/toast.service';
import { BadgeComponent } from '../../shared/ui/badge.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { EmptyStateComponent, SkeletonComponent } from '../../shared/ui/feedback.components';

type Scope = 'upcoming' | 'past';

const HALF_LABEL: Record<HalfKey, string> = { AM: 'Matin', PM: 'Après-midi' };

@Component({
  selector: 'app-my-bookings-page',
  imports: [
    BadgeComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    EmptyStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './my-bookings.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyBookingsPage {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly scope = signal<Scope>('upcoming');
  protected readonly bookings = signal<MyBooking[] | null>(null);
  protected readonly loadError = signal(false);
  protected readonly pendingCancel = signal<MyBooking | null>(null);
  protected readonly cancelling = signal(false);

  private readonly reload$ = new Subject<void>();

  constructor() {
    this.reload$
      .pipe(
        startWith(undefined),
        tap(() => {
          this.bookings.set(null);
          this.loadError.set(false);
        }),
        switchMap(() =>
          this.http.get<MyBooking[]>('/api/bookings/me', { params: { scope: this.scope() } }).pipe(
            catchError(() => {
              this.loadError.set(true);
              this.bookings.set([]);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((list) => this.bookings.set(list));
  }

  protected selectScope(scope: Scope): void {
    if (scope === this.scope()) return;
    this.scope.set(scope);
    this.reload$.next();
  }

  protected dayLabel(iso: string): string {
    return formatDayFr(iso);
  }

  protected halvesLabel(halves: HalfKey[]): string {
    if (halves.length === 2) return 'Journée';
    return HALF_LABEL[halves[0] ?? 'AM'];
  }

  protected askCancel(booking: MyBooking): void {
    this.pendingCancel.set(booking);
  }

  protected dismissCancel(): void {
    this.pendingCancel.set(null);
  }

  protected confirmCancel(): void {
    const booking = this.pendingCancel();
    if (!booking) return;
    this.cancelling.set(true);
    this.http
      .delete<{ id: string; status: string }>(`/api/bookings/${booking.id}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cancelling.set(false);
          this.pendingCancel.set(null);
          this.toast.success(`Réservation du poste ${booking.deskLabel} annulée.`);
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
}
