import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { HalfAvailability, HalfInput, HalfKey } from '../../core/models';
import { ButtonComponent } from '../../shared/ui/button.component';

/**
 * Panneau de réservation d'une ressource (véhicule ou salle) : même logique que le détail d'un poste,
 * sans les équipements. Les actions sont désactivées quand la demi-journée est prise.
 */
@Component({
  selector: 'app-resource-panel',
  imports: [ButtonComponent],
  template: `
    <section
      role="region"
      [attr.aria-label]="title()"
      class="flex w-full flex-col gap-4 rounded-2xl border border-white/70 bg-white/90 p-5 shadow-pop backdrop-blur-md"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-ink-subtle">{{ kind() }}</p>
          <h2 class="mt-1 text-xl font-semibold">{{ title() }}</h2>
          @if (subtitle()) {
            <p class="mt-0.5 text-sm text-ink-muted">{{ subtitle() }}</p>
          }
        </div>
        <button
          type="button"
          class="rounded-lg px-2 py-1 text-ink-muted hover:bg-canvas hover:text-ink"
          aria-label="Fermer le détail"
          (click)="closeRequested.emit()"
        >
          ×
        </button>
      </div>

      <dl class="flex flex-col gap-2 rounded-xl bg-canvas/70 p-3 text-sm">
        <div class="flex items-center justify-between gap-3">
          <dt class="text-ink-muted">Matin</dt>
          <dd class="text-right font-medium">{{ halfText('AM') }}</dd>
        </div>
        <div class="flex items-center justify-between gap-3">
          <dt class="text-ink-muted">Après-midi</dt>
          <dd class="text-right font-medium">{{ halfText('PM') }}</dd>
        </div>
      </dl>

      <div class="flex flex-col gap-2">
        <button
          ui-button
          variant="secondary"
          type="button"
          class="w-full"
          [disabled]="busy() || !canBook('AM')"
          (click)="bookRequested.emit('AM')"
        >
          Réserver le matin
        </button>
        <button
          ui-button
          variant="secondary"
          type="button"
          class="w-full"
          [disabled]="busy() || !canBook('PM')"
          (click)="bookRequested.emit('PM')"
        >
          Réserver l’après-midi
        </button>
        <button
          ui-button
          type="button"
          class="w-full"
          [disabled]="busy() || !canBook('FULL')"
          (click)="bookRequested.emit('FULL')"
        >
          Réserver la journée
        </button>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResourcePanelComponent {
  readonly kind = input('Véhicule de fonction');
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly halves = input.required<Record<HalfKey, HalfAvailability>>();
  readonly viewerHalves = input<Record<HalfKey, boolean>>({ AM: false, PM: false });
  readonly busy = input(false);

  readonly bookRequested = output<HalfInput>();
  readonly closeRequested = output<void>();

  private readonly free = computed(() => ({
    AM: this.halves().AM.status === 'FREE',
    PM: this.halves().PM.status === 'FREE',
  }));

  protected canBook(half: HalfInput): boolean {
    const free = this.free();
    const viewer = this.viewerHalves();
    if (half === 'FULL') return free.AM && free.PM && !viewer.AM && !viewer.PM;
    return free[half] && !viewer[half];
  }

  protected halfText(half: HalfKey): string {
    const status = this.halves()[half];
    switch (status.status) {
      case 'FREE':
        return this.viewerHalves()[half] ? 'Vous avez déjà une réservation' : 'Libre';
      case 'MINE':
        return 'Votre réservation';
      case 'BOOKED':
        return `Réservé par ${status.holder}`;
    }
  }
}
