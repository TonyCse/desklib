import type { DeskAvailability } from '../../core/models';
import type { DeskState } from './desk-status';
import { deskState, deskSummary } from './desk-status';

/** Un poste prêt à l'affichage : géométrie (plan) + disponibilité (API) + statut calculé. */
export interface DeskView {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zone: string;
  features: string[];
  state: DeskState;
  ariaLabel: string;
  reservedTeamName: string | null;
  availability: DeskAvailability;
}

export function buildDeskView(
  geometry: { id: string; label: string; x: number; y: number; width: number; height: number },
  availability: DeskAvailability,
  zone: string,
): DeskView {
  const reservedTeamName = availability.reservedTeam?.name ?? null;
  const summary = deskSummary({ ...availability, reservedTeamName });
  return {
    id: geometry.id,
    label: geometry.label,
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    zone,
    features: availability.features,
    state: deskState(availability),
    ariaLabel: `Poste ${geometry.label}, ${summary}`,
    reservedTeamName,
    availability,
  };
}
