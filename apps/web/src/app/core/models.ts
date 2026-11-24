import type { Role } from '@ilot/shared';

/** Utilisateur connecté, tel que renvoyé par GET /api/auth/me (jamais de mot de passe). */
export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  teamId: string | null;
  teamName: string | null;
  teamColor: string | null;
}

export interface Settings {
  maxAdvanceDays: number;
  weeklyQuota: number;
}

export interface FloorSummary {
  id: string;
  name: string;
  deskCount: number;
}

export type HalfKey = 'AM' | 'PM';
export type HalfInput = HalfKey | 'FULL';

export type HalfAvailability =
  { status: 'FREE' } | { status: 'MINE'; holder: string } | { status: 'BOOKED'; holder: string };

export interface DeskAvailability {
  id: string;
  label: string;
  features: string[];
  isActive: boolean;
  reservedTeam: { id: string; name: string } | null;
  reservedForOtherTeam: boolean;
  halves: Record<HalfKey, HalfAvailability>;
}

export interface Availability {
  date: string;
  desks: DeskAvailability[];
}

export interface FloorDetail {
  id: string;
  name: string;
  width: number;
  height: number;
  zones: { name: string; kind: string; x: number; y: number; width: number; height: number }[];
  desks: {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    features: string[];
    isActive: boolean;
    reservedTeam: { id: string; name: string; color: string } | null;
  }[];
}

export interface MyBooking {
  id: string;
  date: string;
  status: 'ACTIVE' | 'CANCELLED';
  deskLabel: string;
  floorName: string;
  halves: HalfKey[];
  cancellable: boolean;
}

export interface TeamPlanning {
  week: string;
  team: { id: string; name: string; color: string };
  days: string[];
  members: {
    id: string;
    name: string;
    role: Role;
    days: { date: string; am: string | null; pm: string | null }[];
  }[];
  presenceRate: number | null;
}
