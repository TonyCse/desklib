/**
 * Données de démo « Meridia » : 2 étages, 40 postes, 5 équipes, 30 utilisateurs,
 * réservations sur les 2 semaines à venir et historique des 4 dernières semaines.
 * Rejouable : efface les données existantes. Générateur pseudo-aléatoire à graine fixe,
 * donc les données sont identiques d'un lancement à l'autre.
 *
 * Usage : npm run db:seed (depuis la racine) — ne jamais lancer en production.
 */
import { fileURLToPath } from 'node:url';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  type Role,
  type Half,
} from '../src/generated/prisma/client.js';
import {
  addDays,
  isWeekend,
  parisDateOf,
  parseIsoDate,
} from '../src/bookings/domain/booking-rules.js';

process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

const DEMO_PASSWORD = 'demo1234';
const HISTORY_DAYS = 28;
const FORWARD_DAYS = 14;
const WEEKLY_QUOTA = 3; // identique à Settings.weeklyQuota

// Générateur déterministe (mulberry32) : mêmes données à chaque seed.
function createRng(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = createRng(20261124);
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)];
const shuffle = <T>(items: readonly T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const TEAMS = [
  { name: 'Stratégie', color: '#2F6F5E' },
  { name: 'Data & IA', color: '#6B4E9B' },
  { name: 'Transformation', color: '#B5651D' },
  { name: 'Finance & Juridique', color: '#4A6785' },
  { name: 'Opérations', color: '#7A8B3A' },
] as const;

const FEATURES = [
  'Écran 27"',
  'Fenêtre',
  'Prise USB-C',
  'Hauteur réglable',
  'Calme',
  'Proche cuisine',
];

interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  team: number; // index dans TEAMS
}

const USERS: SeedUser[] = [
  {
    email: 'admin@meridia.demo',
    firstName: 'Claire',
    lastName: 'Morel',
    role: 'ADMIN',
    team: 4,
  },
  {
    email: 'manager@meridia.demo',
    firstName: 'Julien',
    lastName: 'Garnier',
    role: 'MANAGER',
    team: 0,
  },
  {
    email: 'manager.data@meridia.demo',
    firstName: 'Sophie',
    lastName: 'Lambert',
    role: 'MANAGER',
    team: 1,
  },
  {
    email: 'manager.transfo@meridia.demo',
    firstName: 'Thomas',
    lastName: 'Renaud',
    role: 'MANAGER',
    team: 2,
  },
  {
    email: 'manager.finance@meridia.demo',
    firstName: 'Nathalie',
    lastName: 'Petit',
    role: 'MANAGER',
    team: 3,
  },
  {
    email: 'manager.ops@meridia.demo',
    firstName: 'Karim',
    lastName: 'Benali',
    role: 'MANAGER',
    team: 4,
  },
  {
    email: 'salarie@meridia.demo',
    firstName: 'Antoine',
    lastName: 'Dubois',
    role: 'EMPLOYEE',
    team: 0,
  },
];

const FIRST_NAMES = [
  'Léa',
  'Hugo',
  'Camille',
  'Maxime',
  'Chloé',
  'Nicolas',
  'Manon',
  'Quentin',
  'Inès',
  'Paul',
  'Oriane',
  'Romain',
  'Émilie',
  'Baptiste',
  'Justine',
  'Adrien',
  'Lucie',
  'Théo',
  'Marion',
  'Gabriel',
  'Pauline',
  'Mathis',
  'Océane',
  'Lucas',
];
const LAST_NAMES = [
  'Martin',
  'Bernard',
  'Moreau',
  'Laurent',
  'Simon',
  'Michel',
  'Leroy',
  'Roux',
  'Fournier',
  'Girard',
  'Bonnet',
  'Lefebvre',
  'Mercier',
  'Blanc',
  'Henry',
  'Faure',
  'André',
  'Rousseau',
  'Clément',
  'Dupont',
  'Morin',
  'Gautier',
  'Perrin',
  'Chevalier',
];

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

for (let i = 0; i < FIRST_NAMES.length; i++) {
  const firstName = FIRST_NAMES[i];
  const lastName = LAST_NAMES[i];
  USERS.push({
    email: `${slugify(firstName)}.${slugify(lastName)}@meridia.demo`,
    firstName,
    lastName,
    role: 'EMPLOYEE',
    team: i % TEAMS.length,
  });
}

/** Postes : 2 étages, 2 rangées de 10 postes par étage (A01–A20 et B01–B20). */
function buildFloors() {
  const floors = [
    { name: 'Étage 1', prefix: 'A' },
    { name: 'Étage 2', prefix: 'B' },
  ];
  return floors.map((floor) => {
    const desks = Array.from({ length: 20 }, (_, index) => {
      const row = Math.floor(index / 10);
      const col = index % 10;
      return {
        label: `${floor.prefix}${String(index + 1).padStart(2, '0')}`,
        x: 60 + col * 58,
        y: row === 0 ? 120 : 320,
        width: 46,
        height: 50,
        features: [
          pick(FEATURES),
          ...(rng() > 0.5 ? [pick(FEATURES)] : []),
        ].filter((f, i, arr) => arr.indexOf(f) === i),
      };
    });
    return {
      name: floor.name,
      width: 1000,
      height: 560,
      zones: [
        {
          name: 'Open space',
          kind: 'openspace',
          x: 40,
          y: 40,
          width: 640,
          height: 480,
        },
        {
          name: 'Cuisine',
          kind: 'kitchen',
          x: 700,
          y: 40,
          width: 260,
          height: 160,
        },
        {
          name: 'Salle Lumière',
          kind: 'room',
          x: 700,
          y: 230,
          width: 120,
          height: 150,
        },
        {
          name: 'Salle Horizon',
          kind: 'room',
          x: 840,
          y: 230,
          width: 120,
          height: 150,
        },
      ],
      desks,
    };
  });
}

async function main(): Promise<void> {
  console.info('Remise à zéro des données de démo…');
  await prisma.auditLog.deleteMany();
  await prisma.bookingSlot.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.desk.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, maxAdvanceDays: 14, weeklyQuota: 3 },
    update: { maxAdvanceDays: 14, weeklyQuota: 3 },
  });

  const teams = [];
  for (const team of TEAMS) {
    teams.push(await prisma.team.create({ data: team }));
  }

  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const users = [];
  for (const user of USERS) {
    const team = teams[user.team];
    users.push(
      await prisma.user.create({
        data: {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          passwordHash,
          teamId: team?.id ?? null,
        },
      }),
    );
  }

  // Postes et règles d'équipe : A19–A20 pour Data & IA, B01–B02 pour Transformation, B20 en maintenance.
  const floorDefs = buildFloors();
  const createdDesks: {
    id: string;
    floorIndex: number;
    label: string;
    reservedTeamId: string | null;
    isActive: boolean;
  }[] = [];
  for (const [floorIndex, def] of floorDefs.entries()) {
    const floor = await prisma.floor.create({
      data: {
        name: def.name,
        width: def.width,
        height: def.height,
        zones: def.zones,
      },
    });
    for (const desk of def.desks) {
      let reservedTeamId: string | null = null;
      if (floorIndex === 0 && (desk.label === 'A19' || desk.label === 'A20')) {
        reservedTeamId = teams[1]?.id ?? null;
      }
      if (floorIndex === 1 && (desk.label === 'B01' || desk.label === 'B02')) {
        reservedTeamId = teams[2]?.id ?? null;
      }
      const isActive = desk.label !== 'B20';
      const created = await prisma.desk.create({
        data: { floorId: floor.id, ...desk, reservedTeamId, isActive },
      });
      createdDesks.push({
        id: created.id,
        floorIndex,
        label: desk.label,
        reservedTeamId,
        isActive,
      });
    }
  }

  // Historique et réservations à venir, jour par jour, sans double réservation et avec quota.
  const today = parisDateOf(new Date());
  const start = addDays(today, -HISTORY_DAYS);
  const end = addDays(today, FORWARD_DAYS);

  // Clé d'occupation : "poste|jour|demi-journée". Un poste ne peut servir qu'une fois par demi-journée.
  const occupied = new Set<string>();
  // Jours déjà pris par salarié et par semaine ISO (lundi de la semaine comme clé).
  const weekDays = new Map<string, Set<string>>();
  let bookingCount = 0;
  let cancelledCount = 0;

  const mondayOf = (isoDate: string): string => {
    const d = parseIsoDate(isoDate);
    if (!d) throw new Error(`Date invalide : ${isoDate}`);
    return addDays(isoDate, -((d.getUTCDay() || 7) - 1));
  };

  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (isWeekend(day)) continue;
    const date = parseIsoDate(day);
    if (!date) continue;
    const isPast = day < today;

    for (const user of shuffle(users)) {
      const attendance = user.role === 'EMPLOYEE' ? 0.55 : 0.6;
      if (rng() > attendance) continue;

      const weekKey = `${user.id}:${mondayOf(day)}`;
      const days = weekDays.get(weekKey) ?? new Set<string>();
      if (days.size >= WEEKLY_QUOTA && !days.has(day)) continue; // quota hebdomadaire

      const roll = rng();
      const halves: Half[] =
        roll < 0.6 ? ['AM', 'PM'] : roll < 0.8 ? ['AM'] : ['PM'];

      const candidates = shuffle(
        createdDesks.filter((desk) => {
          if (!desk.isActive) return false;
          if (desk.reservedTeamId && desk.reservedTeamId !== user.teamId)
            return false;
          return halves.every((h) => !occupied.has(`${desk.id}|${day}|${h}`));
        }),
      );
      const desk = candidates[0];
      if (!desk) continue;

      days.add(day);
      weekDays.set(weekKey, days);
      halves.forEach((h) => occupied.add(`${desk.id}|${day}|${h}`));

      // Historique : une petite part des réservations passées a été annulée.
      if (isPast && rng() < 0.06) {
        await prisma.booking.create({
          data: {
            userId: user.id,
            deskId: desk.id,
            date,
            status: 'CANCELLED',
            createdById: user.id,
          },
        });
        cancelledCount++;
        continue;
      }

      await prisma.booking.create({
        data: {
          userId: user.id,
          deskId: desk.id,
          date,
          status: 'ACTIVE',
          createdById: user.id,
          slots: {
            create: halves.map((half) => ({
              deskId: desk.id,
              userId: user.id,
              date,
              half,
            })),
          },
        },
      });
      bookingCount++;
    }
  }

  console.info(
    `Terminé : ${teams.length} équipes, ${users.length} utilisateurs, ${createdDesks.length} postes.`,
  );
  console.info(
    `Réservations : ${bookingCount} actives, ${cancelledCount} annulées (historique).`,
  );
  console.info(
    `Compte démo : mot de passe « ${DEMO_PASSWORD} » (salarie@, manager@, admin@meridia.demo).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
