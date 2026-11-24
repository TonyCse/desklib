import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { Role } from '@desklib/shared';
import { AuthService } from '../auth/auth.service';
import { ToastContainerComponent } from '../../shared/ui/toast-container.component';

interface NavItem {
  label: string;
  path: string;
  roles: readonly Role[];
}

const NAV: NavItem[] = [
  { label: 'Plan d’étage', path: '/plan', roles: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
  { label: 'Véhicules de fonction', path: '/vehicules', roles: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
  { label: 'Mes réservations', path: '/mes-reservations', roles: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
  { label: 'Planning d’équipe', path: '/equipe', roles: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
  { label: 'Administration', path: '/admin', roles: ['ADMIN'] },
];

/** Coque de l'application : sidebar filtrée selon le rôle, topbar, zone de contenu. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastContainerComponent],
  templateUrl: './shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.user;

  protected navItems(): NavItem[] {
    const role = this.auth.role();
    return NAV.filter((item) => role !== null && item.roles.includes(role));
  }

  protected roleLabel(role: Role | null): string {
    switch (role) {
      case 'ADMIN':
        return 'Administrateur';
      case 'MANAGER':
        return 'Manager';
      case 'EMPLOYEE':
        return 'Salarié';
      default:
        return '';
    }
  }

  protected logout(): void {
    this.auth.logout().subscribe(() => {
      void this.router.navigate(['/connexion']);
    });
  }
}
