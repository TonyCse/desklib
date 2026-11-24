import { describe, expect, it } from 'vitest';
import {
  addDays,
  canCancelSlot,
  checkWeeklyQuota,
  isoWeekKey,
  isWeekend,
  mondayOfIsoWeek,
  parisDateOf,
  parseIsoDate,
  slotStartInstant,
  validateBookingDate,
} from './booking-rules.js';

describe('parseIsoDate', () => {
  it('accepte une date réelle', () => {
    expect(parseIsoDate('2026-11-24')).not.toBeNull();
  });

  it('rejette les dates inexistantes et les formats invalides', () => {
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('24/11/2026')).toBeNull();
  });
});

describe('isWeekend', () => {
  it('détecte samedi et dimanche', () => {
    expect(isWeekend('2026-11-28')).toBe(true); // samedi
    expect(isWeekend('2026-11-29')).toBe(true); // dimanche
    expect(isWeekend('2026-11-27')).toBe(false); // vendredi
  });
});

describe('validateBookingDate', () => {
  const today = '2026-11-24'; // mardi

  it('refuse un jour passé', () => {
    expect(
      validateBookingDate({ date: '2026-11-23', today, maxAdvanceDays: 14 }),
    ).toMatch(/passé/);
  });

  it('refuse le week-end', () => {
    expect(
      validateBookingDate({ date: '2026-11-28', today, maxAdvanceDays: 14 }),
    ).toMatch(/ouvrés/);
  });

  it('accepte J+14 et refuse J+15', () => {
    const j14 = addDays(today, 14);
    const j15 = addDays(today, 15);
    // 2026-12-08 est un mardi : jour ouvré valide.
    expect(
      validateBookingDate({ date: j14, today, maxAdvanceDays: 14 }),
    ).toBeNull();
    expect(
      validateBookingDate({ date: j15, today, maxAdvanceDays: 14 }),
    ).toMatch(/14 jours/);
  });

  it("accepte aujourd'hui", () => {
    expect(
      validateBookingDate({ date: today, today, maxAdvanceDays: 14 }),
    ).toBeNull();
  });
});

describe('checkWeeklyQuota', () => {
  // Semaine ISO 48 de 2026 : lundi 23 au vendredi 27 novembre.
  it('autorise jusqu’au quota inclus', () => {
    const existing = ['2026-11-23', '2026-11-24'];
    expect(
      checkWeeklyQuota({
        date: '2026-11-25',
        existingDates: existing,
        weeklyQuota: 3,
      }),
    ).toBeNull();
  });

  it('refuse le jour qui dépasse le quota', () => {
    const existing = ['2026-11-23', '2026-11-24', '2026-11-25'];
    expect(
      checkWeeklyQuota({
        date: '2026-11-26',
        existingDates: existing,
        weeklyQuota: 3,
      }),
    ).toMatch(/Quota atteint/);
  });

  it('ne compte pas deux fois le même jour (matin + après-midi)', () => {
    const existing = ['2026-11-23', '2026-11-24', '2026-11-25'];
    expect(
      checkWeeklyQuota({
        date: '2026-11-25',
        existingDates: existing,
        weeklyQuota: 3,
      }),
    ).toBeNull();
  });

  it("ignore les jours d'une autre semaine ISO", () => {
    const existing = ['2026-11-16', '2026-11-17', '2026-11-18'];
    expect(
      checkWeeklyQuota({
        date: '2026-11-23',
        existingDates: existing,
        weeklyQuota: 3,
      }),
    ).toBeNull();
  });
});

describe('semaines ISO', () => {
  it('calcule la clé de semaine, y compris au changement d’année', () => {
    expect(isoWeekKey('2026-11-24')).toBe('2026-W48');
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53'); // vendredi 1er janvier 2027
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01'); // jeudi 1er janvier 2026
  });

  it('retrouve le lundi d’une semaine', () => {
    expect(mondayOfIsoWeek('2026-W48')).toBe('2026-11-23');
    expect(mondayOfIsoWeek('2026-W01')).toBe('2025-12-29');
    expect(mondayOfIsoWeek('2026-W99')).toBeNull();
  });
});

describe('fuseau horaire Europe/Paris', () => {
  it('convertit correctement en hiver (UTC+1) : 9 h Paris = 08 h UTC', () => {
    expect(slotStartInstant('2026-11-24', 'AM').toISOString()).toBe(
      '2026-11-24T08:00:00.000Z',
    );
  });

  it('convertit correctement en été (UTC+2) : 14 h Paris = 12 h UTC', () => {
    expect(slotStartInstant('2026-07-06', 'PM').toISOString()).toBe(
      '2026-07-06T12:00:00.000Z',
    );
  });

  it('donne le jour civil de Paris, même proche de minuit UTC', () => {
    // 23:30 UTC le 24 nov = 00:30 à Paris le 25 nov.
    expect(parisDateOf(new Date('2026-11-24T23:30:00.000Z'))).toBe(
      '2026-11-25',
    );
  });
});

describe('canCancelSlot', () => {
  it('autorise l’annulation avant le début du créneau', () => {
    const now = new Date('2026-11-24T07:59:00.000Z'); // 8 h 59 à Paris
    expect(canCancelSlot({ now, date: '2026-11-24', half: 'AM' })).toBe(true);
  });

  it('refuse l’annulation une fois le créneau commencé', () => {
    const now = new Date('2026-11-24T08:00:00.000Z'); // 9 h pile à Paris
    expect(canCancelSlot({ now, date: '2026-11-24', half: 'AM' })).toBe(false);
  });

  it('autorise l’après-midi alors que le matin est déjà commencé', () => {
    const now = new Date('2026-11-24T10:00:00.000Z'); // 11 h à Paris
    expect(canCancelSlot({ now, date: '2026-11-24', half: 'AM' })).toBe(false);
    expect(canCancelSlot({ now, date: '2026-11-24', half: 'PM' })).toBe(true);
  });
});
