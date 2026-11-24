import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyStateComponent } from '../../shared/ui/feedback.components';

/** Espace administration : prévu en phase 4 (postes, règles, utilisateurs, stats, journal d'audit). */
@Component({
  selector: 'app-admin-page',
  imports: [EmptyStateComponent],
  template: `
    <section class="flex flex-col gap-6">
      <header class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold">Administration</h1>
        <p class="text-sm text-ink-muted">
          Étages, postes, règles, utilisateurs, statistiques et journal d’audit.
        </p>
      </header>
      <app-empty-state
        title="Espace en construction"
        description="Les écrans d’administration arrivent dans la prochaine itération. Les routes correspondantes sont déjà protégées côté API par le rôle ADMIN."
      />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPage {}
