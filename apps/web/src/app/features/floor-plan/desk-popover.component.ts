import { CdkTrapFocus } from '@angular/cdk/a11y';
import type { AfterViewInit, ElementRef } from '@angular/core';
import { ChangeDetectionStrategy, Component, input, output, viewChildren } from '@angular/core';
import type { HalfInput, HalfKey } from '../../core/models';
import { ButtonComponent } from '../../shared/ui/button.component';
import { BadgeComponent } from '../../shared/ui/badge.component';
import { DESK_STATE_META, halfIsFree } from './desk-status';
import type { DeskView } from './desk-view';

/**
 * Popover de réservation, ouvert au clic ou à Entrée sur un poste. Le focus est piégé
 * dedans (CDK A11y) et Échap le ferme ; le parent restitue le focus au poste d'origine.
 */
@Component({
  selector: 'app-desk-popover',
  imports: [CdkTrapFocus, ButtonComponent, BadgeComponent],
  templateUrl: './desk-popover.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeskPopoverComponent implements AfterViewInit {
  readonly desk = input.required<DeskView>();
  readonly dateLabel = input.required<string>();
  readonly busy = input(false);

  readonly bookRequested = output<HalfInput>();
  readonly closeRequested = output<void>();

  private readonly actions = viewChildren<ElementRef<HTMLButtonElement>>('action');

  protected readonly stateMeta = (state: DeskView['state']) => DESK_STATE_META[state];

  protected canBook(half: HalfInput): boolean {
    const desk = this.desk().availability;
    if (desk.reservedForOtherTeam || !desk.isActive) return false;
    if (half === 'FULL') return halfIsFree(desk, 'AM') && halfIsFree(desk, 'PM');
    return halfIsFree(desk, half);
  }

  protected halfText(half: HalfKey): string {
    const status = this.desk().availability.halves[half];
    switch (status.status) {
      case 'FREE':
        return 'Libre';
      case 'MINE':
        return 'Votre réservation';
      case 'BOOKED':
        return `Réservé par ${status.holder}`;
    }
  }

  ngAfterViewInit(): void {
    // Focus initial sur la première action possible, sinon sur le bouton Fermer.
    const first = this.actions().find((el) => !el.nativeElement.disabled);
    (first ?? this.actions().at(-1))?.nativeElement.focus();
  }
}
