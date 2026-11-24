import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatDayFr, todayIso, workdaysFrom } from '../../core/dates';
import type { HalfInput, HalfKey, Settings } from '../../core/models';
import { ToastService } from '../../core/notifications/toast.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent, SkeletonComponent } from '../../shared/ui/feedback.components';

type HalfStatus = { status: 'FREE' } | { status: 'MINE'; holder: string } | { status: 'BOOKED'; holder: string };

interface VehicleAvailability {
  id: string;
  name: string;
  plate: string;
  halves: Record<HalfKey, HalfStatus>;
}

interface VehiclesResponse {
  date: string;
  viewer: Record<HalfKey, boolean>;
  vehicles: VehicleAvailability[];
}

const HALF_LABEL: Record<HalfInput, string> = {
  AM: 'Matin',
  PM: 'Après-midi',
  FULL: 'Journée',
};

/** Réservation des véhicules de fonction, pour une journée donnée, matin, après-midi ou journée. */
@Component({
  selector: 'app-vehicles-page',
  imports: [ButtonComponent, EmptyStateComponent, SkeletonComponent],
  template: `
    <section class="flex flex-col gap-6">
      <header class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold">Véhicules de fonction</h1>
        <p class="text-sm text-ink-muted">Réservez un véhicule pour votre matinée, votre après-midi ou la journée.</p>
      </header>

      <div class="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
        <label class="flex flex-col gap-1 text-sm font-medium">
          Date
          <select #dateSelect class="field min-w-56" [value]="date()" (change)="selectDate(dateSelect.value)">
            @for (option of dateOptions(); track option) {
              <option [value]="option">{{ dayLabel(option) }}</option>
            }
          </select>
        </label>
      </div>

      @if (loadError()) {
        <app-empty-state title="Impossible de charger les véhicules" description="Réessayez dans un instant." />
      } @else if (data() === null) {
        <div class="rounded-xl border border-line bg-surface p-5 shadow-card"><app-skeleton label="Chargement des véhicules" /></div>
      } @else if (data()!.vehicles.length === 0) {
        <app-empty-state title="Aucun véhicule disponible" description="Le parc n’a pas de véhicule réservable pour le moment." />
      } @else {
        <ul class="grid gap-4 md:grid-cols-2">
          @for (vehicle of data()!.vehicles; track vehicle.id) {
            <li class="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card">
              <div>
                <h2 class="text-base font-semibold">{{ vehicle.name }}</h2>
                <p class="font-mono text-sm text-ink-muted">{{ vehicle.plate }}</p>
              </div>

              <ul class="flex flex-col gap-2 text-sm" [attr.aria-label]="'Disponibilité de ' + vehicle.name">
                @for (half of halves; track half) {
                  <li class="flex items-center justify-between gap-3">
                    <span class="text-ink-muted">{{ halfLabel(half) }}</span>
                    <span class="text-right font-medium">{{ statusText(vehicle, half) }}</span>
                  </li>
                }
              </ul>

              <div class="mt-auto grid grid-cols-3 gap-2">
                @for (half of halves; track half) {
                  <button
                    ui-button
                    variant="secondary"
                    size="sm"
                    type="button"
                    [disabled]="busy() || !canBook(vehicle, half)"
                    [attr.aria-label]="halfLabel(half) + ' : réserver ' + vehicle.name"
                    (click)="book(vehicle, half)"
                  >
                    {{ halfLabel(half) }}
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehiclesPage {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly halves: HalfInput[] = ['AM', 'PM', 'FULL'];
  protected readonly halfLabel = (half: HalfInput) => HALF_LABEL[half];

  protected readonly settings = signal<Settings | null>(null);
  protected readonly dateOptions = computed(() => {
    const s = this.settings();
    return s ? workdaysFrom(todayIso(), s.maxAdvanceDays) : [];
  });
  protected readonly date = signal<string>('');
  protected readonly data = signal<VehiclesResponse | null>(null);
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    this.http
      .get<Settings>('/api/settings')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((s) => {
        this.settings.set(s);
        this.date.set(workdaysFrom(todayIso(), s.maxAdvanceDays)[0] ?? todayIso());
        this.load();
      });
  }

  protected selectDate(value: string): void {
    this.date.set(value);
    this.load();
  }

  protected dayLabel(iso: string): string {
    return formatDayFr(iso);
  }

  protected statusText(vehicle: VehicleAvailability, half: HalfInput): string {
    if (half === 'FULL') {
      const am = vehicle.halves.AM.status;
      const pm = vehicle.halves.PM.status;
      if (am === 'FREE' && pm === 'FREE') return 'Libre toute la journée';
      if (am === 'MINE' || pm === 'MINE') return 'Votre réservation';
      return 'Partiellement réservé';
    }
    const state = vehicle.halves[half];
    if (state.status === 'FREE') {
      return this.data()?.viewer[half] ? 'Vous avez déjà un véhicule' : 'Libre';
    }
    return state.status === 'MINE' ? 'Votre réservation' : `Réservé par ${state.holder}`;
  }

  protected canBook(vehicle: VehicleAvailability, half: HalfInput): boolean {
    const viewer = this.data()?.viewer;
    if (!viewer) return false;
    const halves: HalfKey[] = half === 'FULL' ? ['AM', 'PM'] : [half];
    return halves.every((h) => vehicle.halves[h].status === 'FREE' && !viewer[h]);
  }

  protected book(vehicle: VehicleAvailability, half: HalfInput): void {
    this.busy.set(true);
    this.http
      .post('/api/vehicle-bookings', { vehicleId: vehicle.id, date: this.date(), half })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.toast.success(`${vehicle.name} réservé : ${HALF_LABEL[half].toLowerCase()}, ${formatDayFr(this.date())}.`);
          this.load();
        },
        // L'intercepteur affiche le motif (quota, véhicule déjà pris…).
        error: () => this.busy.set(false),
      });
  }

  private load(): void {
    const date = this.date();
    if (!date) return;
    this.loadError.set(false);
    this.data.set(null);
    const params = new HttpParams().set('date', date);
    this.http
      .get<VehiclesResponse>('/api/vehicles/availability', { params })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.data.set(res),
        error: () => this.loadError.set(true),
      });
  }
}
