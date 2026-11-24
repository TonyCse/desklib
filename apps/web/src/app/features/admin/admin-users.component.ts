/* eslint-disable @typescript-eslint/unbound-method -- Validators.* sont statiques, sans `this` */
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { Role } from '@desklib/shared';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent, SkeletonComponent } from '../../shared/ui/feedback.components';

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  teamId: string | null;
  team: { name: string; color: string } | null;
}

interface Team {
  id: string;
  name: string;
  color: string;
}

const ROLE_LABEL: Record<Role, string> = {
  EMPLOYEE: 'Salarié',
  MANAGER: 'Manager',
  ADMIN: 'Administrateur',
};

/**
 * Utilisateurs : création, changement de rôle et d’équipe. Chaque modification est tracée côté API.
 * Le mot de passe initial est saisi à la création et doit être transmis à la personne.
 */
@Component({
  selector: 'app-admin-users',
  imports: [ReactiveFormsModule, ButtonComponent, EmptyStateComponent, SkeletonComponent],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-ink-muted">{{ users()?.length ?? 0 }} utilisateur(s)</p>
        <button ui-button type="button" (click)="startCreate()">Nouvel utilisateur</button>
      </div>

      @if (creating()) {
        <form
          [formGroup]="form"
          (ngSubmit)="save()"
          class="grid gap-4 rounded-xl border border-line bg-surface p-5 shadow-card sm:grid-cols-2"
          aria-labelledby="user-form-title"
        >
          <h2 id="user-form-title" class="text-base font-semibold sm:col-span-2">Nouvel utilisateur</h2>

          <label class="flex flex-col gap-1 text-sm font-medium">
            Prénom
            <input class="field" formControlName="firstName" maxlength="60" autocomplete="off" />
          </label>
          <label class="flex flex-col gap-1 text-sm font-medium">
            Nom
            <input class="field" formControlName="lastName" maxlength="60" autocomplete="off" />
          </label>
          <label class="flex flex-col gap-1 text-sm font-medium">
            Email
            <input class="field" type="email" formControlName="email" maxlength="120" autocomplete="off" placeholder="prenom.nom@meridia.fr" />
          </label>
          <label class="flex flex-col gap-1 text-sm font-medium">
            Mot de passe initial
            <input class="field" type="password" formControlName="password" minlength="8" maxlength="128" autocomplete="new-password" />
            <span class="text-xs font-normal text-ink-subtle">8 caractères minimum.</span>
          </label>
          <label class="flex flex-col gap-1 text-sm font-medium">
            Rôle
            <select class="field" formControlName="role">
              @for (role of roles; track role) {
                <option [value]="role">{{ roleLabel[role] }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm font-medium">
            Équipe
            <select class="field" formControlName="teamId">
              <option value="">Aucune</option>
              @for (team of teams(); track team.id) {
                <option [value]="team.id">{{ team.name }}</option>
              }
            </select>
          </label>

          <div class="flex items-center justify-end gap-2 sm:col-span-2">
            <button ui-button variant="secondary" type="button" (click)="creating.set(false)">Annuler</button>
            <button ui-button type="submit" [disabled]="form.invalid || submitting()">
              {{ submitting() ? 'Création…' : 'Créer le compte' }}
            </button>
          </div>
        </form>
      }

      @if (users() === null) {
        <div class="rounded-xl border border-line bg-surface p-5 shadow-card">
          <app-skeleton label="Chargement des utilisateurs" />
        </div>
      } @else if (users()!.length === 0) {
        <app-empty-state title="Aucun utilisateur" />
      } @else {
        <div class="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
          <table class="w-full min-w-180 text-sm">
            <caption class="sr-only">
              Utilisateurs et rattachements
            </caption>
            <thead>
              <tr class="border-b border-line bg-canvas text-left text-ink-muted">
                <th scope="col" class="px-4 py-3 font-medium">Nom</th>
                <th scope="col" class="px-4 py-3 font-medium">Email</th>
                <th scope="col" class="px-4 py-3 font-medium">Rôle</th>
                <th scope="col" class="px-4 py-3 font-medium">Équipe</th>
              </tr>
            </thead>
            <tbody>
              @for (user of users(); track user.id) {
                <tr class="border-b border-line last:border-0">
                  <th scope="row" class="px-4 py-3 text-left font-medium whitespace-nowrap">
                    {{ user.firstName }} {{ user.lastName }}
                    @if (user.id === me()) {
                      <span class="text-xs text-ink-subtle">(vous)</span>
                    }
                  </th>
                  <td class="px-4 py-3 text-ink-muted">{{ user.email }}</td>
                  <td class="px-4 py-3">
                    <label class="sr-only" [attr.for]="'role-' + user.id"
                      >Rôle de {{ user.firstName }} {{ user.lastName }}</label
                    >
                    <select
                      [id]="'role-' + user.id"
                      class="field w-auto"
                      [value]="user.role"
                      [disabled]="user.id === me()"
                      (change)="setRole(user, $any($event.target).value)"
                    >
                      @for (role of roles; track role) {
                        <option [value]="role">{{ roleLabel[role] }}</option>
                      }
                    </select>
                  </td>
                  <td class="px-4 py-3">
                    <label class="sr-only" [attr.for]="'team-' + user.id"
                      >Équipe de {{ user.firstName }} {{ user.lastName }}</label
                    >
                    <select
                      [id]="'team-' + user.id"
                      class="field w-auto"
                      [value]="user.teamId ?? ''"
                      (change)="setTeam(user, $any($event.target).value)"
                    >
                      <option value="">Aucune</option>
                      @for (team of teams(); track team.id) {
                        <option [value]="team.id">{{ team.name }}</option>
                      }
                    </select>
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
export class AdminUsersComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly roles: Role[] = ['EMPLOYEE', 'MANAGER', 'ADMIN'];
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly me = computed(() => this.auth.user()?.id ?? '');
  protected readonly users = signal<AdminUser[] | null>(null);
  protected readonly teams = signal<Team[]>([]);
  protected readonly creating = signal(false);
  protected readonly submitting = signal(false);

  protected readonly form = new FormGroup({
    firstName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(60)],
    }),
    lastName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(60)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(120)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(128)],
    }),
    role: new FormControl<Role>('EMPLOYEE', { nonNullable: true, validators: [Validators.required] }),
    teamId: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.load();
    this.http
      .get<Team[]>('/api/admin/teams')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((teams) => this.teams.set(teams));
  }

  protected startCreate(): void {
    this.form.reset({ firstName: '', lastName: '', email: '', password: '', role: 'EMPLOYEE', teamId: '' });
    this.creating.set(true);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const body = {
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      email: raw.email.trim().toLowerCase(),
      password: raw.password,
      role: raw.role,
      teamId: raw.teamId || null,
    };

    this.submitting.set(true);
    this.http
      .post('/api/admin/users', body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.creating.set(false);
          this.toast.success('Compte créé.');
          this.load();
        },
        error: () => this.submitting.set(false),
      });
  }

  protected setRole(user: AdminUser, role: string): void {
    this.patch(user, { role: role as Role }, 'Rôle mis à jour.');
  }

  protected setTeam(user: AdminUser, teamId: string): void {
    this.patch(user, { teamId: teamId || null }, 'Équipe mise à jour.');
  }

  private patch(
    user: AdminUser,
    body: { role?: Role; teamId?: string | null },
    message: string,
  ): void {
    this.http
      .patch(`/api/admin/users/${user.id}`, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(message);
          this.load();
        },
        // Erreur : on recharge pour remettre la valeur réelle dans le select.
        error: () => this.load(),
      });
  }

  private load(): void {
    this.http
      .get<AdminUser[]>('/api/admin/users')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((users) => this.users.set(users));
  }
}
