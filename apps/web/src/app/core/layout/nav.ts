import type { Role } from '@desklib/shared';

export interface NavItem {
  label: string;
  path: string;
  roles: readonly Role[];
}

/** Navigation principale : une seule source pour la sidebar et la barre flottante. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Plan d’étage', path: '/plan', roles: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
  { label: 'Véhicules de fonction', path: '/vehicules', roles: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
  { label: 'Mes réservations', path: '/mes-reservations', roles: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
  { label: 'Planning d’équipe', path: '/equipe', roles: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
  { label: 'Administration', path: '/admin', roles: ['ADMIN'] },
];

export function navItemsFor(role: Role | null): NavItem[] {
  return NAV_ITEMS.filter((item) => role !== null && item.roles.includes(role));
}
