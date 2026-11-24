import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors ' +
  'focus-visible:outline-3 disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-canvas',
  ghost: 'text-accent-ink hover:bg-accent-soft',
  danger: 'bg-danger text-white hover:brightness-95',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

/**
 * Bouton du design system. Les classes sont composées ici (et non en concaténation libre
 * dans les pages) pour garder une seule source de vérité des variantes.
 */
@Component({
  selector: 'button[ui-button], a[ui-button]',
  template: '<ng-content />',
  host: {
    '[class]': 'classes()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');

  protected readonly classes = computed(
    () => `${BASE} ${VARIANTS[this.variant()]} ${SIZES[this.size()]}`,
  );
}
