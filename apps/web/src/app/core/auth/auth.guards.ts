import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import type { Role } from '@desklib/shared';
import { AuthService } from './auth.service';

/** Redirige vers la connexion si aucune session n'est active. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureSession();
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/connexion'], { queryParams: { retour: state.url } });
};

/**
 * Garde d'UX : masque les écrans hors de portée. L'API applique la même règle (@Roles)
 * et reste la seule source de vérité.
 */
export const roleGuard =
  (...allowed: Role[]): CanActivateFn =>
  async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.ensureSession();
    const role = auth.role();
    if (role !== null && allowed.includes(role)) return true;
    return router.createUrlTree(['/plan']);
  };
