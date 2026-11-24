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
import type { Role } from '@ilot/shared';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
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

/** Utilisateurs : changement de rôle et d’équipe. Chaque modification est tracée côté API. */
@Component({
  selector: 'app-admin-users',
  imports: [EmptyStateComponent, SkeletonComponent],
  template: `
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

  constructor() {
    this.load();
    this.http
      .get<Team[]>('/api/admin/teams')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((teams) => this.teams.set(teams));
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
