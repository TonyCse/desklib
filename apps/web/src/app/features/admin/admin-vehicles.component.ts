/* eslint-disable @typescript-eslint/unbound-method -- Validators.* sont statiques, sans `this` */
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../../shared/ui/button.component';
import { BadgeComponent } from '../../shared/ui/badge.component';
import { EmptyStateComponent, SkeletonComponent } from '../../shared/ui/feedback.components';
import { ToastService } from '../../core/notifications/toast.service';

interface AdminVehicle {
  id: string;
  name: string;
  plate: string;
  isActive: boolean;
}

const PLATE = /^[A-Z]{2}-\d{3}-[A-Z]{2}$/;

/** Véhicules de fonction : liste, ajout, modification, activation. */
@Component({
  selector: 'app-admin-vehicles',
  imports: [ReactiveFormsModule, ButtonComponent, BadgeComponent, EmptyStateComponent, SkeletonComponent],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-ink-muted">{{ vehicles()?.length ?? 0 }} véhicule(s)</p>
        <button ui-button type="button" (click)="startCreate()">Nouveau véhicule</button>
      </div>

      @if (editing(); as mode) {
        <form
          [formGroup]="form"
          (ngSubmit)="save()"
          class="grid gap-4 rounded-xl border border-line bg-surface p-5 shadow-card sm:grid-cols-3"
          aria-labelledby="vehicle-form-title"
        >
          <h2 id="vehicle-form-title" class="text-base font-semibold sm:col-span-3">
            {{ mode === 'create' ? 'Nouveau véhicule' : 'Modifier le véhicule' }}
          </h2>

          <label class="flex flex-col gap-1 text-sm font-medium">
            Nom
            <input class="field" formControlName="name" maxlength="60" placeholder="Peugeot 3008" />
          </label>
          <label class="flex flex-col gap-1 text-sm font-medium">
            Plaque
            <input class="field uppercase" formControlName="plate" placeholder="AA-123-AA" />
            <span class="text-xs font-normal text-ink-subtle">Format AA-123-AA.</span>
          </label>
          <label class="flex items-center gap-2 self-end text-sm font-medium">
            <input type="checkbox" class="h-4 w-4 accent-accent" formControlName="isActive" />
            Réservable
          </label>

          <div class="flex items-center justify-end gap-2 sm:col-span-3">
            <button ui-button variant="secondary" type="button" (click)="editing.set(null)">Annuler</button>
            <button ui-button type="submit" [disabled]="form.invalid || submitting()">
              {{ submitting() ? 'Enregistrement…' : 'Enregistrer' }}
            </button>
          </div>
        </form>
      }

      @if (vehicles() === null) {
        <div class="rounded-xl border border-line bg-surface p-5 shadow-card"><app-skeleton label="Chargement des véhicules" /></div>
      } @else if (vehicles()!.length === 0) {
        <app-empty-state title="Aucun véhicule" description="Ajoutez le premier véhicule de fonction." />
      } @else {
        <div class="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
          <table class="w-full min-w-120 text-sm">
            <caption class="sr-only">Véhicules de fonction</caption>
            <thead>
              <tr class="border-b border-line bg-canvas text-left text-ink-muted">
                <th scope="col" class="px-4 py-3 font-medium">Nom</th>
                <th scope="col" class="px-4 py-3 font-medium">Plaque</th>
                <th scope="col" class="px-4 py-3 font-medium">Statut</th>
                <th scope="col" class="px-4 py-3"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (vehicle of vehicles(); track vehicle.id) {
                <tr class="border-b border-line last:border-0">
                  <th scope="row" class="px-4 py-3 text-left font-semibold">{{ vehicle.name }}</th>
                  <td class="px-4 py-3 font-mono">{{ vehicle.plate }}</td>
                  <td class="px-4 py-3">
                    @if (vehicle.isActive) {
                      <span ui-badge tone="success">Réservable</span>
                    } @else {
                      <span ui-badge tone="neutral">Inactif</span>
                    }
                  </td>
                  <td class="px-4 py-3 text-right">
                    <div class="flex justify-end gap-2">
                      <button ui-button variant="secondary" size="sm" type="button" [attr.aria-label]="'Modifier ' + vehicle.name" (click)="startEdit(vehicle)">Modifier</button>
                      <button ui-button variant="ghost" size="sm" type="button" (click)="toggleActive(vehicle)">
                        {{ vehicle.isActive ? 'Désactiver' : 'Activer' }}
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminVehiclesComponent {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly vehicles = signal<AdminVehicle[] | null>(null);
  protected readonly editing = signal<'create' | 'edit' | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly submitting = signal(false);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(60)],
    }),
    plate: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(PLATE)],
    }),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    this.load();
  }

  protected startCreate(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', plate: '', isActive: true });
    this.editing.set('create');
  }

  protected startEdit(vehicle: AdminVehicle): void {
    this.editingId.set(vehicle.id);
    this.form.reset({ name: vehicle.name, plate: vehicle.plate, isActive: vehicle.isActive });
    this.editing.set('edit');
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const body = { name: raw.name.trim(), plate: raw.plate.trim().toUpperCase(), isActive: raw.isActive };
    const id = this.editingId();

    this.submitting.set(true);
    const request = id
      ? this.http.patch(`/api/admin/vehicles/${id}`, body)
      : this.http.post('/api/admin/vehicles', body);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.submitting.set(false);
        this.editing.set(null);
        this.toast.success(id ? 'Véhicule mis à jour.' : 'Véhicule ajouté.');
        this.load();
      },
      error: () => this.submitting.set(false),
    });
  }

  protected toggleActive(vehicle: AdminVehicle): void {
    this.http
      .patch(`/api/admin/vehicles/${vehicle.id}`, { isActive: !vehicle.isActive })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.toast.success(`${vehicle.name} ${vehicle.isActive ? 'désactivé' : 'activé'}.`);
        this.load();
      });
  }

  private load(): void {
    this.http
      .get<AdminVehicle[]>('/api/admin/vehicles')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((vehicles) => this.vehicles.set(vehicles));
  }
}
