/* eslint-disable @typescript-eslint/unbound-method -- Validators.* sont statiques, sans `this` */
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../../shared/ui/button.component';
import { BadgeComponent } from '../../shared/ui/badge.component';
import { EmptyStateComponent, SkeletonComponent } from '../../shared/ui/feedback.components';
import { ToastService } from '../../core/notifications/toast.service';
import type { FloorSummary } from '../../core/models';

interface AdminDesk {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  features: string[];
  isActive: boolean;
  reservedTeamId: string | null;
  floor: { id: string; name: string };
  reservedTeam: { id: string; name: string } | null;
}

interface Team {
  id: string;
  name: string;
  color: string;
}

/** Liste et formulaire des postes : création, modification, activation. */
@Component({
  selector: 'app-admin-desks',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    BadgeComponent,
    EmptyStateComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-ink-muted">{{ desks()?.length ?? 0 }} poste(s)</p>
        <button ui-button type="button" (click)="startCreate()">Nouveau poste</button>
      </div>

      @if (editing(); as mode) {
        <form
          [formGroup]="form"
          (ngSubmit)="save()"
          class="grid gap-4 rounded-xl border border-line bg-surface p-5 shadow-card sm:grid-cols-2 lg:grid-cols-4"
          aria-labelledby="desk-form-title"
        >
          <h2 id="desk-form-title" class="text-base font-semibold sm:col-span-2 lg:col-span-4">
            {{ mode === 'create' ? 'Nouveau poste' : 'Modifier le poste ' + editingLabel() }}
          </h2>

          <label class="flex flex-col gap-1 text-sm font-medium">
            Libellé
            <input class="field" formControlName="label" maxlength="16" />
          </label>
          <label class="flex flex-col gap-1 text-sm font-medium">
            Étage
            <select class="field" formControlName="floorId">
              @for (f of floors(); track f.id) {
                <option [value]="f.id">{{ f.name }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm font-medium">
            Équipe réservée
            <select class="field" formControlName="reservedTeamId">
              <option value="">Ouvert à tous</option>
              @for (t of teams(); track t.id) {
                <option [value]="t.id">{{ t.name }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm font-medium">
            Équipements (séparés par des virgules)
            <input class="field" formControlName="features" />
          </label>

          <label class="flex flex-col gap-1 text-sm font-medium"
            >Position x <input type="number" class="field" formControlName="x"
          /></label>
          <label class="flex flex-col gap-1 text-sm font-medium"
            >Position y <input type="number" class="field" formControlName="y"
          /></label>
          <label class="flex flex-col gap-1 text-sm font-medium"
            >Largeur <input type="number" class="field" formControlName="width"
          /></label>
          <label class="flex flex-col gap-1 text-sm font-medium"
            >Hauteur <input type="number" class="field" formControlName="height"
          /></label>

          <label class="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <input type="checkbox" class="h-4 w-4 accent-accent" formControlName="isActive" />
            Poste actif (réservable)
          </label>

          <div class="flex items-center justify-end gap-2 sm:col-span-2 lg:col-span-4">
            <button ui-button variant="secondary" type="button" (click)="cancel()">Annuler</button>
            <button ui-button type="submit" [disabled]="form.invalid || submitting()">
              {{ submitting() ? 'Enregistrement…' : 'Enregistrer' }}
            </button>
          </div>
        </form>
      }

      @if (desks() === null) {
        <div class="rounded-xl border border-line bg-surface p-5 shadow-card">
          <app-skeleton label="Chargement des postes" />
        </div>
      } @else if (desks()!.length === 0) {
        <app-empty-state
          title="Aucun poste"
          description="Créez le premier poste pour ouvrir le plan."
        />
      } @else {
        <div class="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
          <table class="w-full min-w-180 text-sm">
            <caption class="sr-only">
              Liste des postes
            </caption>
            <thead>
              <tr class="border-b border-line bg-canvas text-left text-ink-muted">
                <th scope="col" class="px-4 py-3 font-medium">Poste</th>
                <th scope="col" class="px-4 py-3 font-medium">Étage</th>
                <th scope="col" class="px-4 py-3 font-medium">Équipements</th>
                <th scope="col" class="px-4 py-3 font-medium">Réservation</th>
                <th scope="col" class="px-4 py-3 font-medium">Statut</th>
                <th scope="col" class="px-4 py-3"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (desk of desks(); track desk.id) {
                <tr class="border-b border-line last:border-0">
                  <th scope="row" class="px-4 py-3 text-left font-semibold">{{ desk.label }}</th>
                  <td class="px-4 py-3">{{ desk.floor.name }}</td>
                  <td class="px-4 py-3 text-ink-muted">{{ desk.features.join(', ') || '—' }}</td>
                  <td class="px-4 py-3">{{ desk.reservedTeam?.name ?? 'Ouvert à tous' }}</td>
                  <td class="px-4 py-3">
                    @if (desk.isActive) {
                      <span ui-badge tone="success">Actif</span>
                    } @else {
                      <span ui-badge tone="neutral">Inactif</span>
                    }
                  </td>
                  <td class="px-4 py-3 text-right">
                    <div class="flex justify-end gap-2">
                      <button
                        ui-button
                        variant="secondary"
                        size="sm"
                        type="button"
                        [attr.aria-label]="'Modifier le poste ' + desk.label"
                        (click)="startEdit(desk)"
                      >
                        Modifier
                      </button>
                      <button
                        ui-button
                        variant="ghost"
                        size="sm"
                        type="button"
                        (click)="toggleActive(desk)"
                      >
                        {{ desk.isActive ? 'Désactiver' : 'Activer' }}
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
export class AdminDesksComponent {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly desks = signal<AdminDesk[] | null>(null);
  protected readonly floors = signal<FloorSummary[]>([]);
  protected readonly teams = signal<Team[]>([]);
  protected readonly editing = signal<'create' | 'edit' | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingLabel = signal('');
  protected readonly submitting = signal(false);

  protected readonly form = new FormGroup({
    label: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(16)],
    }),
    floorId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    reservedTeamId: new FormControl('', { nonNullable: true }),
    features: new FormControl('', { nonNullable: true }),
    x: new FormControl(0, { nonNullable: true, validators: [Validators.required] }),
    y: new FormControl(0, { nonNullable: true, validators: [Validators.required] }),
    width: new FormControl(46, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(10)],
    }),
    height: new FormControl(50, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(10)],
    }),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    this.load();
    this.http
      .get<FloorSummary[]>('/api/floors')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((f) => this.floors.set(f));
    this.http
      .get<Team[]>('/api/admin/teams')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((t) => this.teams.set(t));
  }

  protected startCreate(): void {
    this.editingId.set(null);
    this.editingLabel.set('');
    this.form.reset({
      label: '',
      floorId: this.floors()[0]?.id ?? '',
      reservedTeamId: '',
      features: '',
      x: 0,
      y: 0,
      width: 46,
      height: 50,
      isActive: true,
    });
    this.editing.set('create');
  }

  protected startEdit(desk: AdminDesk): void {
    this.editingId.set(desk.id);
    this.editingLabel.set(desk.label);
    this.form.reset({
      label: desk.label,
      floorId: desk.floor.id,
      reservedTeamId: desk.reservedTeamId ?? '',
      features: desk.features.join(', '),
      x: desk.x,
      y: desk.y,
      width: desk.width,
      height: desk.height,
      isActive: desk.isActive,
    });
    this.editing.set('edit');
  }

  protected cancel(): void {
    this.editing.set(null);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const body = {
      label: raw.label.trim(),
      floorId: raw.floorId,
      reservedTeamId: raw.reservedTeamId || null,
      features: raw.features
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f.length > 0),
      x: Number(raw.x),
      y: Number(raw.y),
      width: Number(raw.width),
      height: Number(raw.height),
      isActive: raw.isActive,
    };

    this.submitting.set(true);
    const id = this.editingId();
    const request = id
      ? this.http.patch(`/api/admin/desks/${id}`, body)
      : this.http.post('/api/admin/desks', body);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.submitting.set(false);
        this.editing.set(null);
        this.toast.success(id ? 'Poste mis à jour.' : 'Poste créé.');
        this.load();
      },
      error: () => this.submitting.set(false),
    });
  }

  protected toggleActive(desk: AdminDesk): void {
    this.http
      .patch(`/api/admin/desks/${desk.id}`, { isActive: !desk.isActive })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.toast.success(`Poste ${desk.label} ${desk.isActive ? 'désactivé' : 'activé'}.`);
        this.load();
      });
  }

  private load(): void {
    this.http
      .get<AdminDesk[]>('/api/admin/desks')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((desks) => this.desks.set(desks));
  }
}
