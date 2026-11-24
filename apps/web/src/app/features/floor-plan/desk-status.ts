import type { DeskAvailability, HalfKey } from '../../core/models';

/**
 * Statut d'un poste pour la journée. Fonction pure, testée unitairement.
 * Chaque état est porté par un symbole ET un libellé : l'information ne passe pas que par la couleur.
 */
export type DeskState = 'FREE' | 'PARTIAL' | 'MINE' | 'BOOKED' | 'TEAM_RESERVED' | 'UNAVAILABLE';

export interface DeskStateMeta {
  symbol: string;
  label: string;
}

export const DESK_STATE_META: Record<DeskState, DeskStateMeta> = {
  FREE: { symbol: '○', label: 'Libre' },
  PARTIAL: { symbol: '◐', label: 'Partiellement libre' },
  MINE: { symbol: '✓', label: 'Mon poste' },
  BOOKED: { symbol: '●', label: 'Réservé' },
  TEAM_RESERVED: { symbol: '◆', label: 'Réservé à une équipe' },
  UNAVAILABLE: { symbol: '×', label: 'Indisponible' },
};

type DeskStatusInput = Pick<DeskAvailability, 'isActive' | 'halves' | 'reservedForOtherTeam'>;

export function deskState(desk: DeskStatusInput): DeskState {
  if (!desk.isActive) return 'UNAVAILABLE';
  const am = desk.halves.AM.status;
  const pm = desk.halves.PM.status;
  if (am === 'MINE' || pm === 'MINE') return 'MINE';
  const bothFree = am === 'FREE' && pm === 'FREE';
  if (bothFree && desk.reservedForOtherTeam) return 'TEAM_RESERVED';
  if (bothFree) return 'FREE';
  if (am === 'FREE' || pm === 'FREE') return 'PARTIAL';
  return 'BOOKED';
}

/** Phrase courte pour le nom accessible : « Poste A12, libre le matin ». */
export function deskSummary(desk: DeskStatusInput & { reservedTeamName?: string | null }): string {
  const state = deskState(desk);
  switch (state) {
    case 'FREE':
      return 'libre toute la journée';
    case 'PARTIAL':
      return desk.halves.AM.status === 'FREE' ? 'libre le matin' : 'libre l’après-midi';
    case 'MINE':
      return 'votre réservation';
    case 'BOOKED':
      return 'réservé';
    case 'TEAM_RESERVED':
      return desk.reservedTeamName
        ? `réservé à l’équipe ${desk.reservedTeamName}`
        : 'réservé à une équipe';
    case 'UNAVAILABLE':
      return 'indisponible';
  }
}

export function halfIsFree(desk: DeskStatusInput, half: HalfKey): boolean {
  return desk.isActive && !desk.reservedForOtherTeam && desk.halves[half].status === 'FREE';
}
