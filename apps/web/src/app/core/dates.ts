/**
 * Utilitaires de dates. Convention : une date est une chaîne "YYYY-MM-DD" (jour civil).
 * Les calculs se font en UTC pour éviter les décalages liés au fuseau du navigateur.
 */

const DAY_MS = 86_400_000;

export function todayIso(now: Date = new Date()): string {
  return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function addDaysIso(iso: string, days: number): string {
  return toIso(new Date(parseUtc(iso).getTime() + days * DAY_MS));
}

export function isWeekendIso(iso: string): boolean {
  const day = parseUtc(iso).getUTCDay();
  return day === 0 || day === 6;
}

/** Jours ouvrés de aujourd'hui à aujourd'hui + maxAdvanceDays inclus. */
export function workdaysFrom(today: string, maxAdvanceDays: number): string[] {
  const days: string[] = [];
  for (let offset = 0; offset <= maxAdvanceDays; offset++) {
    const iso = addDaysIso(today, offset);
    if (!isWeekendIso(iso)) days.push(iso);
  }
  return days;
}

export function mondayOfIso(iso: string): string {
  const day = parseUtc(iso).getUTCDay() || 7;
  return addDaysIso(iso, -(day - 1));
}

/** Clé de semaine ISO "YYYY-Www", même convention que l'API. */
export function isoWeekKey(iso: string): string {
  const date = parseUtc(iso);
  const day = date.getUTCDay() || 7;
  const thursday = new Date(date.getTime() + (4 - day) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function formatDayFr(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(parseUtc(iso));
}

export function formatShortDayFr(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(parseUtc(iso));
}

export function formatRangeFr(mondayIso: string): string {
  const friday = addDaysIso(mondayIso, 4);
  const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt.format(parseUtc(mondayIso))} – ${fmt.format(parseUtc(friday))}`;
}

function parseUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
