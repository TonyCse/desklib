import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Placeholder de chargement : même forme que le contenu attendu, pour éviter le saut de mise en page. */
@Component({
  selector: 'app-skeleton',
  template: `
    <div class="flex flex-col gap-3" aria-busy="true" [attr.aria-label]="label()" role="status">
      @for (line of lines(); track $index) {
        <div class="h-4 animate-pulse rounded bg-line" [style.width]="line"></div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonComponent {
  readonly label = input('Chargement en cours');
  readonly lines = input<string[]>(['100%', '92%', '76%']);
}

/** État vide explicite : titre, explication et éventuellement une action. */
@Component({
  selector: 'app-empty-state',
  template: `
    <div
      class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center"
    >
      <p class="text-base font-semibold text-ink">{{ title() }}</p>
      @if (description()) {
        <p class="max-w-md text-sm text-ink-muted">{{ description() }}</p>
      }
      <ng-content />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly description = input<string>('');
}
