import { describe, expect, it } from 'vitest';
import type { DeskAvailability } from '../../core/models';
import { deskState, deskSummary, halfIsFree } from './desk-status';

function desk(
  overrides: Partial<DeskAvailability> & {
    am?: DeskAvailability['halves']['AM'];
    pm?: DeskAvailability['halves']['PM'];
  } = {},
): DeskAvailability {
  return {
    id: 'd1',
    label: 'A12',
    features: [],
    isActive: true,
    reservedTeam: null,
    reservedForOtherTeam: false,
    halves: {
      AM: overrides.am ?? { status: 'FREE' },
      PM: overrides.pm ?? { status: 'FREE' },
    },
    ...overrides,
  };
}

describe('deskState', () => {
  it('est libre quand les deux demi-journées sont libres', () => {
    expect(deskState(desk())).toBe('FREE');
  });

  it('est partiellement libre quand une seule demi-journée est prise', () => {
    expect(deskState(desk({ am: { status: 'BOOKED', holder: 'Léa Martin' } }))).toBe('PARTIAL');
  });

  it('signale « mon poste » dès qu’une demi-journée est à moi', () => {
    expect(deskState(desk({ pm: { status: 'MINE', holder: 'Antoine Dubois' } }))).toBe('MINE');
  });

  it('est réservé quand les deux demi-journées sont prises par d’autres', () => {
    expect(
      deskState(
        desk({
          am: { status: 'BOOKED', holder: 'Léa Martin' },
          pm: { status: 'BOOKED', holder: 'Hugo Bernard' },
        }),
      ),
    ).toBe('BOOKED');
  });

  it('est réservé à une équipe quand il est libre mais pas pour le visiteur', () => {
    expect(deskState(desk({ reservedForOtherTeam: true }))).toBe('TEAM_RESERVED');
  });

  it('est indisponible quand il est inactif, quel que soit le reste', () => {
    expect(deskState(desk({ isActive: false }))).toBe('UNAVAILABLE');
  });
});

describe('deskSummary', () => {
  it('décrit la demi-journée libre pour le nom accessible', () => {
    expect(deskSummary(desk({ am: { status: 'BOOKED', holder: 'Léa Martin' } }))).toBe(
      'libre l’après-midi',
    );
    expect(deskSummary(desk({ pm: { status: 'BOOKED', holder: 'Léa Martin' } }))).toBe(
      'libre le matin',
    );
  });

  it('nomme l’équipe qui réserve le poste', () => {
    expect(
      deskSummary({ ...desk({ reservedForOtherTeam: true }), reservedTeamName: 'Data & IA' }),
    ).toBe('réservé à l’équipe Data & IA');
  });
});

describe('halfIsFree', () => {
  it('refuse une demi-journée sur un poste réservé à une autre équipe', () => {
    expect(halfIsFree(desk({ reservedForOtherTeam: true }), 'AM')).toBe(false);
  });

  it('accepte une demi-journée libre sur un poste actif et ouvert', () => {
    expect(halfIsFree(desk(), 'PM')).toBe(true);
  });
});
