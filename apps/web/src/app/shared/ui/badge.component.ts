import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'accent' | 'warn' | 'success' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-canvas text-ink-muted border-line',
  accent: 'bg-accent-soft text-accent-ink border-accent-soft',
  warn: 'bg-warn-soft text-warn-ink border-warn-soft',
  success: 'bg-success-soft text-success border-success-soft',
  danger: 'bg-danger-soft text-danger border-danger-soft',
};

@Component({
  selector: 'span[ui-badge]',
  template: '<ng-content />',
  host: {
    '[class]': 'classes()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('neutral');

  protected readonly classes = computed(
    () =>
      `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[this.tone()]}`,
  );
}
