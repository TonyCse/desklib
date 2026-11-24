import { DatePipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent, SkeletonComponent } from '../../shared/ui/feedback.components';

interface AuditItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: unknown;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string } | null;
}

interface AuditPage {
  total: number;
  page: number;
  pageSize: number;
  items: AuditItem[];
}

interface Actor {
  id: string;
  firstName: string;
  lastName: string;
}

const ACTION_LABEL: Record<string, string> = {
  AUTH_LOGIN: 'Connexion',
  BOOKING_CREATED: 'Réservation créée',
  BOOKING_CANCELLED: 'Réservation annulée',
  DESK_CREATED: 'Poste créé',
  DESK_UPDATED: 'Poste modifié',
  SETTINGS_UPDATED: 'Règles modifiées',
  USER_UPDATED: 'Utilisateur modifié',
};

const PAGE_SIZE = 15;

/** Journal d'audit : tableau paginé, filtrable par utilisateur, action et date. */
@Component({
  selector: 'app-admin-audit',
  imports: [DatePipe, ButtonComponent, EmptyStateComponent, SkeletonComponent],
  template: `
    <div class="flex flex-col gap-4">
      <form
        class="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4 shadow-card"
        (submit)="$event.preventDefault(); applyFilters()"
      >
        <label class="flex flex-col gap-1 text-sm font-medium">
          Utilisateur
          <select class="field w-auto min-w-48" (change)="actorId.set(value($event))">
            <option value="">Tous</option>
            @for (a of actors(); track a.id) {
              <option [value]="a.id" [selected]="actorId() === a.id">
                {{ a.firstName }} {{ a.lastName }}
              </option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm font-medium">
          Action
          <select class="field w-auto min-w-48" (change)="action.set(value($event))">
            <option value="">Toutes</option>
            @for (key of actionKeys; track key) {
              <option [value]="key" [selected]="action() === key">{{ actionLabel(key) }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm font-medium">
          Du
          <input type="date" class="field w-auto" (change)="from.set(value($event))" />
        </label>
        <label class="flex flex-col gap-1 text-sm font-medium">
          Au
          <input type="date" class="field w-auto" (change)="to.set(value($event))" />
        </label>
        <button ui-button type="submit">Filtrer</button>
      </form>

      @if (page() === null) {
        <div class="rounded-xl border border-line bg-surface p-5 shadow-card">
          <app-skeleton label="Chargement du journal" />
        </div>
      } @else if (page()!.items.length === 0) {
        <app-empty-state title="Aucune entrée" description="Modifiez les filtres ou la période." />
      } @else {
        <div class="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
          <table class="w-full min-w-180 text-sm">
            <caption class="sr-only">
              Journal d’audit,
              {{
                page()!.total
              }}
              entrée(s)
            </caption>
            <thead>
              <tr class="border-b border-line bg-canvas text-left text-ink-muted">
                <th scope="col" class="px-4 py-3 font-medium">Date</th>
                <th scope="col" class="px-4 py-3 font-medium">Utilisateur</th>
                <th scope="col" class="px-4 py-3 font-medium">Action</th>
                <th scope="col" class="px-4 py-3 font-medium">Cible</th>
                <th scope="col" class="px-4 py-3 font-medium">Détail</th>
              </tr>
            </thead>
            <tbody>
              @for (item of page()!.items; track item.id) {
                <tr class="border-b border-line align-top last:border-0">
                  <td class="px-4 py-3 whitespace-nowrap">
                    {{ item.createdAt | date: 'dd/MM/yyyy HH:mm' }}
                  </td>
                  <td class="px-4 py-3">
                    {{ item.actor ? item.actor.firstName + ' ' + item.actor.lastName : 'Système' }}
                  </td>
                  <td class="px-4 py-3">{{ actionLabel(item.action) }}</td>
                  <td class="px-4 py-3 text-ink-muted">{{ item.entityType }}</td>
                  <td class="px-4 py-3">
                    <details>
                      <summary class="cursor-pointer text-accent-ink">Voir</summary>
                      <pre
                        class="mt-2 max-w-md overflow-x-auto rounded-lg bg-canvas p-2 text-xs text-ink-muted"
                        >{{ payloadText(item.payload) }}</pre>
                    </details>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <nav
          class="flex items-center justify-between gap-3 text-sm"
          aria-label="Pagination du journal"
        >
          <p class="text-ink-muted">
            Page {{ page()!.page }} sur {{ totalPages() }} · {{ page()!.total }} entrée(s)
          </p>
          <div class="flex gap-2">
            <button
              ui-button
              variant="secondary"
              size="sm"
              type="button"
              [disabled]="page()!.page <= 1"
              (click)="go(page()!.page - 1)"
            >
              Précédente
            </button>
            <button
              ui-button
              variant="secondary"
              size="sm"
              type="button"
              [disabled]="page()!.page >= totalPages()"
              (click)="go(page()!.page + 1)"
            >
              Suivante
            </button>
          </div>
        </nav>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAuditComponent {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly actionKeys = Object.keys(ACTION_LABEL);
  protected readonly page = signal<AuditPage | null>(null);
  protected readonly actors = signal<Actor[]>([]);
  protected readonly actorId = signal('');
  protected readonly action = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  private readonly current = signal(1);

  constructor() {
    this.http
      .get<Actor[]>('/api/admin/audit-logs/actors')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((a) => this.actors.set(a));
    this.load();
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected applyFilters(): void {
    this.current.set(1);
    this.load();
  }

  protected go(page: number): void {
    this.current.set(page);
    this.load();
  }

  protected totalPages(): number {
    const p = this.page();
    return p ? Math.max(1, Math.ceil(p.total / PAGE_SIZE)) : 1;
  }

  protected actionLabel(key: string): string {
    return ACTION_LABEL[key] ?? key;
  }

  protected payloadText(payload: unknown): string {
    return payload === null || payload === undefined ? '—' : JSON.stringify(payload, null, 2);
  }

  private load(): void {
    let params = new HttpParams().set('page', this.current()).set('pageSize', PAGE_SIZE);
    if (this.actorId()) params = params.set('actorId', this.actorId());
    if (this.action()) params = params.set('action', this.action());
    if (this.from()) params = params.set('from', this.from());
    if (this.to()) params = params.set('to', this.to());
    this.http
      .get<AuditPage>('/api/admin/audit-logs', { params })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((p) => this.page.set(p));
  }
}
