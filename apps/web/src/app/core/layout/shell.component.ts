import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { Role } from '@desklib/shared';
import { AuthService } from '../auth/auth.service';
import { ToastContainerComponent } from '../../shared/ui/toast-container.component';
import { LayoutService } from './layout.service';
import { navItemsFor } from './nav';

/** Coque de l'application : sidebar et barre de titre, masquées en mode immersif. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastContainerComponent],
  templateUrl: './shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly layout = inject(LayoutService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.user;
  protected readonly immersive = this.layout.immersive;
  protected readonly navItems = computed(() => navItemsFor(this.auth.role()));

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
