import { HttpClient, HttpParams } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { addDaysIso, formatShortDayFr, todayIso } from '../../core/dates';
import { ToastService } from '../../core/notifications/toast.service';
import { EmptyStateComponent, SkeletonComponent } from '../../shared/ui/feedback.components';

interface DeskRank {
  deskId: string;
  label: string;
  halves: number;
  rate: number;
}

interface StatsResponse {
  from: string;
  to: string;
  floors: { id: string; name: string }[];
  series: { date: string; rate: number; floors: Record<string, number> }[];
  mostBooked: DeskRank[];
  leastBooked: DeskRank[];
}

const PERCENT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });

/** Statistiques : taux d'occupation par jour (SVG maison) et classement des postes. */
@Component({
  selector: 'app-admin-stats',
  imports: [EmptyStateComponent, SkeletonComponent],
  template: `
    <div class="flex flex-col gap-6">
      <form
        class="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4 shadow-card"
        (submit)="$event.preventDefault(); apply()"
      >
        <label class="flex flex-col gap-1 text-sm font-medium">
          Du
          <input
            type="date"
            class="field w-auto"
            [value]="from()"
            (change)="from.set(value($event))"
          />
        </label>
        <label class="flex flex-col gap-1 text-sm font-medium">
          Au
          <input type="date" class="field w-auto" [value]="to()" (change)="to.set(value($event))" />
        </label>
        <button
          type="submit"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Afficher
        </button>
        <p class="ml-auto text-xs text-ink-subtle">Période maximum : 90 jours. Week-ends exclus.</p>
      </form>

      @if (stats() === null) {
        <div class="rounded-xl border border-line bg-surface p-5 shadow-card">
          <app-skeleton label="Calcul des statistiques" />
        </div>
      } @else if (stats()!.series.length === 0) {
        <app-empty-state title="Aucun jour ouvré sur cette période" />
      } @else {
        <section
          class="rounded-xl border border-line bg-surface p-5 shadow-card"
          aria-labelledby="occ-title"
        >
          <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="occ-title" class="text-base font-semibold">Taux d’occupation par jour</h2>
            <p class="text-sm text-ink-muted">
              Moyenne sur la période :
              <span class="font-semibold text-ink">{{ averageLabel() }}</span>
            </p>
          </div>

          <svg
            class="h-auto w-full min-w-160"
            [attr.viewBox]="'0 0 ' + chartWidth + ' ' + chartHeight"
            role="img"
            [attr.aria-label]="chartLabel()"
          >
            @for (tick of ticks; track tick) {
              <line
                x1="36"
                [attr.x2]="chartWidth"
                [attr.y1]="chartTop + (1 - tick) * chartInner"
                [attr.y2]="chartTop + (1 - tick) * chartInner"
                class="stroke-line"
                stroke-width="1"
              />
              <text
                x="30"
                [attr.y]="chartTop + (1 - tick) * chartInner + 4"
                text-anchor="end"
                font-size="11"
                class="fill-ink-subtle"
              >
                {{ tick * 100 }}%
              </text>
            }
            @for (point of series(); track point.date; let i = $index) {
              <g>
                <rect
                  [attr.x]="barX(i)"
                  [attr.y]="barY(point.rate)"
                  [attr.width]="barWidth"
                  [attr.height]="barHeight(point.rate)"
                  rx="3"
                  class="fill-accent"
                >
                  <title>{{ formatDay(point.date) }} : {{ pct(point.rate) }}</title>
                </rect>
                <text
                  [attr.x]="barX(i) + barWidth / 2"
                  [attr.y]="chartHeight - 8"
                  text-anchor="middle"
                  font-size="10"
                  class="fill-ink-muted"
                >
                  {{ shortDay(point.date) }}
                </text>
              </g>
            }
          </svg>

          <details class="mt-4 text-sm">
            <summary class="cursor-pointer font-medium text-accent-ink">
              Voir les valeurs par étage
            </summary>
            <table class="mt-3 w-full text-left">
              <thead>
                <tr class="border-b border-line text-ink-muted">
                  <th scope="col" class="py-2 font-medium">Jour</th>
                  <th scope="col" class="py-2 font-medium">Global</th>
                  @for (f of stats()!.floors; track f.id) {
                    <th scope="col" class="py-2 font-medium">{{ f.name }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (point of series(); track point.date) {
                  <tr class="border-b border-line last:border-0">
                    <th scope="row" class="py-2 font-normal capitalize">
                      {{ formatDay(point.date) }}
                    </th>
                    <td class="py-2">{{ pct(point.rate) }}</td>
                    @for (f of stats()!.floors; track f.id) {
                      <td class="py-2">{{ pct(point.floors[f.id] ?? 0) }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </details>
        </section>

        <div class="grid gap-4 md:grid-cols-2">
          <section
            class="rounded-xl border border-line bg-surface p-5 shadow-card"
            aria-labelledby="most-title"
          >
            <h2 id="most-title" class="text-base font-semibold">Postes les plus réservés</h2>
            <ol class="mt-3 flex flex-col gap-2 text-sm">
              @for (d of stats()!.mostBooked; track d.deskId) {
                <li class="flex justify-between">
                  <span class="font-medium">{{ d.label }}</span><span class="text-ink-muted">{{
                    pct(d.rate)
                  }}</span>
                </li>
              }
            </ol>
          </section>
          <section
            class="rounded-xl border border-line bg-surface p-5 shadow-card"
            aria-labelledby="least-title"
          >
            <h2 id="least-title" class="text-base font-semibold">Postes les moins réservés</h2>
            <ol class="mt-3 flex flex-col gap-2 text-sm">
              @for (d of stats()!.leastBooked; track d.deskId) {
                <li class="flex justify-between">
                  <span class="font-medium">{{ d.label }}</span><span class="text-ink-muted">{{
                    pct(d.rate)
                  }}</span>
                </li>
              }
            </ol>
          </section>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminStatsComponent {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly from = signal(addDaysIso(todayIso(), -27));
  protected readonly to = signal(todayIso());
  protected readonly stats = signal<StatsResponse | null>(null);
  protected readonly series = computed(() => this.stats()?.series ?? []);
  protected readonly averageLabel = computed(() => {
    const s = this.series();
    if (!s.length) return '—';
    return this.pct(s.reduce((sum, p) => sum + p.rate, 0) / s.length);
  });

  protected readonly chartWidth = 760;
  protected readonly chartHeight = 240;
  protected readonly chartTop = 12;
  protected readonly chartInner = 200;
  protected readonly ticks = [0, 0.25, 0.5, 0.75, 1];
  protected readonly barWidth = 18;

  constructor() {
    this.apply();
  }

  protected apply(): void {
    const params = new HttpParams().set('from', this.from()).set('to', this.to());
    this.stats.set(null);
    this.http
      .get<StatsResponse>('/api/admin/stats', { params })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => this.stats.set(s),
        error: () => this.toast.error('Statistiques indisponibles pour cette période.'),
      });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected barX(index: number): number {
    const slot = (this.chartWidth - 40) / Math.max(this.series().length, 1);
    return 40 + index * slot + (slot - this.barWidth) / 2;
  }

  protected barHeight(rate: number): number {
    return rate * this.chartInner;
  }

  protected barY(rate: number): number {
    return this.chartTop + this.chartInner - this.barHeight(rate);
  }

  protected chartLabel(): string {
    return `Taux d’occupation par jour, moyenne ${this.averageLabel()}`;
  }

  protected pct(rate: number): string {
    return PERCENT.format(rate);
  }

  protected formatDay(iso: string): string {
    return formatShortDayFr(iso);
  }

  protected shortDay(iso: string): string {
    return iso.slice(8, 10) + '/' + iso.slice(5, 7);
  }
}
