import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { HalfInput, HalfKey } from '../../core/models';
import { ButtonComponent } from '../../shared/ui/button.component';
import { BadgeComponent } from '../../shared/ui/badge.component';
import { DESK_STATE_META, halfIsFree } from './desk-status';
import type { DeskView } from './desk-view';

/**
 * Panneau de détail d'un poste, affiché à côté du plan. Il présente l'état, les équipements
 * et les actions de réservation. Échap (géré par la page) le ferme.
 */
@Component({
  selector: 'app-desk-popover',
  imports: [ButtonComponent, BadgeComponent],
  templateUrl: './desk-popover.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeskPopoverComponent {
  readonly desk = input.required<DeskView>();
  readonly dateLabel = input.required<string>();
  readonly busy = input(false);
  /** Demi-journées déjà réservées par le visiteur ce jour-là, sur n'importe quel poste. */
  readonly viewerHalves = input<Record<HalfKey, boolean>>({ AM: false, PM: false });

  readonly bookRequested = output<HalfInput>();
  readonly closeRequested = output<void>();

  protected readonly stateMeta = (state: DeskView['state']) => DESK_STATE_META[state];

  protected canBook(half: HalfInput): boolean {
    const desk = this.desk().availability;
    if (desk.reservedForOtherTeam || !desk.isActive) return false;
    const halves: HalfKey[] = half === 'FULL' ? ['AM', 'PM'] : [half];
    return halves.every((h) => halfIsFree(desk, h) && !this.viewerHalves()[h]);
  }

  protected halfText(half: HalfKey): string {
    const status = this.desk().availability.halves[half];
    switch (status.status) {
      case 'FREE':
        return this.viewerHalves()[half] ? 'Vous avez déjà un poste' : 'Libre';
      case 'MINE':
        return 'Votre réservation';
      case 'BOOKED':
        return `Réservé par ${status.holder}`;
    }
  }
}
