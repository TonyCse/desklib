import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { AdminAuditComponent } from './admin-audit.component';
import { AdminDesksComponent } from './admin-desks.component';
import { AdminVehiclesComponent } from './admin-vehicles.component';
import { AdminRulesComponent } from './admin-rules.component';
import { AdminStatsComponent } from './admin-stats.component';
import { AdminUsersComponent } from './admin-users.component';

type AdminTab = 'desks' | 'vehicles' | 'rules' | 'users' | 'stats' | 'audit';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'desks', label: 'Postes' },
  { id: 'vehicles', label: 'Véhicules' },
  { id: 'rules', label: 'Règles' },
  { id: 'users', label: 'Utilisateurs' },
  { id: 'stats', label: 'Statistiques' },
  { id: 'audit', label: 'Journal d’audit' },
];

/** Administration : onglets, chaque écran charge ses données et reste indépendant. */
@Component({
  selector: 'app-admin-page',
  imports: [
    AdminDesksComponent,
    AdminVehiclesComponent,
    AdminRulesComponent,
    AdminUsersComponent,
    AdminStatsComponent,
    AdminAuditComponent,
  ],
  template: `
    <section class="flex flex-col gap-6">
      <header class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold">Administration</h1>
        <p class="text-sm text-ink-muted">
          Étages, postes, règles, utilisateurs, statistiques et journal d’audit.
        </p>
      </header>

      <div
        class="flex w-full gap-1 overflow-x-auto rounded-lg border border-line-strong bg-surface p-0.5 sm:w-fit"
        role="tablist"
        aria-label="Sections d’administration"
      >
        @for (t of tabs; track t.id) {
          <button
            type="button"
            role="tab"
            [id]="'admin-tab-' + t.id"
            [attr.aria-controls]="'admin-panel'"
            [attr.aria-selected]="tab() === t.id"
            class="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium"
            [class.bg-accent]="tab() === t.id"
            [class.text-white]="tab() === t.id"
            (click)="tab.set(t.id)"
          >
            {{ t.label }}
          </button>
        }
      </div>

      <div id="admin-panel" role="tabpanel" [attr.aria-labelledby]="'admin-tab-' + tab()">
        @switch (tab()) {
          @case ('desks') {
            <app-admin-desks />
          }
          @case ('vehicles') {
            <app-admin-vehicles />
          }
          @case ('rules') {
            <app-admin-rules />
          }
          @case ('users') {
            <app-admin-users />
          }
          @case ('stats') {
            <app-admin-stats />
          }
          @case ('audit') {
            <app-admin-audit />
          }
        }
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPage {
  protected readonly tabs = TABS;
  protected readonly tab = signal<AdminTab>('desks');
}
