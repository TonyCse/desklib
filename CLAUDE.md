# CLAUDE.md : Îlot (Desk'lib)

Outil interne de réservation de postes (flex office) pour l'entreprise fictive Meridia. Projet portfolio. Toute l'interface est en français.

## Stack

- **Monorepo** npm workspaces : `apps/web` (Angular 22), `apps/api` (NestJS 12 + Prisma 7), `packages/shared` (enums partagés).
- **Front** : Angular standalone, zoneless, signals, `@if`/`@for`, routes lazy-loadées, gardes et intercepteurs fonctionnels, Reactive Forms (Signal Forms non utilisés), Tailwind v4 (`@theme`), CDK Overlay / A11y. Aucune bibliothèque de composants.
- **API** : NestJS, Prisma avec adaptateur `@prisma/adapter-pg`, PostgreSQL 17 via docker-compose, argon2, JWT en cookie httpOnly, `class-validator` (ValidationPipe whitelist + forbidNonWhitelisted), `@nestjs/throttler`, helmet.
- **Tests** : Vitest pour l'API (règles métier en priorité), runner du CLI Angular (Vitest) pour le front.

## Commandes

| Action | Commande (racine) |
|---|---|
| Base de données | `npm run db:up` (docker compose) |
| Migrations | `npm run db:migrate` (dans `apps/api`, `prisma migrate dev`) |
| Seed Meridia | `npm run db:seed` |
| Dev front + API | `npm run dev` (proxy Angular `/api` → `localhost:3000`) |
| Tests | `npm test` |
| Lint | `npm run lint` |
| Parcours e2e | `npm run e2e` (Playwright, lance le dev) |
| Captures README | `npm run screenshots` |
| Tout comme la CI | `npm run ci` |
| Build | `npm run build` |

Node 22.22.3+ requis (Angular 22). Le `.env` est unique, à la racine (copie de `.env.example`).

## Conventions

- Dates : chaînes `YYYY-MM-DD` (jour civil). Fuseau métier : `Europe/Paris`. Créneaux : matin 9 h, après-midi 14 h.
- Règles métier dans `apps/api/src/bookings/domain/` : fonctions pures, sans Nest ni Prisma, testées en unitaire.
- Les contraintes uniques de `BookingSlot` sont la dernière barrière contre la double réservation ; les violations P2002 deviennent des erreurs métier.
- Chaque écriture admin/réservation écrit dans `AuditLog`, dans la même transaction.
- Garde globale d'auth (`AuthGuard`) : toutes les routes exigent une session, sauf `@Public()`. Contrôle de rôle via `@Roles()` côté API. Les gardes Angular ne servent qu'à l'UX.
- Pas de token dans le localStorage. `SameSite=Strict`, `httpOnly`, `Secure` en production.
- L'état d'un poste ne dépend jamais de la seule couleur : symbole + libellé + motif.
- Front : design system dans `apps/web/src/app/shared/ui`, tokens dans `apps/web/src/styles.css`.

## Décisions

- Package `@ilot/*`, dossier `Desk'lib`.
- `argon2` pour le hash des mots de passe.
- Le template Nest 12 (observabilité `@nestjs/observe`, envoi vers un service externe) a été retiré.
- Prisma client généré dans `apps/api/src/generated/prisma` (ignoré par git), en ESM.
- Limitation de débit : 10 tentatives de connexion par minute et par IP.
- Annulation : bloquée dès qu'un créneau de la réservation a commencé.
- Quota : jours distincts sur site par semaine ISO (3 par défaut).

## Périmètre actuel

Fait : connexion, layout par rôle, plan d'étage (SVG, popover CDK, vue liste), réservation avec règles, Mes réservations (annulation avec confirmation), planning d'équipe, réservation manager pour un membre, seed Meridia.

Administration : postes, règles, utilisateurs, statistiques, journal d'audit.
Qualité : test e2e Playwright du parcours réservation, CI GitHub Actions, captures README.

Reporté : déploiement (à décider ensemble), mode sombre, accessibilité poussée au-delà du MVP.
