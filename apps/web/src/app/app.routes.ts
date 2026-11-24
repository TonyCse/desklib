import type { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth/auth.guards';
import { ShellComponent } from './core/layout/shell.component';
import { LoginComponent } from './features/login/login.component';

/**
 * Routes lazy-loadées : chaque écran est un chunk téléchargé à la première visite.
 * Les gardes d'UX (authGuard, roleGuard) doublent les contrôles de l'API, sans les remplacer.
 */
export const routes: Routes = [
  { path: 'connexion', component: LoginComponent, title: 'Connexion · Îlot' },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'plan' },
      {
        path: 'plan',
        title: 'Plan d’étage · Îlot',
        loadComponent: () =>
          import('./features/floor-plan/floor-plan.page').then((m) => m.FloorPlanPage),
      },
      {
        path: 'mes-reservations',
        title: 'Mes réservations · Îlot',
        loadComponent: () =>
          import('./features/my-bookings/my-bookings.page').then((m) => m.MyBookingsPage),
      },
      {
        path: 'equipe',
        title: 'Planning d’équipe · Îlot',
        loadComponent: () =>
          import('./features/team-planning/team-planning.page').then((m) => m.TeamPlanningPage),
      },
      {
        path: 'admin',
        title: 'Administration · Îlot',
        canActivate: [roleGuard('ADMIN')],
        loadComponent: () => import('./features/admin/admin.page').then((m) => m.AdminPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
