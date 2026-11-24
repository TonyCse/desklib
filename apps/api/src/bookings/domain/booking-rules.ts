import type { Half } from '@ilot/shared';

/**
 * Règles métier de réservation. Fonctions pures : pas de Nest, pas de Prisma, pas d'horloge
 * cachée (la date du jour et l'instant présent sont passés en paramètres). C'est ce qui permet
 * de les tester unitairement sans base de données.
 *
 * Convention : une date est une chaîne "YYYY-MM-DD" (jour civil, sans heure).
 */

export const PARIS_TZ = 'Europe/Paris';

/** Heure de début de chaque créneau, heure de Paris. */
export const SLOT_START_HOUR: Record<Half, number> = { AM: 9, PM: 14 };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse "YYYY-MM-DD" et rejette les dates inexistantes (ex. 2026-02-30). */
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  if (!date) throw new Error(`Date invalide : ${isoDate}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isWeekend(isoDate: string): boolean {
  const date = parseIsoDate(isoDate);
  if (!date) throw new Error(`Date invalide : ${isoDate}`);
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Jour civil de Paris correspondant à un instant donné. */
export function parisDateOf(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** Décalage de Paris (en minutes) à un instant UTC donné, heure d'été comprise. */
function parisOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PARIS_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return (asIfUtc - utcMs) / 60_000;
}

/** Instant réel où commence un créneau (9 h ou 14 h, heure de Paris). */
export function slotStartInstant(isoDate: string, half: Half): Date {
  const date = parseIsoDate(isoDate);
  if (!date) throw new Error(`Date invalide : ${isoDate}`);
  const localAsUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    SLOT_START_HOUR[half],
  );
  // Deux passes pour rester juste autour du passage à l'heure d'été.
  const first = localAsUtc - parisOffsetMinutes(localAsUtc) * 60_000;
  return new Date(localAsUtc - parisOffsetMinutes(first) * 60_000);
}

/**
 * Valide la date demandée. Retourne le message d'erreur lisible, ou null si la date est acceptable.
 */
export function validateBookingDate(input: {
  date: string;
  today: string;
  maxAdvanceDays: number;
}): string | null {
  if (!parseIsoDate(input.date)) return 'Date invalide';
  if (input.date < input.today) return 'Impossible de réserver un jour passé';
  if (isWeekend(input.date))
    return 'Les réservations se font uniquement les jours ouvrés';
  const lastAllowed = addDays(input.today, input.maxAdvanceDays);
  if (input.date > lastAllowed) {
    return `Réservation possible jusqu'à ${input.maxAdvanceDays} jours à l'avance`;
  }
  return null;
}

/**
 * Quota hebdomadaire : nombre de jours distincts sur site dans la semaine ISO.
 * `existingDates` contient les jours déjà réservés par le salarié ; on ajoute `date`.
 * Retourne le message d'erreur, ou null si le quota est respecté.
 */
export function checkWeeklyQuota(input: {
  date: string;
  existingDates: readonly string[];
  weeklyQuota: number;
}): string | null {
  const days = new Set(
    input.existingDates.filter((d) => isSameIsoWeek(d, input.date)),
  );
  days.add(input.date);
  if (days.size > input.weeklyQuota) {
    return `Quota atteint : ${input.weeklyQuota} jours sur site maximum par semaine`;
  }
  return null;
}

/** Annulation possible tant que le créneau n'a pas commencé. */
export function canCancelSlot(input: {
  now: Date;
  date: string;
  half: Half;
}): boolean {
  return (
    input.now.getTime() < slotStartInstant(input.date, input.half).getTime()
  );
}

/** Clé de semaine ISO, format "YYYY-Www" (ex. "2026-W48"). */
export function isoWeekKey(isoDate: string): string {
  const { year, week } = isoWeekParts(isoDate);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function isSameIsoWeek(a: string, b: string): boolean {
  return isoWeekKey(a) === isoWeekKey(b);
}

/** Lundi de la semaine ISO "YYYY-Www". Retourne null si le format est invalide. */
export function mondayOfIsoWeek(weekKey: string): string | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  // Le 4 janvier est toujours dans la semaine 1.
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Day = new Date(jan4).getUTCDay() || 7;
  const monday =
    jan4 - (jan4Day - 1) * 86_400_000 + (week - 1) * 7 * 86_400_000;
  return new Date(monday).toISOString().slice(0, 10);
}

function isoWeekParts(isoDate: string): { year: number; week: number } {
  const date = parseIsoDate(isoDate);
  if (!date) throw new Error(`Date invalide : ${isoDate}`);
  // Jeudi de la même semaine ISO : détermine l'année ISO.
  const day = date.getUTCDay() || 7;
  const thursday = new Date(date.getTime() + (4 - day) * 86_400_000);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1;
  return { year, week };
}
