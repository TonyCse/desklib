import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/notifications/toast.service';

/** Zone live : les lecteurs d'écran annoncent les succès et erreurs sans déplacer le focus. */
@Component({
  selector: 'app-toast-container',
  template: `
    <div
      class="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4"
      aria-live="polite"
      role="status"
    >
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-surface p-3 shadow-pop sm:w-96"
          [class.border-success]="toast.kind === 'success'"
          [class.border-danger]="toast.kind === 'error'"
          [class.border-line]="toast.kind === 'info'"
        >
          <span
            aria-hidden="true"
            class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            [class.bg-success]="toast.kind === 'success'"
            [class.bg-danger]="toast.kind === 'error'"
            [class.bg-accent]="toast.kind === 'info'"
            >{{ toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : 'i' }}</span
          >
          <p class="flex-1 text-sm text-ink">{{ toast.message }}</p>
          <button
            type="button"
            class="rounded px-1 text-ink-muted hover:text-ink"
            (click)="toasts.dismiss(toast.id)"
            aria-label="Fermer la notification"
          >
            ×
          </button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastContainerComponent {
  protected readonly toasts = inject(ToastService);
}
