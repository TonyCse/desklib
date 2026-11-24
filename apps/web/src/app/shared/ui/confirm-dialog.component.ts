import { CdkTrapFocus } from '@angular/cdk/a11y';
import type { AfterViewInit, ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
  viewChild,
} from '@angular/core';
import { ButtonComponent } from './button.component';

/**
 * Boîte de confirmation accessible : rôle dialog, focus piégé (CDK A11y),
 * Échap pour annuler, focus initial sur l'action la moins destructive.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [CdkTrapFocus, ButtonComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        cdkTrapFocus
        role="alertdialog"
        aria-modal="true"
        [attr.aria-labelledby]="'confirm-title'"
        [attr.aria-describedby]="'confirm-desc'"
        class="w-full max-w-md rounded-xl bg-surface p-6 shadow-pop"
      >
        <h2 id="confirm-title" class="text-lg font-semibold text-ink">{{ title() }}</h2>
        <p id="confirm-desc" class="mt-2 text-sm text-ink-muted">{{ message() }}</p>
        <div class="mt-6 flex justify-end gap-2">
          <button
            #cancelButton
            ui-button
            variant="secondary"
            type="button"
            (click)="cancelled.emit()"
          >
            Annuler
          </button>
          <button ui-button variant="danger" type="button" (click)="confirmed.emit()">
            {{ confirmLabel() }}
          </button>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent implements AfterViewInit {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Confirmer');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly cancelButton = viewChild.required<ElementRef<HTMLButtonElement>>('cancelButton');

  ngAfterViewInit(): void {
    this.cancelButton().nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.cancelled.emit();
  }
}
