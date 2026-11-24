/* eslint-disable @typescript-eslint/unbound-method -- Validators.* sont statiques, sans `this` */
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../../shared/ui/button.component';
import { ToastService } from '../../core/notifications/toast.service';
import type { Settings } from '../../core/models';

/** Règles de réservation : délai maximum et quota hebdomadaire. */
@Component({
  selector: 'app-admin-rules',
  imports: [ReactiveFormsModule, ButtonComponent],
  template: `
    <section
      class="max-w-xl rounded-xl border border-line bg-surface p-6 shadow-card"
      aria-labelledby="rules-title"
    >
      <h2 id="rules-title" class="text-base font-semibold">Règles de réservation</h2>
      <p class="mt-1 text-sm text-ink-muted">
        Ces règles s’appliquent à toutes les réservations, côté API.
      </p>

      <form [formGroup]="form" (ngSubmit)="save()" class="mt-5 flex flex-col gap-5">
        <label class="flex flex-col gap-1 text-sm font-medium">
          Délai maximum de réservation (jours)
          <input type="number" min="1" max="60" class="field" formControlName="maxAdvanceDays" />
          <span class="text-xs font-normal text-ink-subtle">Entre 1 et 60 jours à l’avance.</span>
        </label>

        <label class="flex flex-col gap-1 text-sm font-medium">
          Quota de jours sur site par semaine
          <input type="number" min="1" max="7" class="field" formControlName="weeklyQuota" />
          <span class="text-xs font-normal text-ink-subtle"
            >Nombre de jours distincts par semaine ISO.</span
          >
        </label>

        <div class="flex justify-end">
          <button ui-button type="submit" [disabled]="form.invalid || saving()">
            {{ saving() ? 'Enregistrement…' : 'Enregistrer les règles' }}
          </button>
        </div>
      </form>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRulesComponent {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly saving = signal(false);
  protected readonly form = new FormGroup({
    maxAdvanceDays: new FormControl(14, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(60)],
    }),
    weeklyQuota: new FormControl(3, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(7)],
    }),
  });

  constructor() {
    this.http
      .get<Settings>('/api/admin/settings')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((s) => this.form.reset(s));
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.http
      .patch<Settings>('/api/admin/settings', this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          this.saving.set(false);
          this.form.reset(s);
          this.toast.success('Règles enregistrées.');
        },
        error: () => this.saving.set(false),
      });
  }
}
